import express from 'express';
import { PriceCache } from '../services/priceCache.js';
import { getUserSettings } from './settings.js';
import { ComparisonEngine, validateComparisonInput } from '../services/comparisonEngine.js';

export const compareRouter = express.Router();

/**
 * POST /api/compare
 * Compare shopping basket across all UK supermarkets using real live data + 72h persistent cache
 */
compareRouter.post('/', async (req, res) => {
  const validationError = validateComparisonInput(req.body);
  if (validationError) {
    return res.status(400).json(validationError);
  }

  const { items = [], preferences = getUserSettings(), forceRefresh = false } = req.body || {};

  if (preferences.enablePastSearches !== false && items.length > 0) {
    const rawList = items.map((i) => i.rawText || i.name).join('\n');
    PriceCache.recordSearch({
      query: items[0]?.name || 'Shopping List',
      rawList,
      itemsCount: items.length
    });
  }

  try {
    const comparison = await ComparisonEngine.runComparison({
      items,
      preferences,
      forceRefresh
    });

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
  const validationError = validateComparisonInput(req.body);
  if (validationError) {
    return res.status(400).json(validationError);
  }

  const { items = [], preferences = getUserSettings(), forceRefresh = false } = req.body || {};

  if (preferences.enablePastSearches !== false && items.length > 0) {
    const rawList = items.map((i) => i.rawText || i.name).join('\n');
    PriceCache.recordSearch({
      query: items[0]?.name || 'Shopping List',
      rawList,
      itemsCount: items.length
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  let isClosed = false;
  const heartbeat = setInterval(() => {
    if (isClosed) return;
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 8000);

  res.on('close', () => {
    if (!res.writableEnded) {
      isClosed = true;
    }
    clearInterval(heartbeat);
  });

  const sendEvent = (data) => {
    if (isClosed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const comparison = await ComparisonEngine.runComparison({
      items,
      preferences,
      forceRefresh,
      hooks: {
        isCancelled: () => isClosed || res.writableEnded,
        onInit: (initData) => {
          sendEvent({ type: 'init', ...initData });
        },
        onProgress: (progressData) => {
          sendEvent({ type: 'progress', ...progressData });
        },
        onItemMatched: (matchedData) => {
          sendEvent({ type: 'item_matched', ...matchedData });
        }
      }
    });

    clearInterval(heartbeat);

    if (!isClosed && !res.writableEnded) {
      if (comparison) {
        sendEvent({
          type: 'complete',
          comparison
        });
      }
      res.end();
    }
  } catch (err) {
    clearInterval(heartbeat);
    console.error('[Logic-API] Stream compare error:', err);
    if (!isClosed && !res.writableEnded) {
      sendEvent({
        type: 'error',
        error: err.message || 'Stream processing failed'
      });
      res.end();
    }
  }
});

/**
 * POST /api/compare/adjust
 * Recalculates basket comparison after an item swap or quantity override
 * through canonical server match builder and BasketCalculator.
 *
 * The caller sends `comparisonId` (returned by /api/compare) and what it wants changed.
 * The basket itself, its candidates and their prices/provenance are read from the server-owned
 * snapshot, so caller-supplied prices or source badges are never priced into a basket.
 */
compareRouter.post('/adjust', (req, res) => {
  try {
    const { comparisonId, store, itemIndex, itemId, selection, preferences } = req.body || {};
    const effectivePreferences = preferences || getUserSettings();

    const updatedComparison = ComparisonEngine.adjustComparison({
      comparisonId,
      store,
      itemIndex,
      itemId,
      selection,
      preferences: effectivePreferences
    });

    res.json(updatedComparison);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Comparison adjustment failed' });
  }
});

