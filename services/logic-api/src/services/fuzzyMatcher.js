import { CATALOG_PRODUCTS } from './catalogData.js';
import { isContaminated } from './contaminationRules.js';
import { DealCalculator } from './dealCalculator.js';

// Pre-index catalog products by supermarket once at startup to avoid repeated O(N) filtering in loops
const CATALOG_BY_STORE = {};
for (const p of CATALOG_PRODUCTS || []) {
  if (!CATALOG_BY_STORE[p.supermarket]) {
    CATALOG_BY_STORE[p.supermarket] = [];
  }
  CATALOG_BY_STORE[p.supermarket].push(p);
}

/**
 * Fuzzy Weight Matching and Pack Sizing Engine
 */

export class FuzzyMatcher {
  /**
   * Find the best product match for a supermarket given a parsed shopping item
   * @param {string} supermarket - 'tesco' | 'asda' | 'sainsburys' | 'morrisons' | 'iceland' | 'aldi' | 'lidl'
   * @param {object} item - Parsed shopping list item
   * @param {Array} candidateProducts - Scraped products for this supermarket
   * @param {object} preferences - User preferences
   * @returns {object} ItemMatch
   */
  static matchProduct(supermarket, item, candidateProducts = [], preferences = {}) {
    const scrapedForStore = (candidateProducts || []).filter((p) => p.supermarket === supermarket);
    const catalogForStore = CATALOG_BY_STORE[supermarket] || [];

    // Merge scraped live products with verified baseline catalog products
    const storeProducts = [...scrapedForStore, ...catalogForStore];

    if (!storeProducts || storeProducts.length === 0) {
      return {
        parsedItem: item,
        supermarket,
        product: null,
        packsNeeded: 1,
        totalQuantity: item.targetQuantity || 1,
        totalPrice: 0,
        effectiveUnitPrice: 0,
        weightDifferencePercent: 0,
        isClosestPack: false,
        matchScore: 0,
        confidence: '80% likely (Aggregator match)',
        reason: 'Item not currently listed in live search results.',
        alternatives: []
      };
    }

    const keywords = this.extractKeywords(item);

    const scored = storeProducts.map((prod) => {
      const { score, packs, totalQty, totalPrice, weightDiffPct, dealApplied } =
        this.scoreCandidate(prod, item, keywords, preferences, storeProducts);
      return {
        product: prod,
        score,
        packs,
        totalQty,
        totalPrice: Number(totalPrice.toFixed(2)),
        weightDiffPct,
        dealApplied
      };
    });

    // Sort strictly by highest match score, then lowest total price
    scored.sort((a, b) => b.score - a.score || a.totalPrice - b.totalPrice);

    const best = scored[0];

    if (!best || best.score < 25) {
      return {
        parsedItem: item,
        supermarket,
        product: null,
        packsNeeded: 1,
        totalQuantity: item.targetQuantity,
        totalPrice: 0,
        effectiveUnitPrice: 0,
        weightDifferencePercent: 0,
        isClosestPack: false,
        matchScore: 0,
        reason: 'Item not found in catalog; clickable live search provided.',
        alternatives: []
      };
    }

    // Identify primary noun terms from search item
    const itemText = `${item.baseItem || ''} ${item.name || ''}`.toLowerCase();
    const CORE_NOUNS = [
      'milk',
      'egg',
      'eggs',
      'yogurt',
      'yoghurt',
      'lentil',
      'lentils',
      'cod',
      'salmon',
      'haddock',
      'tuna',
      'prawn',
      'prawns',
      'fish',
      'mince',
      'beef',
      'chicken',
      'pork',
      'lamb',
      'steak',
      'bacon',
      'sausage',
      'fusilli',
      'pasta',
      'penne',
      'spaghetti',
      'rice',
      'oats',
      'porridge',
      'bread',
      'loaf',
      'potato',
      'potatoes',
      'carrot',
      'carrots',
      'onion',
      'onions',
      'garlic',
      'spinach',
      'celery',
      'banana',
      'bananas',
      'pear',
      'pears',
      'clementine',
      'clementines',
      'apple',
      'apples',
      'orange',
      'oranges',
      'mushroom',
      'mushrooms',
      'pepper',
      'peppers',
      'courgette',
      'courgettes',
      'tomato',
      'tomatoes',
      'polpa',
      'puree',
      'oil',
      'olive oil',
      'walnut',
      'almond',
      'chia',
      'seed',
      'seeds',
      'cheese',
      'cheddar',
      'butter'
    ];
    const targetNouns = CORE_NOUNS.filter((n) => itemText.includes(n));

    // Filter alternatives:
    // 1. Must not be the selected best product
    // 2. Must have a valid relevance score (score >= 20)
    // 3. Must match the item's category (if specific)
    // 4. Must match at least one of the item's primary nouns
    // 5. Must not be prohibited processed food (e.g. scotch eggs, crisps)
    const alternatives = scored
      .filter((s) => s.product.id !== best.product.id)
      .filter((s) => s.score >= 20)
      .filter((s) => {
        const prodTitle = s.product.title.toLowerCase();

        // Hard negative exclusions on alternatives
        if (isContaminated(itemText, prodTitle)) {
          return false;
        }

        if (
          item.category &&
          s.product.category &&
          item.category !== 'general' &&
          s.product.category !== 'general'
        ) {
          if (item.category !== s.product.category) return false;
        }
        if (targetNouns.length > 0) {
          return targetNouns.some((n) => prodTitle.includes(n));
        }
        return true;
      })
      .slice(0, 16)
      .map((s) => s.product);

    return {
      parsedItem: item,
      supermarket,
      product: best.product,
      packsNeeded: best.packs,
      totalQuantity: best.totalQty,
      totalPrice: best.totalPrice,
      effectiveUnitPrice: best.dealApplied
        ? best.dealApplied.effectiveUnitPrice
        : best.product.unitPrice,
      weightDifferencePercent: best.weightDiffPct,
      isClosestPack: Math.abs(best.weightDiffPct) < 25,
      matchScore: best.score,
      confidence: best.product.confidence || '80% likely (Aggregator match)',
      dealApplied: best.dealApplied || undefined,
      alternatives
    };
  }

