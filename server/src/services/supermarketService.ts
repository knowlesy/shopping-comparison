import {
  SupermarketName,
  ParsedItem,
  SupermarketProduct,
  ItemMatch,
  StoreBasketResult,
  ComparisonResponse,
  UserPreferences,
  SplitBasketOptimization,
  SplitBasketStore,
} from '../types.js';
import { CATALOG_PRODUCTS, SUPERMARKETS_INFO } from './catalogData.js';

export class SupermarketComparisonService {
  private static defaultPreferences: UserPreferences = {
    healthierDefault: true,
    fatPercentagePreference: 5,
    preferWholewheat: true,
    preferFreeRange: true,
    preferOrganic: false,
    brandTierPriority: 'standard',
    packSizingPolicy: 'closest',
    enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'],
  };

  /**
   * Run full comparison across all enabled supermarkets for a list of parsed items
   */
  public static compare(
    items: ParsedItem[],
    preferences: UserPreferences = this.defaultPreferences
  ): ComparisonResponse {
    const enabledStores = preferences.enabledSupermarkets.length > 0
      ? preferences.enabledSupermarkets
      : (['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'] as SupermarketName[]);

    const storeResults: Record<SupermarketName, StoreBasketResult> = {} as any;

    for (const store of enabledStores) {
      storeResults[store] = this.evaluateStoreBasket(store, items, preferences);
    }

    // Rank stores by item coverage first, then lowest total price (stores with 0 items cannot be cheapest)
    const storesWithItems = Object.values(storeResults).filter(s => s.itemsFound > 0);
    const rankedStores = storesWithItems.length > 0
      ? [...storesWithItems].sort((a, b) => (b.itemsFound - a.itemsFound) || (a.totalPrice - b.totalPrice))
      : Object.values(storeResults);

    const cheapestStore = rankedStores[0]?.supermarket || 'asda';
    const highestStore = rankedStores[rankedStores.length - 1]?.supermarket || 'tesco';

    // Set badges and savings vs highest
    const highestTotal = rankedStores[rankedStores.length - 1]?.totalPrice || 0;
    for (const storeRes of Object.values(storeResults)) {
      storeRes.isCheapest = storeRes.itemsFound > 0 && storeRes.supermarket === cheapestStore;
      storeRes.savingsVsHighest = storeRes.itemsFound > 0 ? Math.max(0, Number((highestTotal - storeRes.totalPrice).toFixed(2))) : 0;
      if (storeRes.isCheapest) {
        storeRes.badge = '🏆 Cheapest Overall';
      }
    }

    // Calculate Split-basket optimization
    const splitOptimization = this.calculateSplitBasket(items, storeResults, cheapestStore);

    return {
      parsedItems: items,
      supermarkets: storeResults,
      cheapestStore,
      highestStore,
      splitOptimization,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Evaluate basket for a single supermarket
   */
  private static evaluateStoreBasket(
    store: SupermarketName,
    items: ParsedItem[],
    preferences: UserPreferences
  ): StoreBasketResult {
    const storeInfo = SUPERMARKETS_INFO[store];
    const itemMatches: ItemMatch[] = [];
    const missingItems: ParsedItem[] = [];
    let subtotal = 0;
    let totalHealthScore = 0;

    for (const item of items) {
      const match = this.findBestProductMatch(store, item, preferences);
      itemMatches.push(match);

      if (match.product) {
        subtotal += match.totalPrice;
        if (match.product.isHealthier) totalHealthScore += 1;
      } else {
        missingItems.push(item);
      }
    }

    subtotal = Number(subtotal.toFixed(2));
    const deliveryFee = subtotal >= storeInfo.deliveryMinOrder ? 0 : storeInfo.deliveryFee;
    const totalPrice = Number((subtotal + deliveryFee).toFixed(2));

    return {
      supermarket: store,
      info: storeInfo,
      items: itemMatches,
      subtotal,
      deliveryFee,
      totalPrice,
      savingsVsHighest: 0,
      itemsFound: items.length - missingItems.length,
      itemsTotal: items.length,
      missingItems,
      isCheapest: false,
      averageHealthScore: items.length > 0 ? Math.round((totalHealthScore / items.length) * 100) : 0,
    };
  }

  /**
   * Find best product match for an item in a specific supermarket
   */
  public static findBestProductMatch(
    store: SupermarketName,
    item: ParsedItem,
    preferences: UserPreferences
  ): ItemMatch {
    const storeProducts = CATALOG_PRODUCTS.filter(p => p.supermarket === store);
    const keywords = this.extractKeywords(item);

    // Score all candidates
    const scoredCandidates: Array<{ product: SupermarketProduct; score: number; packs: number; totalQty: number; totalPrice: number; weightDiffPct: number }> = [];

    for (const prod of storeProducts) {
      const { score, packs, totalQty, totalPrice, weightDiffPct } = this.scoreProduct(prod, item, keywords, preferences);
      if (score > 20) {
        scoredCandidates.push({ product: prod, score, packs, totalQty, totalPrice, weightDiffPct });
      }
    }

    // Sort by highest score, then lowest total price
    scoredCandidates.sort((a, b) => b.score - a.score || a.totalPrice - b.totalPrice);

    if (scoredCandidates.length === 0) {
      // Fallback: Generate dynamic fallback product with active search URL
      const fallbackUrl = `${SUPERMARKETS_INFO[store].searchBaseUrl}${encodeURIComponent(item.name)}`;
      return {
        parsedItem: item,
        supermarket: store,
        product: null,
        packsNeeded: 1,
        totalQuantity: item.targetQuantity,
        totalPrice: 0,
        effectiveUnitPrice: 0,
        weightDifferencePercent: 0,
        isClosestPack: false,
        matchScore: 0,
        reason: 'Item not found in catalog; clickable live search provided.',
      };
    }

    const best = scoredCandidates[0];
    const alternatives = scoredCandidates.slice(1, 6).map(c => c.product);

    return {
      parsedItem: item,
      supermarket: store,
      product: best.product,
      packsNeeded: best.packs,
      totalQuantity: best.totalQty,
      totalPrice: Number(best.totalPrice.toFixed(2)),
      effectiveUnitPrice: best.product.unitPrice,
      weightDifferencePercent: best.weightDiffPct,
      isClosestPack: true,
      matchScore: best.score,
      alternatives,
    };
  }

  /**
   * Get all alternative products for manual swapping in the UI
   */
  public static getAlternatives(store: SupermarketName, itemRawText: string): SupermarketProduct[] {
    const item = { rawText: itemRawText, name: itemRawText, baseItem: itemRawText, targetQuantity: 1, unit: 'item', category: 'general', id: 'temp' };
    const keywords = this.extractKeywords(item);
    const storeProducts = CATALOG_PRODUCTS.filter(p => p.supermarket === store);

    return storeProducts
      .map(prod => ({
        prod,
        score: this.computeTextRelevance(prod.title + ' ' + prod.category + ' ' + (prod.subCategory || ''), keywords),
      }))
      .filter(item => item.score > 20)
      .sort((a, b) => b.score - a.score)
      .map(item => item.prod);
  }

  /**
   * Score a product against the requested item
   */
  private static scoreProduct(
    prod: SupermarketProduct,
    item: ParsedItem,
    keywords: string[],
    preferences: UserPreferences
  ) {
    let score = 0;
    const titleLower = prod.title.toLowerCase();

    // 1. Text Relevance
    const textScore = this.computeTextRelevance(titleLower + ' ' + prod.category + ' ' + (prod.subCategory || ''), keywords);
    score += textScore * 2;

    // 2. Brand matching
    if (item.brandPreference && prod.brand.toLowerCase().includes(item.brandPreference.toLowerCase())) {
      score += 40;
    }

    // 3. Health & Preferences Biasing
    if (preferences.healthierDefault || item.isHealthierPreferred) {
      if (item.fatPercentage !== undefined) {
        if (prod.fatPercentage === item.fatPercentage) {
          score += 35;
        } else if (prod.fatPercentage !== undefined && prod.fatPercentage <= item.fatPercentage) {
          score += 25;
        } else {
          score -= 20; // penalize high fat when user requested lean
        }
      }

      if (item.isWholewheat && prod.isWholewheat) {
        score += 30;
      }
      if (item.isFreeRange && prod.isFreeRange) {
        score += 30;
      }
      if (item.isOrganic && prod.isOrganic) {
        score += 30;
      }
    }

    // 4. Brand Tier Preference
    if (preferences.brandTierPriority === 'value' && prod.tier === 'value') score += 20;
    if (preferences.brandTierPriority === 'premium' && prod.tier === 'premium') score += 20;
    if (preferences.brandTierPriority === 'branded' && prod.tier === 'branded') score += 20;

    // 5. Pack Sizing Calculation
    const { packs, totalQty, totalPrice, weightDiffPct } = this.calculatePacks(prod, item, preferences);

    // Reward closest pack sizing
    const sizeDistance = Math.abs(weightDiffPct);
    if (sizeDistance < 10) score += 25;
    else if (sizeDistance < 25) score += 15;
    else if (sizeDistance < 50) score += 5;
    else score -= 10;

    return { score, packs, totalQty, totalPrice, weightDiffPct };
  }

  /**
   * Calculate packs needed to meet or approximate target quantity
   */
  private static calculatePacks(
    prod: SupermarketProduct,
    item: ParsedItem,
    preferences: UserPreferences
  ) {
    // Standardize units to grams or ml
    let targetAmount = item.targetQuantity;
    let prodAmount = prod.packageSize;

    if (item.unit === 'kg') targetAmount *= 1000;
    if (item.unit === 'l') targetAmount *= 1000;

    let packs = 1;
    if (preferences.packSizingPolicy === 'cover') {
      packs = Math.ceil(targetAmount / prodAmount);
    } else {
      // Closest match: e.g. 900g target with 500g packs -> 2 packs = 1000g (+11%) is closer than 1 pack = 500g (-44%)
      // If 750g pack -> 1 pack = 750g (-16%) vs 2 packs = 1500g (+66%) -> 1 pack is chosen!
      const exactPacks = targetAmount / prodAmount;
      const lowerPacks = Math.max(1, Math.floor(exactPacks));
      const higherPacks = Math.ceil(exactPacks);

      const diffLower = Math.abs(lowerPacks * prodAmount - targetAmount);
      const diffHigher = Math.abs(higherPacks * prodAmount - targetAmount);

      packs = diffLower <= diffHigher ? lowerPacks : higherPacks;
    }

    const totalQty = packs * prod.packageSize;
    const totalPrice = Number((packs * (prod.clubcardPrice || prod.price)).toFixed(2));
    const weightDiffPct = Math.round(((totalQty - targetAmount) / (targetAmount || 1)) * 100);

    return { packs, totalQty, totalPrice, weightDiffPct };
  }

  /**
   * Keyword extraction from parsed item
   */
  private static extractKeywords(item: ParsedItem): string[] {
    const raw = (item.baseItem + ' ' + (item.brandPreference || '')).toLowerCase();
    const clean = raw
      .replace(/[^\w\s]/g, ' ')
      .replace(/\b(approx|fresh|sliced|tinned|frozen|natural|pack|packs|head|bunch|tin|tins|bulbs?|loaves|loaf)\b/g, '')
      .trim();

    return clean.split(/\s+/).filter(k => k.length > 1);
  }

  /**
   * Match relevance calculation
   */
  private static computeTextRelevance(text: string, keywords: string[]): number {
    let matchCount = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        matchCount += 1;
      }
    }
    return keywords.length > 0 ? (matchCount / keywords.length) * 50 : 0;
  }

