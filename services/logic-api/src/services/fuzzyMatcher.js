import { CATALOG_PRODUCTS } from './catalogData.js';
import { isContaminated } from './contaminationRules.js';
import { formatConfidence, CONFIDENCE_BY_SOURCE } from './confidence.js';
import { KeywordExtractor } from './keywordExtractor.js';
import { PackSelector } from './packSelector.js';
import { PenaltyRules } from './penaltyRules.js';
import { VariantOptimizer } from './variantOptimizer.js';
import { MatchResultBuilder } from './matchResultBuilder.js';

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
      return MatchResultBuilder.buildNoMatch({
        item,
        supermarket,
        scoredCandidates: [],
        preferences,
        reason: 'Item not currently listed in live search results.'
      });
    }

    let effectiveItem = item;
    if (effectiveItem && effectiveItem.fatPercentage === undefined) {
      const itemText = `${effectiveItem.rawText || ''} ${effectiveItem.name || ''}`;
      if (/\b0%|\b0\s*%|\bfat\s*free\b/i.test(itemText) || (preferences.healthierDefault !== false && !effectiveItem.rawText && /Greek yogurt/i.test(effectiveItem.name || ''))) {
        effectiveItem = { ...effectiveItem, fatPercentage: 0 };
      }
    }

    const keywords = this.extractKeywords(effectiveItem);

    const scored = storeProducts.map((prod) => {
      const res = this.scoreCandidate(prod, effectiveItem, keywords, preferences, storeProducts);
      return {
        product: prod,
        score: res.score,
        eligible: res.eligible !== false && res.score >= 25,
        rejectionReason: res.rejectionReason || (res.score < 25 ? 'below_floor_threshold' : undefined),
        packs: res.packs,
        totalQty: res.totalQty,
        totalPrice: Number(res.totalPrice.toFixed(2)),
        weightDiffPct: res.weightDiffPct,
        dealApplied: res.dealApplied
      };
    });

    // Sort using ranking rule: live/direct precedence, brand-preference preservation,
    // and with no brand requested (or both matching brand), an exact-size pack does not beat a cheaper sufficient one
    scored.sort((a, b) => FuzzyMatcher.compareCandidates(a, b, effectiveItem, preferences));

    const best = scored[0];

    if (!best || best.score < 25 || best.eligible === false) {
      return MatchResultBuilder.buildNoMatch({
        item,
        supermarket,
        scoredCandidates: scored,
        preferences,
        reason: 'Item not found in catalog; clickable live search provided.'
      });
    }

    return MatchResultBuilder.buildMatchResult({
      item,
      supermarket,
      product: best.product,
      scoredCandidates: scored,
      preferences,
      matchScore: best.score,
      runnerUp: scored[1] || null,
      optimizeVariants: true,
      keywords
    });
  }

  static checkEligibility(prod, item, keywords = [], preferences = {}) {
    return PenaltyRules.checkEligibility(prod, item, keywords, preferences);
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
    // 0. Eligible candidates always precede ineligible ones
    const aEligible = a.eligible !== false && a.score >= 25;
    const bEligible = b.eligible !== false && b.score >= 25;
    if (aEligible !== bEligible) {
      return aEligible ? -1 : 1;
    }

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
