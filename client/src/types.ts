export type SupermarketName = 'tesco' | 'asda' | 'sainsburys' | 'morrisons' | 'iceland' | 'waitrose' | 'ocado' | 'coop' | 'aldi' | 'lidl';

export interface SupermarketInfo {
  id: SupermarketName;
  name: string;
  shortName: string;
  logo: string;
  themeColor: string;
  accentColor: string;
  deliveryMinOrder: number;
  deliveryFee: number;
  deliveryPassAvailable: boolean;
  searchBaseUrl: string;
}

export interface ParsedItem {
  id: string;
  rawText: string;
  name: string;
  baseItem: string;
  category: string;
  targetQuantity: number;
  unit: string;
  multiplier?: number;
  isHealthierPreferred?: boolean;
  fatPercentage?: number;
  isOrganic?: boolean;
  isWholewheat?: boolean;
  isFreeRange?: boolean;
  brandPreference?: string;
  dietaryNotes?: string[];
  checked?: boolean;
}

export interface ProductDeal {
  rawText: string;
  type: 'multibuy_fixed' | 'buy_x_get_y_free' | 'bundle_discount' | 'loyalty_price' | 'generic_deal';
  bundleQuantity?: number;
  bundlePrice?: number;
  buyQuantity?: number;
  freeQuantity?: number;
  discountAmount?: number;
  loyaltyPrice?: number;
  loyaltyScheme?: string;
  badge?: string;
}

export interface DealApplied {
  dealText: string;
  originalPrice: number;
  discountedPrice: number;
  savings: number;
  effectiveUnitPrice: number;
  summary?: string;
}

export interface SupermarketProduct {
  id: string;
  supermarket: SupermarketName;
  title: string;
  brand: string;
  tier: 'value' | 'standard' | 'premium' | 'branded';
  category: string;
  subCategory?: string;
  packageSize: number;
  packageUnit: string;
  packageDisplay: string;
  price: number;
  unitPrice: number;
  unitPriceMeasure: string;
  deal?: ProductDeal;
  promoText?: string;
  confidence?: string;
  confidenceScore?: number;
  confidenceSource?: 'aggregator' | 'ai' | 'ai-cached' | 'catalog';
  isHealthier: boolean;
  isFrozen?: boolean;
  fatPercentage?: number;
  isOrganic?: boolean;
  isWholewheat?: boolean;
  isFreeRange?: boolean;
  inStock: boolean;
  productUrl: string;
  imageUrl: string;
  rating?: number;
  reviewCount?: number;
  clubcardPrice?: number;
}

export interface ItemMatch {
  parsedItem: ParsedItem;
  supermarket: SupermarketName;
  product: SupermarketProduct | null;
  packsNeeded: number;
  totalQuantity: number;
  totalPrice: number;
  effectiveUnitPrice: number;
  weightDifferencePercent: number;
  isClosestPack: boolean;
  isEstimated?: boolean;
  weightShortfall?: {
    requested: number;
    supplied: number;
    unit?: string;
  };
  matchScore: number;
  confidence?: string;
  confidenceScore?: number;
  confidenceSource?: 'aggregator' | 'ai' | 'ai-cached' | 'catalog';
  dealApplied?: DealApplied;
  reason?: string;
  alternatives?: SupermarketProduct[];
}

export interface RecentSearchItem {
  id: string;
  query: string;
  rawList: string;
  itemsCount: number;
  timestamp: number;
  pinned: boolean;
}

export interface StoreBasketResult {
  supermarket: SupermarketName;
  info: SupermarketInfo;
  items: ItemMatch[];
  totalPrice: number;
  subtotal: number;
  deliveryFee: number;
  savingsVsHighest: number;
  itemsFound: number;
  itemsTotal: number;
  missingItems: ParsedItem[];
  isCheapest: boolean;
  estimatedShare?: number;
  hasEstimatedPrices?: boolean;
  averageHealthScore: number;
  badge?: string;
}

export interface SplitBasketStore {
  supermarket: SupermarketName;
  info: SupermarketInfo;
  items: ItemMatch[];
  storeSubtotal: number;
}

export interface SplitBasketOptimization {
  stores: SplitBasketStore[];
  combinedTotal: number;
  savingsVsSingleBest: number;
  cheapestSingleStoreName: string;
  explanation: string;
}

export interface ComparisonResponse {
  parsedItems: ParsedItem[];
  supermarkets: Record<SupermarketName, StoreBasketResult>;
  cheapestStore: SupermarketName;
  highestStore: SupermarketName;
  splitOptimization: SplitBasketOptimization;
  estimatedShare?: number;
  hasEstimatedPrices?: boolean;
  timestamp: string;
  meta?: {
    sources?: {
      live: number;
      cache: number;
      catalog: number;
    };
    scrapeError?: string;
  };
}

export interface UserPreferences {
  healthierDefault: boolean;
  fatPercentagePreference: number;
  preferWholewheat: boolean;
  preferFreeRange: boolean;
  preferOrganic: boolean;
  cutMatchingStrategy?: 'best_value' | 'strict_cut';
  brandTierPriority: 'value' | 'standard' | 'premium' | 'branded';
  packSizingPolicy: 'closest' | 'cover' | 'cheapest_per_unit';
  includeDeals?: boolean;
  enabledSupermarkets: SupermarketName[];
  defaultPostcode?: string;
  devMode?: boolean;
  enablePastSearches?: boolean;
  aiMatchingEnabled?: boolean;
  aiMatchingExternallyConfigured?: boolean;
  hasGeminiKey?: boolean;
  geminiApiKey?: string;
}

export interface FavoriteItem {
  id: string;
  name: string;
  preferredSupermarket?: SupermarketName;
  preferredBrand?: string;
  defaultQuantity?: string;
  category: string;
  notes?: string;
  createdAt: string;
}

export interface IngredientIdea {
  id: string;
  name: string;
  category: 'protein' | 'dairy' | 'produce' | 'bakery' | 'pantry' | 'household';
  defaultFormat: string;
  icon?: string;
  isPopular?: boolean;
}

export interface CacheStats {
  entriesCount: number;
  estimatedProducts: number;
  ttlHours: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

export interface SavedShopItemPrice {
  name: string;
  targetQuantity: string;
  prices: Partial<Record<SupermarketName, number>>;
  matchedTitles?: Partial<Record<SupermarketName, string>>;
}

export interface SavedShop {
  id: string;
  name: string;
  createdAt: string;
  rawList: string;
  itemCount: number;
  totals: Partial<Record<SupermarketName, number>>;
  cheapestStore: SupermarketName;
  lowestPrice: number;
  highestPrice: number;
  savings: number;
  items?: SavedShopItemPrice[];
}
