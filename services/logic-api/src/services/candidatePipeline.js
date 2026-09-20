import { StoreFetcherClient } from './storeFetcherClient.js';
import { ScraperClient } from './scraperClient.js';
import { GeminiDomParser } from './geminiParser.js';
import { PriceCache } from './priceCache.js';
import { QueryStrategist } from './queryStrategist.js';
import {
  DEFAULT_ENABLED_SUPERMARKETS,
  KNOWN_DIRECT_STORES,
  normalizeSupermarketName
} from './supermarkets.js';

export function getCoreSearchQuery(item) {
  if (!item) return '';
  const raw =
    typeof item === 'string'
      ? item.toLowerCase()
      : (item.baseItem || item.name || '').toLowerCase();
  const cleaned = raw
    .replace(/^(\d+)\s*[xX*]\s*/g, '')
    .replace(/\b\d+%\s*(?:fat|lean)\b/gi, '')
    .replace(
      /\b(?:lean|fresh|organic|free\s*range|wholewheat|wholegrain|wholemeal|frozen|tinned|canned|authentic|sliced|salted|unsalted|smoked|unsmoked)\b/gi,
      ''
    )
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:kg|g|l|lt|ml|pints?|pt|pack|packs|tin|tins|tub|tubs|loaves|loaf)\b/gi,
      ''
    )
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || (typeof item === 'string' ? item : item.baseItem || item.name || '');
}

/**
 * Builds a deterministic scrape cache key incorporating the query and sorted enabled stores.
 * Retained for backward compatibility and legacy cache file lookups.
 * @param {string} coreQuery
 * @param {string[]} enabledStores
 * @returns {string}
 */
export function buildScrapeCacheKey(coreQuery, enabledStores = []) {
  const normalizedQuery = (coreQuery || '').toLowerCase().trim();
  const sortedStores =
    Array.isArray(enabledStores) && enabledStores.length > 0
      ? [...enabledStores].map((s) => normalizeSupermarketName(s)).sort().join(',')
      : 'all';
  return `cache:v2:scrape:${normalizedQuery}:${sortedStores}`;
}

/**
 * Builds a granular per-store candidate cache key.
 * @param {string} coreQuery
 * @param {string} store
 * @returns {string}
 */
export function buildStoreCandidateCacheKey(coreQuery, store) {
  const normalizedQuery = (coreQuery || '').toLowerCase().trim();
  const normalizedStore = normalizeSupermarketName(store);
  return `cache:v3:store:${normalizedQuery}:${normalizedStore}`;
}

// TTL definitions
export const CANDIDATE_CACHE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours for live products
export const TRANSIENT_RETRY_COOLDOWN_MS = 30 * 1000;      // 30 seconds cooldown for sidecar timeouts/errors
export const EMPTY_SEARCH_TTL_MS = 60 * 60 * 1000;         // 1 hour for clean searches with 0 results

function candidatesForStore(products, store) {
  if (!Array.isArray(products)) return [];
  return products.filter(
    (product) => normalizeSupermarketName(product.supermarket) === store
  );
}

function migrateLegacyStoreCandidates(query, store) {
  const legacyPrefix = `cache:v2:scrape:${query}:`;
  for (const [, products] of PriceCache.entriesWithPrefix(legacyPrefix)) {
    const storeProducts = candidatesForStore(products, store);
    if (storeProducts.length > 0) {
      PriceCache.set(buildStoreCandidateCacheKey(query, store), storeProducts, CANDIDATE_CACHE_TTL_MS);
      return storeProducts;
    }
  }
  return null;
}

/**
 * Shared candidate pipeline for fetching candidates with:
 * 1. Granular per-store cache check with legacy format migration
 * 2. Tier 1: StoreFetcherClient direct store adapters (ahead of aggregator)
 * 3. Tier 2: ScraperClient aggregator (trolley) fallback for missing/failed stores
 * 4. Tier 3: Verified catalog benchmarks fallback for remaining unfulfilled stores
 *
 * @param {string} coreQuery - Normalized ingredient search query
 * @param {object} options - { forceRefresh, timeoutMs, enabledStores, preferences }
 * @returns {Promise<{ products: Array, source: 'direct' | 'live' | 'cache' | 'catalog' | 'mixed', storeStatuses: object, error?: string }>}
 */
