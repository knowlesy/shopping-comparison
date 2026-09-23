import type {
  ComparisonResponse,
  DietId,
  FoodRating,
  FoodRatings,
  ItemMatch,
  ParsedItem,
  SupermarketName,
  SupermarketProduct,
} from '../types';
import {
  classifyProduct,
  coveringCategories,
  namedType,
  productTypeText,
  ratingOf,
  violatesDiet,
  type FoodCategory,
} from '../../../shared/foodTypes.js';

/**
 * "Effect on this week": what a draft of food ratings and diets would change in the
 * comparison already on screen.
 *
 * Uses only the current list and the comparison already loaded: the chosen product at
 * each store plus the alternatives that came with it. Nothing is fetched. Where the
 * loaded data cannot show the outcome, the effect says so ("applies on next compare")
 * rather than guessing.
 *
 * Pure, so it is tested directly (client/tests/prefPreview.test.ts).
 */

export type StoreEffectStatus =
  /** A loaded alternative would now be picked. */
  | 'switch'
  /** The pick may change, but the loaded data cannot show to what. */
  | 'next_compare'
  /** Every loaded option at this store is a type rated Never. */
  | 'only_never'
  /** The chosen product breaks a newly added diet and nothing loaded replaces it. */
  | 'excluded';

export interface StoreEffect {
  store: SupermarketName;
  storeName: string;
  status: StoreEffectStatus;
  fromTitle?: string;
  fromType?: string;
  toTitle?: string;
  toType?: string;
  /** New line price minus current line price, at the same number of packs. */
  priceDelta?: number;
}

export interface ItemEffect {
  itemId: string;
  itemName: string;
  categoryLabel?: string;
  /** The type most stores move to, for the "item → new type" headline. */
  newType?: string;
  stores: StoreEffect[];
  /** The item is not in the loaded comparison, so nothing can be shown yet. */
  notCompared?: boolean;
}

export interface PreviewInput {
  items: ParsedItem[];
  comparison: ComparisonResponse | null;
  savedRatings?: FoodRatings;
  draftRatings?: FoodRatings;
  savedDiet?: DietId[];
  draftDiet?: DietId[];
}

export interface PreviewResult {
  items: ItemEffect[];
  /** Items with at least one store effect, or not yet compared but affected. */
  changedItems: number;
  hasComparison: boolean;
}

const TIER: Record<FoodRating, number> = { love: 2, ok: 1, never: 0 };

function itemText(item: ParsedItem): string {
  const parts = [item.name, item.baseItem, item.rawText];
  if (item.isWholewheat) parts.push('wholemeal');
  if (item.isFreeRange) parts.push('free range');
  if (item.isOrganic) parts.push('organic');
  if (item.fatPercentage !== undefined && item.fatPercentage !== null) parts.push(`${item.fatPercentage}% fat`);
  return parts.filter(Boolean).join(' ');
}

function categoryChanged(category: FoodCategory, saved: FoodRatings, draft: FoodRatings): boolean {
  return category.types.some((t) => ratingOf(saved, category.id, t.id) !== ratingOf(draft, category.id, t.id));
}

function findMatch(comparison: ComparisonResponse, store: SupermarketName, item: ParsedItem, index: number): ItemMatch | undefined {
  const matches = comparison.supermarkets[store]?.items || [];
  return (
    matches.find((m) => m.parsedItem?.id === item.id || (m as ItemMatch & { itemId?: string }).itemId === item.id) ||
    matches[index]
  );
}

interface Candidate {
  product: SupermarketProduct;
  typeLabel?: string;
  rating: FoodRating;
}

function linePrice(match: ItemMatch, product: SupermarketProduct): number {
  const packs = match.packsNeeded || 1;
  return (product.clubcardPrice ?? product.price) * packs;
}