  static scoreCandidate(prod, item, keywords, preferences = {}, _storeProducts = []) {
    // 0. Hard Category Guard: Prevent Cross-Category Contamination (e.g. Bread/Fruit matching Fish)
    // Only enforce when both item and product have specific non-general categories
    if (
      item.category &&
      prod.category &&
      item.category !== 'general' &&
      prod.category !== 'general' &&
      item.category !== prod.category
    ) {
      return { score: -500, packs: 1, totalQty: 1, totalPrice: 0, weightDiffPct: 0 };
    }

    let score = 0;
    const titleLower = prod.title.toLowerCase();
    const itemLower = (item.name || '').toLowerCase();

    // 1. Semantic Cut & Form Flexibility (Respecting user cutMatchingStrategy setting)
    const isStrictCut = preferences.cutMatchingStrategy === 'strict_cut';
    const FISH_CUT_TERMS = [
      'loin',
      'loins',
      'fillet',
      'fillets',
      'portion',
      'portions',
      'steak',
      'steaks'
    ];
    const MEAT_CUT_TERMS = [
      'mince',
      'minced',
      'steak mince',
      'breast',
      'breasts',
      'diced',
      'chops'
    ];

    let effectiveTitle = titleLower;
    if (!isStrictCut) {
      // Best Value mode: expand cuts so equivalent forms compete for lowest price
      if (item.category === 'fish') {
        const hasFishCut = FISH_CUT_TERMS.some((cut) => titleLower.includes(cut));
        if (hasFishCut) {
          effectiveTitle += ' loin loins fillet fillets portion portions';
        }
      }
      if (item.category === 'meat') {
        const hasMeatCut = MEAT_CUT_TERMS.some((cut) => titleLower.includes(cut));
        if (hasMeatCut) {
          effectiveTitle += ' mince minced steak breast fillets';
        }
      }
    } else {
      // Strict Cut mode: penalize if requested cut is missing from title
      if (itemLower.includes('loin') && !titleLower.includes('loin')) score -= 50;
      if (itemLower.includes('fillet') && !titleLower.includes('fillet')) score -= 50;
      if (itemLower.includes('breast') && !titleLower.includes('breast')) score -= 50;
      if (itemLower.includes('thigh') && !titleLower.includes('thigh')) score -= 50;
    }

    const effectiveAttributes = `${effectiveTitle} ${prod.fatPercentage !== undefined ? `${prod.fatPercentage} ${prod.fatPercentage}% lean fat` : ''} ${prod.isFrozen ? 'frozen' : 'fresh'} ${prod.isOrganic ? 'organic' : ''}`;
    const matchCount = keywords.filter((kw) => effectiveAttributes.includes(kw)).length;

    // If absolutely zero keywords match the product title/attributes, heavily penalize to prevent size/tier leakage
    if (matchCount === 0) {
      return { score: -200, packs: 1, totalQty: 1, totalPrice: 0, weightDiffPct: 0 };
    }

    const textScore = keywords.length > 0 ? (matchCount / keywords.length) * 60 : 0;
    score += textScore;

    // 2. Brand Preference Match
    if (
      item.brandPreference &&
      prod.brand.toLowerCase().includes(item.brandPreference.toLowerCase())
    ) {
      score += 40;
    }

    // Exact species/ingredient enforcement:
    // If cod requested, penalize haddock, pollock, salmon, basa
    if (itemLower.includes('cod') && !titleLower.includes('cod')) {
      score -= 80;
    }
    // If beef requested, penalize pork, turkey, lamb, chicken
    if (itemLower.includes('beef') && !titleLower.includes('beef')) {
      score -= 80;
    }

    // Supplements / Vitamins / Oil / Pet Food penalties
    const isSupplementOrOil =
      titleLower.includes('liver oil') ||
      titleLower.includes('multivitamins') ||
      titleLower.includes('supplements') ||
      titleLower.includes('capsules') ||
      titleLower.includes('tablets') ||
      titleLower.includes('in sauce') ||
      titleLower.includes('parsley sauce') ||
      titleLower.includes('butter sauce');
    const isExplicitlyRequestedSupplement =
      itemLower.includes('oil') ||
      itemLower.includes('vitamin') ||
      itemLower.includes('supplement') ||
      itemLower.includes('sauce');
    if (isSupplementOrOil && !isExplicitlyRequestedSupplement) {
      score -= 150; // Completely exclude vitamins/supplements/sauced ready meals from plain staple matches
    }

    // Processed / Breaded / Fish Fingers / Battered penalties for plain staples
    const isProcessedOrBreaded =
      titleLower.includes('finger') ||
      titleLower.includes('fish finger') ||
      titleLower.includes('battered') ||
      titleLower.includes('breaded') ||
      titleLower.includes('crumbed') ||
      titleLower.includes('fish cake') ||
      titleLower.includes('fishcake');
    const isExplicitlyBreaded =
      itemLower.includes('finger') ||
      itemLower.includes('breaded') ||
      itemLower.includes('battered');
    if (isProcessedOrBreaded && !isExplicitlyBreaded) {
      score -= 80; // Heavy penalty on fish fingers / battered fish when plain fish was requested
    }

    // Breaded / seasoned / sauce / ready-meal penalties for plain staples
    const isReadyMealOrGravy =
      titleLower.includes('gravy') ||
      titleLower.includes('in gravy') ||
      titleLower.includes('& gravy') ||
      titleLower.includes('and gravy') ||
      titleLower.includes('ready meal') ||
      titleLower.includes('meal for one') ||
      titleLower.includes('hotpot') ||
      titleLower.includes('lasagne') ||
      titleLower.includes('lasagna') ||
      titleLower.includes('cottage pie') ||
      titleLower.includes('shepherd') ||
      titleLower.includes('pasta bake') ||
      titleLower.includes('chilli con carne') ||
      titleLower.includes('bolognese ready') ||
      titleLower.includes('casserole') ||
      titleLower.includes('stew') ||
      titleLower.includes('pet food') ||
      titleLower.includes('cat food') ||
      titleLower.includes('dog food') ||
      titleLower.includes('pie');

    const isExplicitlyRequestedReadyMeal =
      itemLower.includes('gravy') ||
      itemLower.includes('ready meal') ||
      itemLower.includes('hotpot') ||
      itemLower.includes('lasagne') ||
      itemLower.includes('pie') ||
      itemLower.includes('stew');

    if (isReadyMealOrGravy && !isExplicitlyRequestedReadyMeal) {
      score -= 250; // Completely exclude ready meals/gravy cans from raw staple matches
    }

    // Specific cross-species & processed snack exclusions for staples
    if (isContaminated(itemLower, titleLower)) {
      score -= 500;
    }

    if (
      !itemLower.includes('breaded') &&
      (titleLower.includes('breaded') ||
        titleLower.includes('battered') ||
        titleLower.includes('crumbed'))
    ) {
      score -= 35;
    }
    if (
      !itemLower.includes('butter') &&
      (titleLower.includes('butter') ||
        titleLower.includes('seasoned') ||
        titleLower.includes('marinade'))
    ) {
      score -= 30;
    }

    // 3. Health & Dietary Preferences
    if (preferences.healthierDefault || item.isHealthierPreferred) {
      if (item.fatPercentage !== undefined) {
        if (prod.fatPercentage === item.fatPercentage) {
          score += 35;
        } else if (prod.fatPercentage !== undefined && prod.fatPercentage <= item.fatPercentage) {
          score += 25;
        } else {
          score -= 20;
        }
      }

      if (item.isWholewheat && prod.isWholewheat) score += 30;
      if (item.isFreeRange && prod.isFreeRange) score += 30;
      if (item.isOrganic && prod.isOrganic) score += 30;
    }

    // 4. Brand Tier Priority
    if (preferences.brandTierPriority && prod.tier === preferences.brandTierPriority) {
      score += 25;
    } else if (prod.tier === 'standard' || prod.tier === 'value') {
      score += 25;
    } else if (prod.tier === 'premium') {
      score -= 30;
    }

    // Fresh vs Frozen matching
    const isFrozenRequested = itemLower.includes('frozen');
    if (!isFrozenRequested && (prod.isFrozen || titleLower.includes('frozen'))) {
      score -= 5; // Minimal nudge so fresh is default #1 match, but frozen options are listed in candidate alternatives!
    }
    if (isFrozenRequested && (prod.isFrozen || titleLower.includes('frozen'))) {
      score += 30; // Boost frozen products when frozen is specifically requested
    }

    // 5. Pack Sizing & Weight Distance
    const { packs, totalQty, totalPrice, weightDiffPct } = this.calculatePacks(
      prod,
      item,
      preferences
    );

    const absDiff = Math.abs(weightDiffPct);
    const distanceScore = Math.max(-10, Math.round(30 - absDiff * 0.8));
    score += distanceScore;

    // Deficit penalty: Under-delivering recipe target (e.g. 750g for 900g = -16.7%) is penalized (-30)
    // ensuring shoppers receive enough ingredients (preferring 1000g / 1kg via 1x1kg or 2x500g)
    if (weightDiffPct < -10) {
      score -= 30;
    }

    // Prefer standard single pack sizes (e.g. 1kg or 750g) over buying many small packs
    if (packs === 1) {
      score += 20; // Prefer single pack fulfillment (e.g. 1 x 1kg @ £9.25) over buying multiple small packs (2 x 500g @ £10.30)
    } else if (packs === 2) {
      score += 5;
    } else if (packs > 2 && !item.multiplier) {
      score -= (packs - 1) * 15;
    }

    return { score, packs, totalQty, totalPrice, weightDiffPct };
  }

