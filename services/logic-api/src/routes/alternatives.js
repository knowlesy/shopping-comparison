import express from 'express';
import { CATALOG_PRODUCTS } from '../services/catalogData.js';
import { isContaminated } from '../services/contaminationRules.js';
import { PriceCache } from '../services/priceCache.js';
import {
  getCoreSearchQuery,
  getOrFetchCandidatesWithSource
} from '../services/candidatePipeline.js';
import { normalizeSupermarketName } from '../services/supermarkets.js';

export const alternativesRouter = express.Router();

/**
 * GET /api/products/alternatives
 * Get live product alternatives for an item in a specific store (with 72h caching)
 */
alternativesRouter.get('/', async (req, res) => {
  const { store, query, forceRefresh } = req.query;

  if (!store || !query) {
    return res.status(400).json({ error: 'Missing store or query parameter' });
  }

  const normalizedStore = normalizeSupermarketName(store);
  const normalizedQuery = (query || '').toLowerCase().trim();
  const cacheKey = `cache:alt:${normalizedStore}:${normalizedQuery}`;

  if (forceRefresh !== 'true' && PriceCache.has(cacheKey)) {
    return res.json({ alternatives: PriceCache.get(cacheKey) });
  }

  try {
    const coreQuery = getCoreSearchQuery({ name: query });
    const queryLower = normalizedQuery;
    const coreLower = (coreQuery || '').toLowerCase();

    // 1. Get baseline catalog products
    const catalogForStore = (CATALOG_PRODUCTS || []).filter((p) => {
      if (normalizeSupermarketName(p.supermarket) !== normalizedStore) return false;
      const titleLower = p.title.toLowerCase();
      const catLower = (p.category || '').toLowerCase();
      const subLower = (p.subCategory || '').toLowerCase();

      // Negative filters for non-staples / contaminated items
      if (isContaminated(queryLower, p.title)) return false;

      return (
        titleLower.includes(coreLower) ||
        coreLower.split(' ').some((w) => w.length > 2 && titleLower.includes(w)) ||
        (catLower && queryLower.includes(catLower)) ||
        (subLower && queryLower.includes(subLower))
      );
    });

    // 2. Fetch or retrieve candidate products for this specific store
    // Reuses compare candidates from per-store cache in 0ms without redundant network calls
    let scrapedForStore = [];
    try {
      const { products: candidates } = await getOrFetchCandidatesWithSource(coreQuery, {
        forceRefresh: forceRefresh === 'true',
        enabledStores: [normalizedStore],
        timeoutMs: 5000
      });

      scrapedForStore = (candidates || []).filter((p) => {
        if (normalizeSupermarketName(p.supermarket) !== normalizedStore) return false;
        if (isContaminated(queryLower, p.title)) return false;
        return true;
      });
    } catch (_scrapeErr) {
      // Fast catalog fallback
    }

    // 3. Merge and deduplicate: Direct / live scraped candidates FIRST so they win deduplication
    // over catalog benchmarks (Acceptance condition 4)
    const seenTitles = new Set();
    const combined = [];

    // Direct / live candidates first
    for (const p of scrapedForStore) {
      const normTitle = p.title.toLowerCase().trim();
      if (!seenTitles.has(normTitle)) {
        seenTitles.add(normTitle);
        const isDirect = p.source === 'direct' || p.confidenceSource === 'direct';
        combined.push({
          ...p,
          confidence: p.confidence || (isDirect ? 'verified' : 'live'),
          confidenceSource: p.confidenceSource || (isDirect ? 'direct' : 'aggregator'),
          isEstimated: false
        });
      }
    }

    // Catalog baseline second for unique unlisted items; duplicates are dropped
    for (const p of catalogForStore) {
      const normTitle = p.title.toLowerCase().trim();
      if (!seenTitles.has(normTitle)) {
        seenTitles.add(normTitle);
        combined.push({
          ...p,
          confidence: 'estimated',
          confidenceSource: 'catalog',
          isEstimated: true
        });
      }
    }

    PriceCache.set(cacheKey, combined);
    res.json({ alternatives: combined });
  } catch (err) {
    console.error('[Logic-API] Alternatives error:', err.message);
    res.status(500).json({ error: err.message, alternatives: [] });
  }
});
