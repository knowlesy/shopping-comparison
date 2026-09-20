import crypto from 'crypto';
import { PriceCache } from './priceCache.js';

/**
 * Server-owned snapshot of a completed comparison.
 *
 * Basket edits (POST /api/compare/adjust) must not trust a caller-supplied basket: a browser
 * could otherwise post any product id, price or provenance badge and have it priced verbatim.
 * Each completed comparison therefore stores its parsed items, its authoritative per-store match
 * results and the exact candidate pool it considered, under a short opaque identifier. The
 * adjustment route resolves everything it needs from that snapshot and ignores caller pricing.
 *
 * This is a bounded entry in the existing PriceCache, not a new datastore, and it is never
 * re-acquired from a retailer.
 */

export const COMPARISON_CONTEXT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const contextKey = (id) => `context:v1:comparison:${id}`;

/** Opaque, unguessable handle. Never derived from user input. */
export function newComparisonId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * @param {object} params
 * @param {string} [params.comparisonId] - reuse to chain successive edits onto one context
 * @param {Array<object>} params.items - parsed items, in basket order
 * @param {object} params.storeMatchesMap - store -> match results, in item order
 * @param {Array<string>} params.enabledStores
 * @param {Array<Array<object>>} params.candidatesByItem - item index -> every candidate considered
 * @param {object} [params.derived] - comparison-level metadata to re-apply after a recalculation
 * @returns {string} comparisonId
 */
export function saveComparisonContext({
  comparisonId,
  items,
  storeMatchesMap,
  enabledStores,
  candidatesByItem = [],
  derived = {}
}) {
  const id = comparisonId || newComparisonId();
  PriceCache.set(
    contextKey(id),
    {
      items,
      storeMatchesMap,
      enabledStores,
      candidatesByItem,
      derived,
      savedAt: Date.now()
    },
    COMPARISON_CONTEXT_TTL_MS
  );
  return id;
}

/**
 * @param {string} comparisonId
 * @returns {object|null} the snapshot, or null when unknown or expired
 */
export function loadComparisonContext(comparisonId) {
  if (!comparisonId || typeof comparisonId !== 'string') return null;
  const context = PriceCache.get(contextKey(comparisonId));
  if (!context || !Array.isArray(context.items) || !context.storeMatchesMap) return null;
  return context;
}

/**
 * Resolves a product id against the candidates this comparison actually considered for
 * `itemIndex` at `store`, plus the product already matched there. Returns the server-held
 * product object, so a caller's price, source or title is never used.
 *
 * @returns {object|null} the trusted product, or null when the id is not part of this comparison
 */
export function resolveTrustedProduct(context, itemIndex, store, productId) {
  if (!context || productId === undefined || productId === null) return null;
  const wanted = String(productId);

  const pool = [];
  const candidates = context.candidatesByItem?.[itemIndex];
  if (Array.isArray(candidates)) pool.push(...candidates);

  // The currently matched product is part of the comparison even if the candidate pool
  // was trimmed, and so are the alternatives already offered for this item.
  const currentMatch = context.storeMatchesMap?.[store]?.[itemIndex];
  if (currentMatch?.product) pool.push(currentMatch.product);
  if (Array.isArray(currentMatch?.alternatives)) pool.push(...currentMatch.alternatives);

  for (const product of pool) {
    if (!product || String(product.id) !== wanted) continue;
    // A product may only be chosen for the store it belongs to.
    if (product.supermarket && product.supermarket !== store) continue;
    return product;
  }
  return null;
}
