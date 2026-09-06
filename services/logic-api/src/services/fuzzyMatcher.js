import { CATALOG_PRODUCTS } from './catalogData.js';
import { isContaminated } from './contaminationRules.js';
import { formatConfidence, CONFIDENCE_BY_SOURCE } from './confidence.js';
import { KeywordExtractor } from './keywordExtractor.js';
import { PackSelector } from './packSelector.js';
import { PenaltyRules } from './penaltyRules.js';
import { VariantOptimizer } from './variantOptimizer.js';

// Pre-index catalog products by supermarket once at startup to avoid repeated O(N) filtering in loops
const CATALOG_BY_STORE = {};
for (const p of CATALOG_PRODUCTS || []) {
  if (!CATALOG_BY_STORE[p.supermarket]) {
    CATALOG_BY_STORE[p.supermarket] = [];
  }
  CATALOG_BY_STORE[p.supermarket].push(p);
}

/**
 * Fuzzy Weight Matching and Pack Sizing Coordinator Engine
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

    // Merged candidate selection across direct/aggregator/catalog data tiers:
    const mergedCandidates = scrapedForStore.length > 0 ? scrapedForStore : catalogForStore;
    const storeProducts = mergedCandidates;

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
        ...formatConfidence(0.4, 'catalog', undefined),
        reason: 'Item not currently listed in live search results.',
        alternatives: []
      };
    }

    let effectiveItem = item;
    if (effectiveItem && effectiveItem.fatPercentage === undefined) {
      const itemText = `${effectiveItem.rawText || ''} ${effectiveItem.name || ''}`;
      if (/\b0%|\b0\s*%|\bfat\s*free\b/i.test(itemText) || (!effectiveItem.rawText && /Greek yogurt/i.test(effectiveItem.name || ''))) {
        effectiveItem = { ...effectiveItem, fatPercentage: 0 };
      }
    }

    const keywords = this.extractKeywords(effectiveItem);

    const scored = storeProducts.map((prod) => {
      const { score, packs, totalQty, totalPrice, weightDiffPct, dealApplied } =
        this.scoreCandidate(prod, effectiveItem, keywords, preferences, storeProducts);
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

    // Sort using ranking rule: live/direct precedence, brand-preference preservation,
    // and with no brand requested (or both matching brand), an exact-size pack does not beat a cheaper sufficient one
    scored.sort((a, b) => FuzzyMatcher.compareCandidates(a, b, effectiveItem, preferences));

    const best = scored[0];

    if (!best || best.score < 25) {
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
        ...formatConfidence(0.4, 'catalog', undefined),
        reason: 'Item not found in catalog; clickable live search provided.',
        alternatives: []
      };
    }

function getTitleCore(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|litre|ltr|l|ml|pints?|pt|pk|pack)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

    // Filter candidate size variants sharing the same product line and source tier as best match
    const bestTitleCore = getTitleCore(best.product.title);
    const isBestCatalog = best.product.source === 'catalog';
    const isBestLoose = /\bloose\b/i.test(best.product.title);
    const productVariants = scored
      .filter((s) => s.product && s.score >= 25 && s.product.price > 0)
      .filter((s) => {
        const isCat = s.product.source === 'catalog';
        if (isBestCatalog !== isCat) return false;
        const isCandLoose = /\bloose\b/i.test(s.product.title);
        if (isBestLoose !== isCandLoose) return false;
        if (s.product.id === best.product.id) return true;
        const sTitleCore = getTitleCore(s.product.title);
        const titleMatches = sTitleCore === bestTitleCore || (sTitleCore.length > 5 && (bestTitleCore.includes(sTitleCore) || sTitleCore.includes(bestTitleCore)));
        return titleMatches;
      })
      .map((s) => s.product);

    let chosenProduct = best.product;
    let chosenPacks = best.packs;
    let chosenTotalQty = best.totalQty;
    let chosenTotalPrice = best.totalPrice;
    let chosenWeightDiff = best.weightDiffPct;
    let chosenDealApplied = best.dealApplied;
    let lines = [{ product: best.product, packs: best.packs, subtotal: best.totalPrice }];
    let explanation = `${best.packs}x ${best.product.title}`;

    if (productVariants.length > 1) {
      const optRoute = VariantOptimizer.optimize(productVariants, item, preferences);
      if (optRoute && optRoute.lines && optRoute.lines.length > 0) {
        lines = optRoute.lines;
        explanation = optRoute.explanation;
        chosenProduct = optRoute.lines[0].product;
        chosenPacks = optRoute.lines.reduce((sum, l) => sum + l.packs, 0);

        const targetUnit = String(item.unit || '').toLowerCase();
        let totalQtyInBase = optRoute.totalQuantity;
        if (targetUnit === 'kg' || targetUnit === 'l') {
          totalQtyInBase = Math.round(optRoute.totalQuantity * 1000);
        }

        chosenTotalQty = totalQtyInBase;
        chosenTotalPrice = optRoute.totalPrice;
        chosenWeightDiff = optRoute.weightDifferencePercent;
        if (optRoute.dealApplied) {
          chosenDealApplied = {
            dealText: optRoute.dealApplied,
            originalPrice: Number((chosenProduct.price * chosenPacks).toFixed(2)),
            discountedPrice: chosenTotalPrice,
            savings: Number((chosenProduct.price * chosenPacks - chosenTotalPrice).toFixed(2)),
            effectiveUnitPrice: optRoute.effectiveUnitPrice,
            summary: optRoute.dealApplied
          };
        }
      }
    }

    const itemText = `${item.baseItem || ''} ${item.name || ''}`.toLowerCase();
    const targetNouns = keywords;

    // Filter and sanitize alternatives for the interactive Swap Picker modal
    const alternatives = scored
      .filter((s) => {
        if (!s.product || s.score < 25) return false;
        if (s.product.id === chosenProduct.id) return false;
        const prodTitle = s.product.title.toLowerCase();

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
          return targetNouns.some((n) => {
            const stem = n.endsWith('es') ? n.slice(0, -2) : (n.endsWith('s') ? n.slice(0, -1) : n);
            return prodTitle.includes(n) || (stem.length >= 3 && prodTitle.includes(stem));
          });
        }
        return true;
      })
      .slice(0, 16)
      .map((s) => s.product);

    // Weight shortfall check via PackSelector
    const weightShortfall = PackSelector.detectShortfall(item, chosenTotalQty);

    const isCatalog = chosenProduct.source === 'catalog';
    const isDirect = chosenProduct.source === 'direct';
    const confidenceSource = chosenProduct.confidenceSource || (isCatalog ? 'catalog' : (isDirect ? 'direct' : 'aggregator'));
    const defaultScore = CONFIDENCE_BY_SOURCE[confidenceSource] ?? (isCatalog ? 0.4 : 0.6);
    const confidenceScore = chosenProduct.confidenceScore !== undefined
      ? chosenProduct.confidenceScore
      : defaultScore;
    const isEstimated = isCatalog || chosenProduct.isEstimated === true;

    return {
      parsedItem: item,
      supermarket,
      product: chosenProduct,
      packsNeeded: chosenPacks,
      totalQuantity: chosenTotalQty,
      totalPrice: chosenTotalPrice,
      effectiveUnitPrice: chosenDealApplied
        ? chosenDealApplied.effectiveUnitPrice
        : chosenProduct.unitPrice,
      weightDifferencePercent: chosenWeightDiff,
      isClosestPack: Math.abs(chosenWeightDiff) < 25,
      weightShortfall,
      isEstimated,
      matchScore: best.score,
      lines,
      variantRoute: lines,
      explanation,
      routeExplanation: explanation,
      ...formatConfidence(confidenceScore, confidenceSource, chosenProduct.confidence, supermarket),
      dealApplied: chosenDealApplied || undefined,
      alternatives
    };
  }

  static scoreCandidate(prod, item, keywords, preferences = {}, _storeProducts = []) {
    return PenaltyRules.scoreCandidate(prod, item, keywords, preferences);
  }

  static calculatePacks(prod, item, preferences = {}) {
    return PackSelector.calculatePacks(prod, item, preferences);
  }

  static extractKeywords(item) {
    return KeywordExtractor.extractKeywords(item);
  }

  static isBrandNamed(brand, item = {}) {
    if (!brand || typeof brand !== 'string' || brand.length < 2) return false;
    if (item.brandPreference && item.brandPreference.toLowerCase().includes(brand.toLowerCase())) {
      return true;
    }
    const itemText = `${item.rawText || ''} ${item.name || ''}`.toLowerCase();
    const brandLower = brand.toLowerCase();
    const escaped = brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(itemText);
  }

  static compareCandidates(a, b, item = {}, _preferences = {}) {
    // 1. Live/direct products take precedence over catalog fallback when score >= 25
    const aIsCat = a.product?.source === 'catalog';
    const bIsCat = b.product?.source === 'catalog';
    if (aIsCat !== bIsCat && a.score >= 25 && b.score >= 25) {
      return aIsCat ? 1 : -1;
    }

    // 2. Ranking rule: With no brand requested (or when both candidates satisfy the requested brand),
    // an exact-size pack does not beat a cheaper sufficient one
    const aBrandNamed = a.product?.brand && this.isBrandNamed(a.product.brand, item);
    const bBrandNamed = b.product?.brand && this.isBrandNamed(b.product.brand, item);
    const brandRequested = Boolean(item.brandPreference || aBrandNamed || bBrandNamed);
    const brandSatisfied = !brandRequested || (aBrandNamed && bBrandNamed);

    if (brandSatisfied && a.score >= 50 && b.score >= 50) {
      const aSufficient = a.weightDiffPct !== undefined ? a.weightDiffPct >= 0 : (a.totalQty >= (item.targetQuantity || 1));
      const bSufficient = b.weightDiffPct !== undefined ? b.weightDiffPct >= 0 : (b.totalQty >= (item.targetQuantity || 1));

      if (aSufficient && bSufficient && Math.abs(a.score - b.score) <= 15) {
        if (a.totalPrice !== b.totalPrice) {
          return a.totalPrice - b.totalPrice;
        }
      }
    }

    // 3. Default: highest match score, then lowest total price
    return b.score - a.score || a.totalPrice - b.totalPrice;
  }
}
