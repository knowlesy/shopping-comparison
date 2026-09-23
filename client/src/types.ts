import type { DietId, FoodRatings, FoodRating } from '../../shared/foodTypes.js';

export type { DietId, FoodRatings, FoodRating };

/** Top-level views; the app has no router. */
export type AppTab = 'list' | 'compare' | 'history' | 'favorites' | 'quickcheck' | 'stats' | 'settings';

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
  confidenceSource?: 'direct' | 'aggregator' | 'ai' | 'ai-cached' | 'catalog';
  isEstimated?: boolean;
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
  confidenceSource?: 'direct' | 'aggregator' | 'ai' | 'ai-cached' | 'catalog';
  dealApplied?: DealApplied;
  reason?: string;
  lines?: Array<{ product: SupermarketProduct; packs: number; subtotal: number }>;
  variantRoute?: Array<{ product: SupermarketProduct; packs: number; subtotal: number }>;
  routeExplanation?: string;
  explanation?: string;
  alternatives?: SupermarketProduct[];
  /** The household's rating of the chosen product's food type, when one applies. */
  foodRating?: { categoryId: string; typeId: string; rating: FoodRating };
  /** 'only_never_option': the best this store had is a type the household rated Never. */
  reasonCode?: 'only_never_option';
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
  /** A like-for-like gap that includes an estimated line; never a verified saving. */
  indicativeSavingsVsHighest?: number;
  savingsVsHighestAreVerified?: boolean;
  itemsFound: number;
  itemsTotal: number;
  missingItems: ParsedItem[];
  isCheapest: boolean;
  estimatedShare?: number;
  hasEstimatedPrices?: boolean;
  /** Null when no matched product states whether it is healthier. */
  averageHealthScore: number | null;
  badge?: string;
  candidateStatus?: {
    fallbackItems: number;
    failedItems: number;
    sources: string[];
    lastError?: string;
  };
}

export interface SplitBasketStore {
  supermarket: SupermarketName;
  info: SupermarketInfo;
  items: ItemMatch[];
  storeSubtotal: number;
}

export interface SplitBasketOptimization {
  stores: SplitBasketStore[];
  /** Product subtotals plus delivery for every store used in the route. */
  combinedTotal: number;
  combinedSubtotal?: number;
  combinedDeliveryFee?: number;
  /** Only non-zero for a like-for-like, fully verified saving. */
  savingsVsSingleBest: number;
  /** The same figure when the route leans on estimated catalog prices; indicative only. */
  indicativeSavingsVsSingleBest?: number;
  /** The same items bought at one store, delivery included. */
  singleBestTotal?: number;
  cheapestSingleStoreName: string;
  itemsCovered?: number;
  itemsTotal?: number;
  missingItems?: ParsedItem[];
  provenance?: 'verified' | 'mixed' | 'estimated' | 'none';
  savingsAreVerified?: boolean;
  hasFullCoverage?: boolean;
  /** False when any equally covering candidate route used bounded delivery-aware allocation. */
  allocationIsExact?: boolean;
  explanation: string;
}

export interface ComparisonResponse {
  /** Opaque handle to the server-owned snapshot of this comparison; required to edit the basket. */
  comparisonId?: string;
  parsedItems: ParsedItem[];
  supermarkets: Record<SupermarketName, StoreBasketResult>;
  cheapestStore: SupermarketName;
  highestStore: SupermarketName;
  /** Whether the recommended store actually wins on price, or only on available coverage. */
  recommendationBasis?: 'lowest_comparable_price' | 'best_available_coverage' | 'preferred_verified_prices';
  /** Item count of the fullest basket any store returned; the baseline savings are quoted against. */
  comparableCoverage?: number;
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
    candidateStatuses?: Record<string, Array<{
      itemIndex: number;
      itemId: string;
      source: string;
      success: boolean;
      fallback?: boolean;
      error?: string;
    }>>;
  };
}

export interface UserPreferences {
  healthierDefault: boolean;
  /** Love / Never per food type; a type left out is OK. */
  foodRatings?: FoodRatings;
  /** Hard filter, best effort from product titles. */
  diet?: DietId[];
  preferOrganic: boolean;
  cutMatchingStrategy?: 'best_value' | 'strict_cut';
  brandTierPriority: 'value' | 'standard' | 'premium' | 'branded';
  packSizingPolicy: 'closest' | 'cover' | 'cheapest_per_unit';
  includeDeals?: boolean;
  enabledSupermarkets: SupermarketName[];
  defaultPostcode?: string;
  devMode?: boolean;
  enablePastSearches?: boolean;
  directScrapersEnabled?: boolean;
  directStoreAdapters?: Record<string, boolean>;
  allowMixedPackSizes?: boolean;
  aiMatchingEnabled?: boolean;
  aiMatchingExternallyConfigured?: boolean;
  hasGeminiKey?: boolean;
  // Write-only. The server never returns a key; this field only ever carries a value
  // the user has just typed, on its way to the API.
  geminiApiKey?: string;
  geminiKeySource?: 'environment' | 'runtime' | 'none';
  geminiKeyLifetime?: string;
  aiAssistLevel?: 'off' | 'economy' | 'balanced' | 'thorough';
  aiMaxCallsPerBasket?: number;
  aiStages?: {
    interpret: boolean;
    query: boolean;
    select: boolean;
  };
  enableMatchLog?: boolean;
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

export interface PriceHistoryStats {
  totalComparisons: number;
  winRates: Record<string, { wins: number; percentage: number }>;
  sourceRatios: {
    live: number;
    cache: number;
    catalog: number;
    counts: { live: number; cache: number; catalog: number };
  };
  categoryActivity: Record<string, number>;
  recentSnapshots: Array<{
    id: string;
    timestamp: string;
    itemsCount: number;
    cheapestStore: SupermarketName;
    supermarketTotals: Record<string, number>;
    meta?: { sources?: { live: number; cache: number; catalog: number } };
  }>;
}

export interface SystemVersionInfo {
  version: string;
  releaseDate: string;
  // Null unless the deployment states its image references through the environment.
  // Never derived from the app version: the four images can come from different
  // commits, so a version-derived tag would be an unverified claim about the cluster.
  clientImage?: string | null;
  logicApiImage?: string | null;
  scraperPodImage?: string | null;
  storeFetcherImage?: string | null;
  imageIdentitySource?: 'environment' | 'unreported';
  imageRepo?: string;
  environment?: string;
}