/** Food-rating effect at one store, or null when nothing changes there. */
function ratingEffect(
  category: FoodCategory,
  match: ItemMatch,
  saved: FoodRatings,
  draft: FoodRatings,
): Omit<StoreEffect, 'store' | 'storeName'> | null {
  const current = match.product;
  if (!current) return null;

  const rate = (product: SupermarketProduct, ratings: FoodRatings): Candidate | null => {
    const type = classifyProduct(category, productTypeText(product));
    if (!type) return null;
    return { product, typeLabel: type.label, rating: ratingOf(ratings, category.id, type.id) };
  };

  const now = rate(current, draft);
  const before = rate(current, saved);
  const loaded = [current, ...(match.alternatives || [])]
    .filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i)
    .map((p) => rate(p, draft))
    .filter((c): c is Candidate => c !== null);

  // Nothing in the loaded data is in this category: only a fresh compare can tell.
  if (loaded.length === 0) {
    return categoryChanged(category, saved, draft) ? { status: 'next_compare', fromTitle: current.title } : null;
  }

  const bestTier = Math.max(...loaded.map((c) => TIER[c.rating]));
  const currentTier = now ? TIER[now.rating] : TIER.ok;

  if (bestTier > currentTier) {
    const better = loaded
      .filter((c) => TIER[c.rating] === bestTier)
      .sort((a, b) => linePrice(match, a.product) - linePrice(match, b.product))[0];
    return {
      status: 'switch',
      fromTitle: current.title,
      fromType: now?.typeLabel,
      toTitle: better.product.title,
      toType: better.typeLabel,
      priceDelta: Number((linePrice(match, better.product) - match.totalPrice).toFixed(2)),
    };
  }

  if (now?.rating === 'never' && bestTier === TIER.never) {
    return { status: 'only_never', fromTitle: current.title, fromType: now.typeLabel };
  }

  // The current pick lost standing (e.g. a Love removed), or a newly loved type was not
  // among the loaded alternatives: the store may have it, but only a compare can say.
  const lostStanding = before && now && TIER[now.rating] < TIER[before.rating];
  const newLoveUnseen =
    category.types.some((t) => ratingOf(draft, category.id, t.id) === 'love' && ratingOf(saved, category.id, t.id) !== 'love') &&
    currentTier < TIER.love;
  if (lostStanding || newLoveUnseen) {
    return { status: 'next_compare', fromTitle: current.title, fromType: now?.typeLabel };
  }
  return null;
}

/** Diet effect at one store, or null when the current pick is still allowed. */
function dietEffect(match: ItemMatch, addedDiets: DietId[]): Omit<StoreEffect, 'store' | 'storeName'> | null {
  const current = match.product;
  if (!current || addedDiets.length === 0) return null;
  const breaks = (p: SupermarketProduct) => addedDiets.some((d) => violatesDiet(d, p.title));
  if (!breaks(current)) return null;

  const allowed = (match.alternatives || [])
    .filter((p) => !breaks(p))
    .sort((a, b) => linePrice(match, a) - linePrice(match, b))[0];
  if (!allowed) return { status: 'excluded', fromTitle: current.title };
  return {
    status: 'switch',
    fromTitle: current.title,
    toTitle: allowed.title,
    priceDelta: Number((linePrice(match, allowed) - match.totalPrice).toFixed(2)),
  };
}

function mostCommon(values: Array<string | undefined>): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

export function previewFoodChanges(input: PreviewInput): PreviewResult {
  const saved = input.savedRatings || {};
  const draft = input.draftRatings || {};
  const addedDiets = (input.draftDiet || []).filter((d) => !(input.savedDiet || []).includes(d));
  const comparison = input.comparison;
  const effects: ItemEffect[] = [];

  const items = comparison?.parsedItems?.length ? comparison.parsedItems : input.items;
  const comparedIds = new Set((comparison?.parsedItems || []).map((i) => i.id));
  const stores = comparison ? (Object.keys(comparison.supermarkets) as SupermarketName[]) : [];

  const consider = (item: ParsedItem, index: number, compared: boolean) => {
    const text = itemText(item);
    // The item's own category, plus Frozen or fresh where it applies. A category the list
    // already settles ("frozen peas") or whose ratings did not change is left out.
    const rated = coveringCategories(text).filter((c) => !namedType(c, text) && categoryChanged(c, saved, draft));
    if (rated.length === 0 && addedDiets.length === 0) return;
    const categoryLabel = rated.map((c) => c.label).join(' · ') || undefined;

    if (!compared) {
      if (rated.length > 0) {
        effects.push({ itemId: item.id, itemName: item.name, categoryLabel, stores: [], notCompared: true });
      }
      return;
    }

    const storeEffects: StoreEffect[] = [];
    for (const store of stores) {
      const match = findMatch(comparison!, store, item, index);
      if (!match) continue;
      // A switch from any category is the most informative line, so it wins.
      const ratingEffects = rated.map((c) => ratingEffect(c, match, saved, draft)).filter((e) => e !== null);
      const effect =
        dietEffect(match, addedDiets) ||
        ratingEffects.find((e) => e.status === 'switch') ||
        ratingEffects[0] ||
        null;
      if (effect) {
        storeEffects.push({ store, storeName: comparison!.supermarkets[store]?.info?.name || store, ...effect });
      }
    }
    if (storeEffects.length > 0) {
      effects.push({
        itemId: item.id,
        itemName: item.name,
        categoryLabel,
        newType: mostCommon(storeEffects.filter((e) => e.status === 'switch').map((e) => e.toType)),
        stores: storeEffects,
      });
    }
  };

  items.forEach((item, index) => consider(item, index, Boolean(comparison)));
  // Items added to the list since the comparison ran.
  if (comparison) {
    input.items.filter((i) => !comparedIds.has(i.id)).forEach((item, index) => consider(item, index, false));
  }

  return { items: effects, changedItems: effects.length, hasComparison: Boolean(comparison) };
}
