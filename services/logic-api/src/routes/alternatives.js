import express from 'express';
import { CATALOG_PRODUCTS } from '../services/catalogData.js';
import { isContaminated } from '../services/contaminationRules.js';
import { PriceCache } from '../services/priceCache.js';
import { getCoreSearchQuery, getOrFetchCandidates } from '../services/candidatePipeline.js';

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

  const cacheKey = `cache:alt:${store}:${query}`;

  if (forceRefresh !== 'true' && PriceCache.has(cacheKey)) {
    return res.json({ alternatives: PriceCache.get(cacheKey) });
  }

  try {
    const coreQuery = getCoreSearchQuery({ name: query });
    const queryLower = (query || '').toLowerCase();
    const coreLower = (coreQuery || '').toLowerCase();

    // 1. Get baseline catalog products immediately for 0ms responsiveness
    const catalogForStore = (CATALOG_PRODUCTS || []).filter((p) => {
      if (p.supermarket !== store) return false;
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

    let scrapedForStore = [];
    if (forceRefresh === 'true' || catalogForStore.length < 3) {
      try {
        const candidates = await getOrFetchCandidates(coreQuery, {
          forceRefresh: forceRefresh === 'true',
          timeoutMs: 5000
        });

        scrapedForStore = candidates.filter((p) => {
          if (p.supermarket !== store) return false;
          if (isContaminated(queryLower, p.title)) return false;
          return true;
        });
      } catch (_scrapeErr) {
        // Fast catalog fallback
      }
    }

    // Merge and deduplicate by title
    const seenTitles = new Set();
    const combined = [];

    for (const p of [...catalogForStore, ...scrapedForStore]) {
      const normTitle = p.title.toLowerCase().trim();
      if (!seenTitles.has(normTitle)) {
        seenTitles.add(normTitle);
        const isCatalog = p.source === 'catalog';
        combined.push({
          ...p,
          confidence: p.confidence || (isCatalog ? 'estimated' : 'verified'),
          confidenceSource: p.confidenceSource || (isCatalog ? 'catalog' : (p.source === 'direct' ? 'direct' : 'aggregator')),
          isEstimated: Boolean(isCatalog || p.confidence === 'estimated')
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
