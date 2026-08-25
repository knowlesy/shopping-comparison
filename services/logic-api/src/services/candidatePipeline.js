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
 * Shared candidate pipeline for fetching candidates with 72h PriceCache check and bounded scraping
 * @param {string} coreQuery - Normalized ingredient search query
 * @param {object} options - { forceRefresh, timeoutMs, enabledStores }
 * @returns {Promise<Array>} Array of candidate products
 */
export async function getOrFetchCandidates(coreQuery, options = {}) {
  const { forceRefresh = false, timeoutMs = 3500, _enabledStores = [] } = options;
  const cacheKey = `cache:scrape:${coreQuery}`;
  let candidateProducts = [];

  if (!forceRefresh && PriceCache.has(cacheKey)) {
    return [...PriceCache.get(cacheKey)];
  }

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
  } catch (_err) {
    // Gracefully proceed with verified catalog products
  }

  // Save / refresh persistent cache
  if (candidateProducts.length > 0) {
    PriceCache.set(cacheKey, candidateProducts);
  }
  return candidateProducts;
}
