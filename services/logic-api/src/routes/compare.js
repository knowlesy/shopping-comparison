import express from 'express';
import { FuzzyMatcher } from '../services/fuzzyMatcher.js';
import { BasketCalculator } from '../services/basketCalculator.js';
import {
  getCoreSearchQuery,
  getOrFetchCandidatesWithSource
} from '../services/candidatePipeline.js';
import { getUserSettings } from './settings.js';

export const compareRouter = express.Router();

/**
 * POST /api/compare
 * Compare shopping basket across all UK supermarkets using real live data + 72h persistent cache
 */
compareRouter.post('/', async (req, res) => {
  const { items = [], preferences = getUserSettings(), forceRefresh = false } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No shopping items provided for comparison' });
  }

  console.log(
    `[Logic-API] Comparing ${items.length} items across UK supermarkets (forceRefresh: ${forceRefresh})...`
  );
  const enabledStores = preferences.enabledSupermarkets || [
    'asda',
    'sainsburys',
    'tesco',
    'morrisons',
    'iceland',
    'aldi',
    'lidl'
  ];

  const storeMatchesMap = {};
  for (const s of enabledStores) {
    storeMatchesMap[s] = [];
  }

  const sourcesCount = { live: 0, cache: 0, catalog: 0 };

  try {
    for (const item of items) {
      const coreQuery = getCoreSearchQuery(item);
      const { products: candidateProducts, source } =
        await getOrFetchCandidatesWithSource(coreQuery, {
          forceRefresh,
          enabledStores
        });

      if (sourcesCount[source] !== undefined) {
        sourcesCount[source]++;
      }

      for (const store of enabledStores) {
        const match = FuzzyMatcher.matchProduct(store, item, candidateProducts, preferences);
        storeMatchesMap[store].push(match);
      }
    }

    const comparison = BasketCalculator.computeComparison(items, storeMatchesMap, enabledStores);
    comparison.meta = {
      sources: {
        live: sourcesCount.live,
        cache: sourcesCount.cache,
        catalog: sourcesCount.catalog
      }
    };

    console.log(
      `[Logic-API] Comparison complete. Cheapest store: ${comparison.cheapestStore.toUpperCase()} (sources: live=${sourcesCount.live}, cache=${sourcesCount.cache}, catalog=${sourcesCount.catalog})`
    );
    res.json(comparison);
  } catch (err) {
    console.error('[Logic-API] Compare endpoint error:', err);
    res.status(500).json({
      error: `Live comparison failed: ${err.message}`
    });
  }
});

/**
 * POST /api/compare/stream
 * Server-Sent Events (SSE) streaming comparison for real-time progress updates + 72h caching
 */
compareRouter.post('/stream', async (req, res) => {
  const { items = [], preferences = getUserSettings(), forceRefresh = false } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No shopping items provided for comparison' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  const enabledStores = preferences.enabledSupermarkets || [
    'asda',
    'sainsburys',
    'tesco',
    'morrisons',
    'iceland',
    'aldi',
    'lidl'
  ];
  const totalChecks = items.length * enabledStores.length;

  // Periodic SSE heartbeat comment to prevent proxy or browser socket timeouts
  let isClosed = false;
  const heartbeat = setInterval(() => {
    if (isClosed) return;
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 8000);

  req.on('close', () => {
    isClosed = true;
    clearInterval(heartbeat);
  });

  res.write(
    `data: ${JSON.stringify({
      type: 'init',
      totalItems: items.length,
      totalStores: enabledStores.length,
      totalChecks,
      completedChecks: 0,
      percent: 0,
      status: `Initialized comparison for ${items.length} items across ${enabledStores.length} supermarkets...`
    })}\n\n`
  );

  const storeMatchesMap = {};
  for (const s of enabledStores) {
    storeMatchesMap[s] = [];
  }

  const sourcesCount = { live: 0, cache: 0, catalog: 0 };

  try {
    for (let i = 0; i < items.length; i++) {
      if (isClosed) break;
      const item = items[i];
      const coreQuery = getCoreSearchQuery(item);

      res.write(
        `data: ${JSON.stringify({
          type: 'progress',
          currentItemIndex: i + 1,
          totalItems: items.length,
          totalChecks,
          completedChecks: i * enabledStores.length,
          percent: Math.round((i / items.length) * 100),
          itemName: item.name,
          status: `[${i + 1}/${items.length}] Checking prices for "${item.name}"...`
        })}\n\n`
      );

      const { products: candidateProducts, source } =
        await getOrFetchCandidatesWithSource(coreQuery, {
          forceRefresh,
          enabledStores
        });

      if (sourcesCount[source] !== undefined) {
        sourcesCount[source]++;
      }

      if (isClosed) break;

      for (const store of enabledStores) {
        const match = FuzzyMatcher.matchProduct(store, item, candidateProducts, preferences);
        storeMatchesMap[store].push(match);
      }

      if (isClosed) break;

      res.write(
        `data: ${JSON.stringify({
          type: 'item_matched',
          currentItemIndex: i + 1,
          totalItems: items.length,
          totalChecks,
          completedChecks: (i + 1) * enabledStores.length,
          percent: Math.round(((i + 1) / items.length) * 100),
          itemName: item.name,
          status: `[${i + 1}/${items.length}] Matched "${item.name}" across supermarkets.`
        })}\n\n`
      );
    }

    if (!isClosed) {
      const comparison = BasketCalculator.computeComparison(items, storeMatchesMap, enabledStores);
      comparison.meta = {
        sources: {
          live: sourcesCount.live,
          cache: sourcesCount.cache,
          catalog: sourcesCount.catalog
        }
      };

      res.write(
        `data: ${JSON.stringify({
          type: 'complete',
          comparison
        })}\n\n`
      );
    }
    clearInterval(heartbeat);
    res.end();
  } catch (err) {
    clearInterval(heartbeat);
    console.error('[Logic-API] Stream compare error:', err);
    if (!isClosed) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: err.message || 'Stream processing failed'
        })}\n\n`
      );
      res.end();
    }
  }
});
