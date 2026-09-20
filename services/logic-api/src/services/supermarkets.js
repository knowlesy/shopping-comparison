/**
 * The canonical supermarket vocabulary, shared by every route that validates one.
 *
 * Settings and comparison previously each kept their own list, so it was possible to
 * save `enabledSupermarkets: ['not_a_shop']` through PUT /api/settings and then have
 * every comparison rejected by POST /api/compare. One list, one answer.
 */

/** Every supermarket the application recognises. */
export const KNOWN_SUPERMARKETS = Object.freeze([
  'asda',
  'sainsburys',
  'tesco',
  'morrisons',
  'iceland',
  'aldi',
  'lidl',
  'waitrose',
  'ocado',
  'coop'
]);

const KNOWN_SUPERMARKET_SET = new Set(KNOWN_SUPERMARKETS);

/** The supermarkets enabled for a household that has not chosen otherwise. */
export const DEFAULT_ENABLED_SUPERMARKETS = Object.freeze([
  'asda',
  'sainsburys',
  'tesco',
  'morrisons',
  'iceland',
  'aldi',
  'lidl'
]);

/** Stores with a direct retailer adapter in the store-fetcher sidecar. */
export const KNOWN_DIRECT_STORES = Object.freeze([
  'tesco',
  'sainsburys',
  'asda',
  'morrisons',
  'iceland'
]);

export function normalizeSupermarketName(value) {
  return String(value ?? '').toLowerCase().trim();
}

export function isKnownSupermarket(value) {
  return KNOWN_SUPERMARKET_SET.has(normalizeSupermarketName(value));
}

/** Names in `values` that are not recognised, normalised for reporting. */
export function unknownSupermarkets(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((v) => !isKnownSupermarket(v)).map((v) => String(v));
}
