import { CATALOG_PRODUCTS } from './catalogData.js';
import { isContaminated } from './contaminationRules.js';
import { formatConfidence, CONFIDENCE_BY_SOURCE } from './confidence.js';
import { KeywordExtractor } from './keywordExtractor.js';
import { PackSelector } from './packSelector.js';
import { PenaltyRules } from './penaltyRules.js';

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
        ...formatConfidence(0.4, 'catalog', undefined),
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

    const itemText = `${item.baseItem || ''} ${item.name || ''}`.toLowerCase();
    const targetNouns = keywords;

    // Filter and sanitize alternatives for the interactive Swap Picker modal
    const alternatives = scored
      .filter((s) => {
        if (!s.product || s.score < 25) return false;
        if (s.product.id === best.product.id) return false;
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
    const weightShortfall = PackSelector.detectShortfall(item, best.totalQty);

    const isCatalog = best.product.source === 'catalog';
    const isDirect = best.product.source === 'direct';
    const confidenceSource = best.product.confidenceSource || (isCatalog ? 'catalog' : (isDirect ? 'direct' : 'aggregator'));
    const defaultScore = CONFIDENCE_BY_SOURCE[confidenceSource] ?? (isCatalog ? 0.4 : 0.6);
    const confidenceScore = best.product.confidenceScore !== undefined
      ? best.product.confidenceScore
      : defaultScore;
    const isEstimated = isCatalog || best.product.isEstimated === true;

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
      weightShortfall,
      isEstimated,
      matchScore: best.score,
      ...formatConfidence(confidenceScore, confidenceSource, best.product.confidence, supermarket),
      dealApplied: best.dealApplied || undefined,
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
}
