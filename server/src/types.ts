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
  unitPriceMeasure: string; // e.g. "£/kg", "£/100g", "£/l", "£/item"
  isHealthier: boolean;
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
  weightDifferencePercent: number; // e.g. +11% for 1kg vs 900g
  isClosestPack: boolean;
  matchScore: number;
  reason?: string;
  alternatives?: SupermarketProduct[];
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
  timestamp: string;
}

export interface UserPreferences {
  healthierDefault: boolean;
  fatPercentagePreference: number; // e.g. 5
  preferWholewheat: boolean;
  preferFreeRange: boolean;
  preferOrganic: boolean;
  brandTierPriority: 'value' | 'standard' | 'premium' | 'branded';
  packSizingPolicy: 'closest' | 'cover' | 'cheapest_per_unit'; // closest single pack, cover full amount, or cheapest unit price
  enabledSupermarkets: SupermarketName[];
  defaultPostcode?: string;
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
  defaultFormat: string; // e.g. "900g 5% lean beef mince"
  icon?: string;
  isPopular?: boolean;
}

export interface SavedShop {
  id: string;
  name: string;
  createdAt: string;
  rawList: string;
  itemCount: number;
  totals: Record<SupermarketName, number>;
  cheapestStore: SupermarketName;
  lowestPrice: number;
  highestPrice: number;
  savings: number;
  items: Array<{
    name: string;
    targetQuantity: string;
    prices: Record<SupermarketName, number>;
  }>;
}