export async function getOrFetchCandidatesWithSource(coreQuery, options = {}) {
  const {
    forceRefresh = false,
    timeoutMs = 35000,
    enabledStores = [],
    preferences = {}
  } = options;

  const normalizedQuery = (coreQuery || '').toLowerCase().trim();
  const targetStores =
    Array.isArray(enabledStores) && enabledStores.length > 0
      ? [...enabledStores].map(normalizeSupermarketName)
      : [...DEFAULT_ENABLED_SUPERMARKETS];

  const storeCandidateMap = {};
  const storeStatuses = {};
  const storesToAcquire = [];

  // Step 1: Check per-store cache and migrate only matching store rows from v2.
  // A combined v2 entry must never satisfy a different store selection wholesale.
  for (const store of targetStores) {
    const storeKey = buildStoreCandidateCacheKey(normalizedQuery, store);

    if (!forceRefresh) {
      const cached = PriceCache.get(storeKey);
      if (cached) {
        if (Array.isArray(cached) && cached.length > 0) {
          storeCandidateMap[store] = cached;
          storeStatuses[store] = { source: 'cache', success: true, count: cached.length };
          continue;
        } else if (cached.products && Array.isArray(cached.products)) {
          storeCandidateMap[store] = cached.products;
          storeStatuses[store] = {
            source: cached.source === 'direct_empty' ? 'cache_empty' : 'cache',
            success: true,
            count: cached.products.length
          };
          continue;
        } else if (cached.error || cached.status === 'deadline_exceeded') {
          // Transient failure cooldown active - do not hammer sidecar repeatedly
          storeStatuses[store] = {
            source: 'transient_failure',
            success: false,
            error: cached.error || cached.status,
            fallback: true
          };
          continue;
        }
      }

      const legacyProducts = migrateLegacyStoreCandidates(normalizedQuery, store);
      if (legacyProducts) {
        storeCandidateMap[store] = legacyProducts;
        storeStatuses[store] = { source: 'cache', success: true, count: legacyProducts.length };
        continue;
      }
    }

    // Store needs fresh acquisition
    storesToAcquire.push(store);
  }

  // If all stores are satisfied from cache, return immediately
  if (storesToAcquire.length === 0) {
    const allProducts = Object.values(storeCandidateMap).flat();
    return {
      products: allProducts,
      source: 'cache',
      storeStatuses,
      error: null
    };
  }

  // Step 2: Tier 1 Direct store fetch for eligible uncached stores
  const isDirectEnabled = preferences.directScrapersEnabled !== false;
  const directTargetStores = storesToAcquire.filter((s) => {
    if (!isDirectEnabled) return false;
    if (preferences.directStoreAdapters && preferences.directStoreAdapters[s] === false) {
      return false;
    }
    return KNOWN_DIRECT_STORES.includes(s);
  });

  let firstDirectError = null;

  if (directTargetStores.length > 0) {
    for (const store of directTargetStores) {
      try {
        const queryPlan = await QueryStrategist.plan(
          typeof coreQuery === 'string' ? { name: coreQuery } : coreQuery,
          { supermarket: store, aiMatchingEnabled: preferences.aiMatchingEnabled }
        );
        const searchTerms = queryPlan.queries?.[0] || normalizedQuery;
        const directRes = await StoreFetcherClient.search(searchTerms, [store], {
          timeoutMs: Math.min(timeoutMs, 35000),
          wantVariants: true,
          targetQuantity: preferences.targetQuantity,
          suggestedVariants: queryPlan.suggestedVariants
        });
        const storeResult = directRes?.stores?.[store];
        const storeKey = buildStoreCandidateCacheKey(normalizedQuery, store);

        if (storeResult && Array.isArray(storeResult.products) && storeResult.products.length > 0) {
          const prods = storeResult.products.map((p) => ({
            ...p,
            supermarket: p.supermarket || store,
            source: 'direct',
            confidenceSource: 'direct'
          }));
          storeCandidateMap[store] = prods;
          storeStatuses[store] = { source: 'direct', success: true, count: prods.length };
          PriceCache.set(storeKey, prods, CANDIDATE_CACHE_TTL_MS);
        } else if (
          storeResult?.status === 'deadline_exceeded' ||
          directRes?.success === false ||
          storeResult?.error
        ) {
          // Failure or deadline exceeded: do NOT cache empty products for 72h!
          // Set short transient failure cooldown (30s)
          const errReason = storeResult?.error || directRes?.error || 'deadline_exceeded';
          firstDirectError = firstDirectError || errReason;
          PriceCache.set(
            storeKey,
            { error: errReason, status: storeResult?.status || 'error' },
            TRANSIENT_RETRY_COOLDOWN_MS
          );
          storeStatuses[store] = {
            source: 'direct_failed',
            success: false,
            error: errReason,
            fallback: true
          };
        } else if (storeResult?.success === true && (!storeResult.products || storeResult.products.length === 0)) {
          // Direct fetch succeeded cleanly with 0 products
          PriceCache.set(storeKey, { products: [], source: 'direct_empty' }, EMPTY_SEARCH_TTL_MS);
          storeStatuses[store] = { source: 'direct_empty', success: true, count: 0, fallback: true };
        }
      } catch (directErr) {
        console.warn(`[candidatePipeline] Tier 1 direct fetch error: ${directErr.message}`);
        firstDirectError = firstDirectError || directErr.message;
        PriceCache.set(
          buildStoreCandidateCacheKey(normalizedQuery, store),
          { error: directErr.message, status: 'error' },
          TRANSIENT_RETRY_COOLDOWN_MS
        );
        storeStatuses[store] = {
          source: 'direct_failed',
          success: false,
          error: directErr.message,
          fallback: true
        };
      }
    }
  }

  // Step 3: Tier 2 Aggregator (trolley.co.uk) fallback for stores that still need candidates
  const aggregatorNeededStores = storesToAcquire.filter(
    (s) => !storeCandidateMap[s] || storeCandidateMap[s].length === 0
  );

  let aggregatorError = null;

  if (aggregatorNeededStores.length > 0) {
    try {
      const targetUrl = `https://www.trolley.co.uk/search/?q=${encodeURIComponent(normalizedQuery)}`;
      const scrapePromise = ScraperClient.fetchHtml(targetUrl, {
        waitForSelector: '.product-item, body',
        timeout: timeoutMs,
        delay: 500
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Live scrape timeout')), timeoutMs)
      );

      const { html } = await Promise.race([scrapePromise, timeoutPromise]);
      const parsedProducts = await GeminiDomParser.parseHtml(html, normalizedQuery);

      if (Array.isArray(parsedProducts) && parsedProducts.length > 0) {
        for (const store of aggregatorNeededStores) {
          const storeAggProds = parsedProducts.filter(
            (p) => normalizeSupermarketName(p.supermarket) === store
          );
          if (storeAggProds.length > 0) {
            const formatted = storeAggProds.map((p) => ({
              ...p,
              supermarket: p.supermarket || store,
              source: 'live',
              confidenceSource: 'aggregator'
            }));
            storeCandidateMap[store] = formatted;
            storeStatuses[store] = { source: 'live', success: true, count: formatted.length };
            PriceCache.set(
              buildStoreCandidateCacheKey(normalizedQuery, store),
              formatted,
              CANDIDATE_CACHE_TTL_MS
            );
          }
        }
      }
    } catch (err) {
      aggregatorError = err.message || 'Scrape failed';
    }
  }

  // Step 4: Tier 3 Catalog fallback for stores that still have no live products
  for (const store of targetStores) {
    if (!storeCandidateMap[store] || storeCandidateMap[store].length === 0) {
      if (!storeStatuses[store]) {
        storeStatuses[store] = {
          source: 'catalog',
          success: false,
          fallback: true,
          error: aggregatorError || firstDirectError || 'No live products found'
        };
      } else {
        storeStatuses[store].fallback = true;
      }
    }
  }

  const allProducts = Object.values(storeCandidateMap).flat();

  // Determine overall source
  let overallSource = 'catalog';
  const sources = Object.values(storeStatuses).map((s) => s.source);
  if (sources.length > 0 && sources.every((s) => s === 'cache')) {
    overallSource = 'cache';
  } else if (sources.some((s) => s === 'direct')) {
    overallSource = 'direct';
  } else if (sources.some((s) => s === 'live')) {
    overallSource = 'live';
  }

  // Write combined key for legacy consumers
  if (allProducts.length > 0) {
    const combinedKey = buildScrapeCacheKey(normalizedQuery, enabledStores);
    PriceCache.set(combinedKey, allProducts, CANDIDATE_CACHE_TTL_MS);
  }

  return {
    products: allProducts,
    source: overallSource,
    storeStatuses,
    error: aggregatorError || firstDirectError || null
  };
}

/**
 * Backward-compatible helper returning candidate products array directly.
 */
export async function getOrFetchCandidates(coreQuery, options = {}) {
  const res = await getOrFetchCandidatesWithSource(coreQuery, options);
  return res.products;
}
