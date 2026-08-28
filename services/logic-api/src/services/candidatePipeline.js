import { ScraperClient } from './scraperClient.js';
import { GeminiDomParser } from './geminiParser.js';
import { PriceCache } from './priceCache.js';

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
 * @param {string} coreQuery
 * @param {string[]} enabledStores
 * @returns {string}
 */
export function buildScrapeCacheKey(coreQuery, enabledStores = []) {
  const normalizedQuery = (coreQuery || '').toLowerCase().trim();
  const sortedStores =
    Array.isArray(enabledStores) && enabledStores.length > 0
      ? [...enabledStores].map((s) => String(s).toLowerCase().trim()).sort().join(',')
      : 'all';
  return `cache:v2:scrape:${normalizedQuery}:${sortedStores}`;
}

/**
 * Shared candidate pipeline for fetching candidates with 72h PriceCache check, bounded scraping, and source tracking.
 * @param {string} coreQuery - Normalized ingredient search query
 * @param {object} options - { forceRefresh, timeoutMs, enabledStores }
 * @returns {Promise<{ products: Array, source: 'live' | 'cache' | 'catalog', error?: string }>}
 */
export async function getOrFetchCandidatesWithSource(coreQuery, options = {}) {
  const { forceRefresh = false, timeoutMs = 15000, enabledStores = [] } = options;
  const cacheKey = buildScrapeCacheKey(coreQuery, enabledStores);

  if (!forceRefresh) {
    if (PriceCache.has(cacheKey)) {
      return {
        products: [...PriceCache.get(cacheKey)],
        source: 'cache'
      };
    }
    // Backward compatibility with legacy dual-tagged keys
    if (PriceCache.has(`${cacheKey}:deals`)) {
      return {
        products: [...PriceCache.get(`${cacheKey}:deals`)],
        source: 'cache'
      };
    }
    if (PriceCache.has(`${cacheKey}:raw`)) {
      return {
        products: [...PriceCache.get(`${cacheKey}:raw`)],
        source: 'cache'
      };
    }
  }

  let candidateProducts = [];
  let source = 'catalog';
  let error = null;

  try {
    const targetUrl = `https://www.trolley.co.uk/search/?q=${encodeURIComponent(coreQuery)}`;

    const scrapePromise = ScraperClient.fetchHtml(targetUrl, {
      waitForSelector: '.product-item, body',
      timeout: timeoutMs,
      delay: 500
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Live scrape timeout')), timeoutMs)
    );

    const { html } = await Promise.race([scrapePromise, timeoutPromise]);
    candidateProducts = await GeminiDomParser.parseHtml(html, coreQuery);
    if (candidateProducts && candidateProducts.length > 0) {
      source = 'live';
    }
  } catch (err) {
    // Gracefully proceed with verified catalog products
    error = err.message || 'Scrape failed';
    source = 'catalog';
  }

  // Save / refresh persistent cache
  if (candidateProducts.length > 0) {
    PriceCache.set(cacheKey, candidateProducts);
  }

  return {
    products: candidateProducts,
    source,
    error
  };
}

/**
 * Backward-compatible helper returning candidate products array directly.
 */
export async function getOrFetchCandidates(coreQuery, options = {}) {
  const res = await getOrFetchCandidatesWithSource(coreQuery, options);
  return res.products;
}
