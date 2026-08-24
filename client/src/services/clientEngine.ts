import {
  ParsedItem,
  SupermarketProduct,
  ItemMatch,
  StoreBasketResult,
  ComparisonResponse,
  UserPreferences,
  SupermarketName,
  SplitBasketOptimization,
  SplitBasketStore,
} from '../types';
import { CATALOG_PRODUCTS, SUPERMARKETS_INFO, DEFAULT_INGREDIENT_IDEAS } from '../../../server/src/services/catalogData';

export { CATALOG_PRODUCTS, SUPERMARKETS_INFO, DEFAULT_INGREDIENT_IDEAS };

export function extractSearchQuery(text: string): string {
  let clean = text
    .replace(/\(.*?\)/g, '')
    .replace(/\b(asda|tesco|sainsbury'?s?|morrisons?|iceland|just essentials|by sainsbury'?s?|british|scottish|succulent|crisp|sweet|crunchy|fresh|organic|authentic|medium|sliced|fine|double concentrate)\b/gi, '')
    .replace(/\b\d+\s*(?:kg|g|l|lt|ml|pk|pack|heads?|bunches?|tins?|pots?|bottles?|loaves|loaf|pints?)\b/gi, '')
    .replace(/\b\d+%\s*(?:fat|lean)?\b/gi, '')
    .replace(/['’]/g, '')
    .replace(/%/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 3) {
    clean = text.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return clean;
}

export function getLiveSupermarketUrl(supermarket: SupermarketName, title: string, productUrl?: string): string {
  // If productUrl is a verified modern direct link, use it
  if (
    productUrl &&
    (productUrl.startsWith('https://www.asda.com/groceries/product/') ||
     productUrl.startsWith('https://www.sainsburys.co.uk/gol-ui/product/') ||
     productUrl.startsWith('https://www.tesco.com/groceries/en-GB/products/') ||
     productUrl.startsWith('https://www.tesco.com/groceries/en-GB/shop/') ||
     productUrl.startsWith('https://groceries.morrisons.com/browse/') ||
     productUrl.startsWith('https://groceries.morrisons.com/products/') ||
     productUrl.startsWith('https://www.iceland.co.uk/p/')) &&
    !productUrl.includes('91000') &&
    !productUrl.includes('1000185923841')
  ) {
    return productUrl;
  }

  const clean = extractSearchQuery(title);
  const enc = encodeURIComponent(clean);
  const plusEnc = enc.replace(/%20/g, '+');

  switch (supermarket) {
    case 'asda':
      return `https://www.asda.com/groceries/search/${enc}`;
    case 'tesco':
      return `https://www.tesco.com/groceries/en-GB/search?query=${plusEnc}`;
    case 'sainsburys':
      return `https://www.sainsburys.co.uk/gol-ui/SearchResults/${enc}`;
    case 'morrisons':
      return `https://groceries.morrisons.com/search?entry=${enc}`;
    case 'iceland':
      return `https://www.iceland.co.uk/search?q=${plusEnc}`;
    case 'waitrose':
      return `https://www.waitrose.com/ecom/shop/search?&searchTerm=${enc}`;
    case 'ocado':
      return `https://www.ocado.com/search?entry=${enc}`;
    case 'coop':
      return `https://www.coop.co.uk/search?q=${plusEnc}`;
    case 'aldi':
      return `https://groceries.aldi.co.uk/en-GB/Search?keywords=${enc}`;
    case 'lidl':
      return `https://www.lidl.co.uk/search?query=${plusEnc}`;
    default:
      return `https://www.google.co.uk/search?q=${plusEnc}+${supermarket}`;
  }
}

export class ClientShoppingParser {
  public static parse(rawInput: string): ParsedItem[] {
    if (!rawInput || typeof rawInput !== 'string') return [];

    const lines = rawInput
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

    return lines.map((line, index) => this.parseLine(line, `item-${Date.now()}-${index}`));
  }

  public static parseLine(line: string, id?: string): ParsedItem {
    const rawText = line.trim();
    let text = rawText;

    // Remove leading bullet points, numbered lists, checkboxes (e.g. "1. ", "1) ", "- ", "* ", "• ", "- [ ] ", "- [x] ", "[x] ")
    const detectCategory = (str: string): string => {
      const lower = str.toLowerCase();
      if (/\b(?:beef|mince|chicken|pork|lamb|steak|bacon|sausage|meat|turkey|duck|gammon|veal|burgers?|meatballs?)\b/i.test(lower)) return 'meat';
      if (/\b(?:cod|salmon|haddock|tuna|prawn|prawns|fish|seafood|trout|mackerel|sea bass|pollock|basa)\b/i.test(lower)) return 'fish';
      if (/\b(?:milk|yogurt|yoghurt|cheese|egg|eggs|butter|cream|cheddar|dairy)\b/i.test(lower)) return 'dairy-eggs';
      if (/\b(?:potato|potatoes|carrot|carrots|onion|onions|garlic|courgette|pepper|peppers|mushroom|mushrooms|tomato|tomatoes|spinach|apple|apples|banana|bananas|orange|oranges|berry|berries|lettuce|cucumber|salad|vegetables?|fruits?)\b/i.test(lower)) return 'produce';
      if (/\b(?:pasta|fusilli|penne|spaghetti|rice|oat|oats|porridge|lentil|lentils|chia|walnut|walnuts|flour|sugar|oil|olive oil|salt|sauce|tin|tins|tinned|can|canned|beans|passata|puree|noodles?)\b/i.test(lower)) return 'pantry';
      if (/\b(?:bread|loaf|loaves|roll|rolls|bagel|bagels|pitta|wrap|wraps|bakery|croissant|muffin)\b/i.test(lower)) return 'bakery';
      return 'general';
    };

    const parsed: ParsedItem = {
      id: id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      rawText,
      name: text,
      baseItem: text,
      category: detectCategory(text),
      targetQuantity: 1,
      unit: 'item',
      checked: false,
      dietaryNotes: [],
    };

    // Brand Preferences
    const brands = ['Mutti Polpa', 'Mutti', 'Fairy', 'Flash', 'Warburtons', 'Hovis', 'Lurpak', 'Napolina', 'Quaker', 'Filippo Berio', 'Dettol', 'Andrex'];
    for (const brand of brands) {
      const regex = new RegExp(`\\b${brand}\\b`, 'i');
      if (regex.test(text)) {
        parsed.brandPreference = brand;
        break;
      }
    }

    // Health / Dietary Attributes
    const fatMatch = text.match(/(\d+)%\s*(?:lean|fat)?/i);
    if (fatMatch) {
      parsed.fatPercentage = parseInt(fatMatch[1], 10);
      if (parsed.fatPercentage <= 5) {
        parsed.isHealthierPreferred = true;
        parsed.dietaryNotes?.push(`${parsed.fatPercentage}% Low Fat`);
      }
    }

    if (/\b(?:lean|extra lean)\b/i.test(text)) {
      parsed.isHealthierPreferred = true;
      if (!parsed.fatPercentage) parsed.fatPercentage = 5;
    }

    if (/\b(?:wholewheat|wholemeal|wholegrain)\b/i.test(text)) {
      parsed.isWholewheat = true;
      parsed.isHealthierPreferred = true;
      parsed.dietaryNotes?.push('Wholewheat / Wholemeal');
    }

    if (/\b(?:free range)\b/i.test(text)) {
      parsed.isFreeRange = true;
      parsed.dietaryNotes?.push('Free Range');
    }

    if (/\b(?:organic)\b/i.test(text)) {
      parsed.isOrganic = true;
      parsed.dietaryNotes?.push('Organic');
    }

    // Multiplier pattern: e.g. "3 x 400g", "2 x 500ml"
    const multiMatch = text.match(/^(\d+)\s*[xX*]\s*([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|oz|lb|pack|can|tin|tins|bottle|bulbs?)\s+(.*)$/i);
    if (multiMatch) {
      const count = parseInt(multiMatch[1], 10);
      const size = parseFloat(multiMatch[2]);
      let u = multiMatch[3].toLowerCase();
      if (u === 'lt' || u === 'litre' || u === 'litres') u = 'l';

      parsed.multiplier = count;
      parsed.targetQuantity = count * size;
      parsed.unit = u;
      parsed.baseItem = multiMatch[4].trim();
      parsed.name = `${count}x${size}${u} ${parsed.baseItem}`;
      this.assignCategory(parsed);
      return parsed;
    }

    // Standard Quantity pattern: e.g. "900g 5% lean beef mince", "1.6kg frozen cod loins"
    const qtyUnitMatch = text.match(/^([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|pack|packs|head|heads|bunch|bunches|bottle|bottles|tin|tins|tub|tubs|loaves|loaf|box|boxes)?\s+(.*)$/i);
    if (qtyUnitMatch) {
      const qty = parseFloat(qtyUnitMatch[1]);
      let u = (qtyUnitMatch[2] || '').toLowerCase();
      let rest = qtyUnitMatch[3].trim();

      if (u === 'lt' || u === 'litre' || u === 'litres') u = 'l';
      if (u === 'bunches') u = 'bunch';
      if (u === 'heads') u = 'head';
      if (u === 'packs') u = 'pack';
      if (u === 'bottles') u = 'bottle';
      if (u === 'tins') u = 'tin';

      if (!u) {
        u = 'item';
      }

      parsed.targetQuantity = qty;
      parsed.unit = u || 'item';
      parsed.baseItem = rest;
      parsed.name = `${qty}${u !== 'item' ? u : ''} ${rest}`.trim();
      this.assignCategory(parsed);
      return parsed;
    }

    parsed.targetQuantity = 1;
    parsed.unit = 'item';
    parsed.baseItem = text;
    parsed.name = text;
    this.assignCategory(parsed);
    return parsed;
  }

  private static assignCategory(item: ParsedItem): void {
    const text = (item.baseItem + ' ' + item.name).toLowerCase();
    if (/beef|mince|chicken|pork|lamb|steak|bacon|sausage|meat/i.test(text)) {
      item.category = 'meat';
    } else if (/cod|salmon|haddock|tuna|prawn|fish|seafood/i.test(text)) {
      item.category = 'fish';
    } else if (/milk|yogurt|yoghurt|cheese|egg|eggs|butter|cream|cheddar/i.test(text)) {
      item.category = 'dairy-eggs';
    } else if (/potato|potatoes|carrot|carrots|onion|onions|garlic|courgette|courgettes|pepper|peppers|mushroom|mushrooms|tomato|tomatoes|spinach|celery|banana|bananas|pear|pears|clementine|clementines|apple|apples|salad/i.test(text)) {
      item.category = 'produce';
    } else if (/bread|loaf|roll|bagel|pitta|wrap|croissant|bakery/i.test(text)) {
      item.category = 'bakery';
    } else if (/pasta|fusilli|penne|spaghetti|rice|oat|oats|porridge|lentil|lentils|chia|walnut|walnuts|almond|almonds|nut|nuts|oil|puree|polpa|cereal|flour|sugar|beans/i.test(text)) {
      item.category = 'pantry';
    } else if (/fairy|flash|spray|cleaner|detergent|bleach|dettol|tissue|toilet|kitchen roll|sponge/i.test(text)) {
      item.category = 'household';
    } else {
      item.category = 'general';
    }
  }
}

export class ClientSupermarketComparisonService {
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

  public static compare(
    items: ParsedItem[],
    preferences: UserPreferences = this.defaultPreferences
  ): ComparisonResponse {
    const enabledStores = preferences.enabledSupermarkets?.length > 0
      ? preferences.enabledSupermarkets
      : (['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland'] as SupermarketName[]);

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

    const highestTotal = rankedStores[rankedStores.length - 1]?.totalPrice || 0;
    for (const storeRes of Object.values(storeResults)) {
      storeRes.isCheapest = storeRes.itemsFound > 0 && storeRes.supermarket === cheapestStore;
      storeRes.savingsVsHighest = storeRes.itemsFound > 0 ? Math.max(0, Number((highestTotal - storeRes.totalPrice).toFixed(2))) : 0;
      if (storeRes.isCheapest) {
        storeRes.badge = '🏆 Cheapest Overall';
      }
    }

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

  public static findBestProductMatch(
    store: SupermarketName,
    item: ParsedItem,
    preferences: UserPreferences
  ): ItemMatch {
    const storeProducts = CATALOG_PRODUCTS.filter(p => p.supermarket === store);
    const keywords = this.extractKeywords(item);

    const scoredCandidates: Array<{ product: SupermarketProduct; score: number; packs: number; totalQty: number; totalPrice: number; weightDiffPct: number }> = [];

    for (const prod of storeProducts) {
      const { score, packs, totalQty, totalPrice, weightDiffPct } = this.scoreProduct(prod, item, keywords, preferences);
      if (score > 20) {
        scoredCandidates.push({ product: prod, score, packs, totalQty, totalPrice, weightDiffPct });
      }
    }

    scoredCandidates.sort((a, b) => b.score - a.score || a.totalPrice - b.totalPrice);

    if (scoredCandidates.length === 0) {
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

    // Filter alternatives to genuine same-type matches
    const itemText = `${item.baseItem || ''} ${item.name || ''}`.toLowerCase();
    const CORE_NOUNS = [
      'milk', 'egg', 'eggs', 'yogurt', 'yoghurt', 'lentil', 'lentils', 'cod', 'salmon',
      'haddock', 'tuna', 'prawn', 'prawns', 'fish', 'mince', 'beef', 'chicken', 'pork', 'lamb',
      'steak', 'bacon', 'sausage', 'fusilli', 'pasta', 'penne', 'spaghetti', 'rice',
      'oats', 'porridge', 'bread', 'loaf', 'potato', 'potatoes', 'carrot', 'carrots',
      'onion', 'onions', 'garlic', 'spinach', 'celery', 'banana', 'bananas', 'pear',
      'pears', 'clementine', 'clementines', 'apple', 'apples', 'orange', 'oranges',
      'mushroom', 'mushrooms', 'pepper', 'peppers', 'courgette', 'courgettes',
      'tomato', 'tomatoes', 'polpa', 'puree', 'oil', 'olive oil', 'walnut', 'almond',
      'chia', 'seed', 'seeds', 'cheese', 'cheddar', 'butter'
    ];
    const targetNouns = CORE_NOUNS.filter(n => itemText.includes(n));

    const alternatives = scoredCandidates
      .filter(c => c.product.id !== best.product.id && c.score >= 40)
      .filter(c => {
        if (item.category && c.product.category && item.category !== 'general' && c.product.category !== 'general') {
          if (item.category !== c.product.category) return false;
        }
        if (targetNouns.length > 0) {
          const prodTitle = c.product.title.toLowerCase();
          return targetNouns.some(n => prodTitle.includes(n));
        }
        return true;
      })
      .slice(0, 10)
      .map(c => c.product);

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

  public static getAlternatives(store: SupermarketName, itemRawText: string): SupermarketProduct[] {
    const item = { rawText: itemRawText, name: itemRawText, baseItem: itemRawText, targetQuantity: 1, unit: 'item', category: 'general', id: 'temp' };
    const keywords = this.extractKeywords(item);
    const storeProducts = CATALOG_PRODUCTS.filter(p => p.supermarket === store);
    const itemText = itemRawText.toLowerCase();
    const CORE_NOUNS = [
      'milk', 'egg', 'eggs', 'yogurt', 'yoghurt', 'lentil', 'lentils', 'cod', 'salmon',
      'haddock', 'tuna', 'prawn', 'prawns', 'fish', 'mince', 'beef', 'chicken', 'pork', 'lamb',
      'steak', 'bacon', 'sausage', 'fusilli', 'pasta', 'penne', 'spaghetti', 'rice',
      'oats', 'porridge', 'bread', 'loaf', 'potato', 'potatoes', 'carrot', 'carrots',
      'onion', 'onions', 'garlic', 'spinach', 'celery', 'banana', 'bananas', 'pear',
      'pears', 'clementine', 'clementines', 'apple', 'apples', 'orange', 'oranges',
      'mushroom', 'mushrooms', 'pepper', 'peppers', 'courgette', 'courgettes',
      'tomato', 'tomatoes', 'polpa', 'puree', 'oil', 'olive oil', 'walnut', 'almond',
      'chia', 'seed', 'seeds', 'cheese', 'cheddar', 'butter'
    ];
    const targetNouns = CORE_NOUNS.filter(n => itemText.includes(n));

    return storeProducts
      .map(prod => ({
        prod,
        score: this.computeTextRelevance(prod.title + ' ' + prod.category + ' ' + (prod.subCategory || ''), keywords),
      }))
      .filter(item => item.score > 20)
      .filter(item => {
        if (targetNouns.length > 0) {
          const prodTitle = item.prod.title.toLowerCase();
          return targetNouns.some(n => prodTitle.includes(n));
        }
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .map(item => item.prod);
  }

  private static scoreProduct(
    prod: SupermarketProduct,
    item: ParsedItem,
    keywords: string[],
    preferences: UserPreferences
  ) {
    // 0. Hard Category Guard
    if (item.category && prod.category && item.category !== 'general' && prod.category !== 'general' && item.category !== prod.category) {
      return { score: -500, packs: 1, totalQty: 1, totalPrice: 0, weightDiffPct: 0 };
    }

    let score = 0;
    const titleLower = prod.title.toLowerCase();
    const itemLower = (item.name || '').toLowerCase();

    // Specific cross-species penalties
    if (itemLower.includes('milk') && !titleLower.includes('milk')) score -= 200;
    if ((itemLower.includes('egg') || itemLower.includes('eggs')) && (!titleLower.includes('egg') && !titleLower.includes('eggs'))) score -= 200;
    if (itemLower.includes('lentil') && !titleLower.includes('lentil') && !titleLower.includes('pulses') && !titleLower.includes('beans')) score -= 200;
    if (itemLower.includes('cod') && !titleLower.includes('cod')) score -= 150;
    if (itemLower.includes('yogurt') && !titleLower.includes('yogurt') && !titleLower.includes('yoghurt')) score -= 200;

    const textScore = this.computeTextRelevance(titleLower + ' ' + prod.category + ' ' + (prod.subCategory || ''), keywords);
    score += textScore * 2;

    if (item.brandPreference && prod.brand.toLowerCase().includes(item.brandPreference.toLowerCase())) {
      score += 40;
    }

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

    if (preferences.brandTierPriority === 'value' && prod.tier === 'value') score += 20;
    if (preferences.brandTierPriority === 'premium' && prod.tier === 'premium') score += 20;
    if (preferences.brandTierPriority === 'branded' && prod.tier === 'branded') score += 20;

    const { packs, totalQty, totalPrice, weightDiffPct } = this.calculatePacks(prod, item, preferences);

    const sizeDistance = Math.abs(weightDiffPct);
    if (sizeDistance < 10) score += 25;
    else if (sizeDistance < 25) score += 15;
    else if (sizeDistance < 50) score += 5;
    else score -= 10;

    return { score, packs, totalQty, totalPrice, weightDiffPct };
  }

  private static calculatePacks(
    prod: SupermarketProduct,
    item: ParsedItem,
    preferences: UserPreferences
  ) {
    let targetAmount = item.targetQuantity;
    let prodAmount = prod.packageSize;

    if (item.unit === 'kg') targetAmount *= 1000;
    if (item.unit === 'l') targetAmount *= 1000;

    let packs = 1;
    if (preferences.packSizingPolicy === 'cover') {
      packs = Math.ceil(targetAmount / prodAmount);
    } else {
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

  private static extractKeywords(item: ParsedItem): string[] {
    const raw = (item.baseItem + ' ' + (item.brandPreference || '')).toLowerCase();
    const clean = raw
      .replace(/[^\w\s]/g, ' ')
      .replace(/\b(approx|fresh|sliced|tinned|frozen|natural|pack|packs|head|bunch|tin|tins|bulbs?|loaves|loaf)\b/g, '')
      .trim();

    return clean.split(/\s+/).filter(k => k.length > 1);
  }

  private static computeTextRelevance(text: string, keywords: string[]): number {
    let matchCount = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        matchCount += 1;
      }
    }
    return keywords.length > 0 ? (matchCount / keywords.length) * 50 : 0;
  }

  private static calculateSplitBasket(
    items: ParsedItem[],
    storeResults: Record<SupermarketName, StoreBasketResult>,
    cheapestSingleStore: SupermarketName
  ): SplitBasketOptimization {
    const storeSubtotals: Record<string, { items: ItemMatch[]; subtotal: number }> = {};
    for (const key of Object.keys(storeResults)) {
      storeSubtotals[key] = { items: [], subtotal: 0 };
    }

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