  static calculatePacks(prod, item, preferences = {}) {
    let targetAmount = item.targetQuantity || 1;
    let prodAmount = prod.packageSize || 1;

    // Unit compatibility conversions
    if (item.unit === 'kg') targetAmount *= 1000;
    if (item.unit === 'l') targetAmount *= 1000;
    if (item.unit === 'pints' || item.unit === 'pint') targetAmount *= 568;

    if (prod.packageUnit === 'kg') prodAmount *= 1000;
    if (prod.packageUnit === 'l') prodAmount *= 1000;

    // Fallback if product unit was unspecified / 1 item
    if ((item.unit === 'g' || item.unit === 'kg') && prodAmount <= 1) {
      prodAmount = 500;
    }
    if ((item.unit === 'l' || item.unit === 'ml' || item.unit === 'pints') && prodAmount <= 1) {
      prodAmount = 1000;
    }

    const ratio = targetAmount / (prodAmount || 1);
    let packs;
    const policy = preferences.packSizingPolicy || 'closest';

    if (policy === 'cover') {
      if (ratio <= 1.25) {
        packs = 1;
      } else {
        packs = Math.max(1, Math.ceil(ratio));
      }
    } else {
      // If target is 850g-1000g and product is 500g, 2 packs provides 1000g (1kg)
      if (targetAmount >= 850 && targetAmount <= 1000 && prodAmount === 500) {
        packs = 2;
      } else {
        const lower = Math.max(1, Math.floor(ratio));
        const higher = Math.ceil(ratio);

        const diffLower = Math.abs(lower * prodAmount - targetAmount);
        const diffHigher = Math.abs(higher * prodAmount - targetAmount);

        packs = diffLower <= diffHigher ? lower : higher;
      }
    }

    // Safeguard: packs should never exceed a realistic grocery count (e.g. max 12)
    packs = Math.min(packs, 12);

    const totalQty = packs * prodAmount;
    let totalPrice = Number((packs * (prod.clubcardPrice || prod.price)).toFixed(2));
    let dealApplied = undefined;

    if (prod.deal) {
      const dealCalc = DealCalculator.calculateDealPrice(
        prod.clubcardPrice || prod.price,
        packs,
        prod.deal
      );
      if (dealCalc.isDealApplied) {
        totalPrice = dealCalc.totalPrice;
        dealApplied = {
          dealText: prod.deal.badge || prod.deal.rawText,
          originalPrice: dealCalc.standardPrice,
          discountedPrice: dealCalc.totalPrice,
          savings: dealCalc.savings,
          effectiveUnitPrice: dealCalc.effectiveUnitPrice,
          summary: dealCalc.dealSummary
        };
      }
    }

    const weightDiffPct = Math.round(((totalQty - targetAmount) / (targetAmount || 1)) * 100);

    return { packs, totalQty, totalPrice, weightDiffPct, dealApplied };
  }

  static extractKeywords(item) {
    const raw =
      `${item.baseItem || ''} ${item.name || ''} ${item.brandPreference || ''}`.toLowerCase();
    const clean = raw
      .replace(/[^\w\s]/g, ' ')
      .replace(
        /\b(approx|fresh|sliced|tinned|frozen|natural|pack|packs|head|bunch|tin|tins|bulbs?|loaves|loaf|whole|halves|piece|pieces|portion|portions|target|item|items|mix)\b/g,
        ''
      )
      .trim();

    return clean.split(/\s+/).filter((k) => k.length > 1);
  }
}