  /**
   * Multi-store split basket calculation
   */
  private static calculateSplitBasket(
    items: ParsedItem[],
    storeResults: Record<SupermarketName, StoreBasketResult>,
    cheapestSingleStore: SupermarketName
  ): SplitBasketOptimization {
    const storeSubtotals: Record<string, { items: ItemMatch[]; subtotal: number }> = {};
    for (const key of Object.keys(storeResults)) {
      storeSubtotals[key] = { items: [], subtotal: 0 };
    }

    // For each item, find which store has the absolute lowest price
    for (let i = 0; i < items.length; i++) {
      let lowestItemPrice = Infinity;
      let bestStoreForThisItem: SupermarketName | null = null;
      let bestMatch: ItemMatch | null = null;

      for (const [storeKey, storeResult] of Object.entries(storeResults)) {
        const match = storeResult.items[i];
        if (match && match.product && match.totalPrice < lowestItemPrice) {
          lowestItemPrice = match.totalPrice;
          bestStoreForThisItem = storeKey as SupermarketName;
          bestMatch = match;
        }
      }

      if (bestStoreForThisItem && bestMatch) {
        storeSubtotals[bestStoreForThisItem].items.push(bestMatch);
        storeSubtotals[bestStoreForThisItem].subtotal += bestMatch.totalPrice;
      }
    }

    // Filter to stores that have items assigned
    const activeStores: SplitBasketStore[] = Object.entries(storeSubtotals)
      .filter(([_, data]) => data.items.length > 0)
      .map(([storeKey, data]) => ({
        supermarket: storeKey as SupermarketName,
        info: SUPERMARKETS_INFO[storeKey],
        items: data.items,
        storeSubtotal: Number(data.subtotal.toFixed(2)),
      }))
      .sort((a, b) => b.items.length - a.items.length);

    const combinedTotal = Number(activeStores.reduce((sum, s) => sum + s.storeSubtotal, 0).toFixed(2));
    const singleBestTotal = storeResults[cheapestSingleStore]?.totalPrice || combinedTotal;
    const savingsVsSingleBest = Math.max(0, Number((singleBestTotal - combinedTotal).toFixed(2)));

    const topStoreNames = activeStores.slice(0, 2).map(s => s.info.name).join(' & ');
    const explanation = activeStores.length > 1
      ? `Splitting your shop between ${topStoreNames} saves an extra £${savingsVsSingleBest.toFixed(2)} compared to single-store checkout at ${SUPERMARKETS_INFO[cheapestSingleStore].name}.`
      : `Single-store checkout at ${SUPERMARKETS_INFO[cheapestSingleStore].name} already delivers the best price.`;

    return {
      stores: activeStores,
      combinedTotal,
      savingsVsSingleBest,
      cheapestSingleStoreName: SUPERMARKETS_INFO[cheapestSingleStore]?.name || 'Cheapest Store',
      explanation,
    };
  }
}
