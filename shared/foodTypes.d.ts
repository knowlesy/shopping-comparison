// Types for foodTypes.js, which is plain JS so the Logic-API can import it unbuilt.

export type FoodRating = 'love' | 'ok' | 'never';
export type StoredFoodRating = Exclude<FoodRating, 'ok'>;
/** Only what the household changed; a missing type is OK. */
export type FoodRatings = Record<string, Record<string, StoredFoodRating>>;
export type DietId = 'vegetarian' | 'vegan' | 'gluten_free' | 'dairy_free' | 'halal';

export interface FoodType {
  id: string;
  label: string;
  match: RegExp;
  /** How a list names this type, when that differs from how a product title shows it. */
  named?: RegExp | null;
}

export interface FoodCategory {
  id: string;
  label: string;
  common?: boolean;
  /** Rated alongside an item's own category rather than instead of it. */
  crossCutting?: boolean;
  description?: string;
  appliesTo: RegExp;
  excludes?: RegExp;
  ignore?: RegExp;
  types: FoodType[];
}

export const RATINGS: FoodRating[];
export const RATING_SCORES: Record<FoodRating, number>;
export const MAX_TYPES_PER_CATEGORY: number;
export const ONLY_NEVER_REASON: 'only_never_option';
export const FOOD_CATEGORIES: FoodCategory[];
export const DIETS: Array<{ id: DietId; label: string }>;
export const DIET_IDS: DietId[];
export const DEFAULT_FOOD_RATINGS: FoodRatings;
export const LEGACY_FOOD_KEYS: string[];

export function violatesDiet(dietId: DietId, title: string): boolean;
export function categoryById(id: string): FoodCategory | null;
export function inCategory(category: FoodCategory, text: string): boolean;
export function coveringCategory(text: string): FoodCategory | null;
export function coveringCategories(text: string): FoodCategory[];
export function productTypeText(product: { title?: string; fatPercentage?: number | null; isFrozen?: boolean } | null | undefined): string;
export function classifyType(category: FoodCategory, text: string): FoodType | null;
export function namedType(category: FoodCategory, itemText: string): FoodType | null;
export function classifyProduct(category: FoodCategory, title: string): FoodType | null;
export function ratingOf(ratings: FoodRatings | undefined, categoryId: string, typeId: string): FoodRating;
export function leanTypeForFat(fat: number): string;
export function applyLegacyFoodKeys(ratings: FoodRatings, legacy: Record<string, unknown>): FoodRatings;
export function ratingsFromLegacy(settings?: Record<string, unknown>): FoodRatings;
export function resolveFoodRatings(preferences?: Record<string, unknown>): FoodRatings;
export function validateFoodRatings(value: unknown): string | null;
export function validateDiet(value: unknown): string | null;
