import type { UserPreferences } from '../../types';
import { ratingOf } from '../../../../shared/foodTypes.js';

/**
 * The settings page edits a draft. These helpers say how far the draft is from what the
 * server last confirmed, and build the patch that sends only what changed.
 *
 * Pure (no React, no DOM) so it can be tested directly.
 */

/** Settings the page can edit. Everything else on UserPreferences is server-derived. */
export const EDITABLE_KEYS = [
  'foodRatings',
  'diet',
  'healthierDefault',
  'preferOrganic',
  'enabledSupermarkets',
  'includeDeals',
  'brandTierPriority',
  'cutMatchingStrategy',
  'packSizingPolicy',
  'allowMixedPackSizes',
  'aiMatchingEnabled',
  'geminiApiKey',
  'aiAssistLevel',
  'aiMaxCallsPerBasket',
  'aiStages',
  'enableMatchLog',
  'directScrapersEnabled',
  'directStoreAdapters',
  'enablePastSearches',
  'devMode',
] as const satisfies ReadonlyArray<keyof UserPreferences>;

type EditableKey = (typeof EDITABLE_KEYS)[number];

/** The draft a page starts from. The key field is write-only, so it always starts blank. */
export function draftFrom(preferences: UserPreferences): UserPreferences {
  return { ...preferences, geminiApiKey: '' };
}

function setDifference<T>(a: readonly T[] = [], b: readonly T[] = []): number {
  const left = new Set(a);
  const right = new Set(b);
  let n = 0;
  for (const x of left) if (!right.has(x)) n++;
  for (const x of right) if (!left.has(x)) n++;
  return n;
}

function mapDifference(a: Record<string, unknown> = {}, b: Record<string, unknown> = {}): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let n = 0;
  for (const k of keys) if (a[k] !== b[k]) n++;
  return n;
}

function ratingDifference(a: UserPreferences['foodRatings'] = {}, b: UserPreferences['foodRatings'] = {}): number {
  const pairs = new Set<string>();
  for (const ratings of [a, b]) {
    for (const [categoryId, types] of Object.entries(ratings)) {
      for (const typeId of Object.keys(types)) pairs.add(`${categoryId}\u0000${typeId}`);
    }
  }
  let n = 0;
  for (const pair of pairs) {
    const [categoryId, typeId] = pair.split('\u0000');
    if (ratingOf(a, categoryId, typeId) !== ratingOf(b, categoryId, typeId)) n++;
  }
  return n;
}

/** How many individual changes `key` carries: one per rating, store or flag that moved. */
export function fieldChanges(saved: UserPreferences, draft: UserPreferences, key: EditableKey): number {
  switch (key) {
    case 'foodRatings':
      return ratingDifference(saved.foodRatings, draft.foodRatings);
    case 'diet':
      return setDifference(saved.diet, draft.diet);
    case 'enabledSupermarkets':
      return setDifference(saved.enabledSupermarkets, draft.enabledSupermarkets);
    case 'aiStages':
      return mapDifference(saved.aiStages, draft.aiStages);
    case 'directStoreAdapters':
      return mapDifference(saved.directStoreAdapters, draft.directStoreAdapters);
    case 'geminiApiKey':
      // Never compared with the saved value, which the browser does not have.
      return draft.geminiApiKey ? 1 : 0;
    default:
      return saved[key] === draft[key] ? 0 : 1;
  }
}

export function countChanges(saved: UserPreferences, draft: UserPreferences): number {
  return EDITABLE_KEYS.reduce((n, key) => n + fieldChanges(saved, draft, key), 0);
}

/** Only the fields that changed, each sent whole (the server replaces or merges it). */
export function buildPatch(saved: UserPreferences, draft: UserPreferences): Partial<UserPreferences> {
  const patch: Partial<UserPreferences> = {};
  for (const key of EDITABLE_KEYS) {
    if (fieldChanges(saved, draft, key) > 0) {
      (patch as Record<string, unknown>)[key] = draft[key];
    }
  }
  return patch;
}
