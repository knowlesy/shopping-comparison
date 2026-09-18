import express from 'express';
import { FuzzyMatcher } from '../services/fuzzyMatcher.js';
import { BasketCalculator } from '../services/basketCalculator.js';
import { PriceCache } from '../services/priceCache.js';
import {
  getCoreSearchQuery,
  getOrFetchCandidatesWithSource
} from '../services/candidatePipeline.js';
import { getUserSettings } from './settings.js';
import { PriceHistory } from '../services/priceHistory.js';
import { AiPolicy } from '../services/aiPolicy.js';
import { AiDecisionReviewer } from '../services/aiDecisionReviewer.js';
import { AiEscalation } from '../services/aiEscalation.js';
import { MatchLog } from '../services/matchLog.js';

export const compareRouter = express.Router();

async function evaluateStoreMatch(store, item, candidateProducts, enrichedPreferences, aiCallsContext) {
  const match = FuzzyMatcher.matchProduct(store, item, candidateProducts, enrichedPreferences);

  const topScore = match.matchScore ?? (match.product ? 80 : 0);
  const runnerUp = match.runnerUp || (match.alternatives?.[0] ? { product: match.alternatives[0], score: Math.max(0, topScore - 10) } : null);
  const secondScore = runnerUp?.score ?? 0;
  const hasNoResult = !match.product || topScore === 0;

  let aiDecision = { fired: false, reason: 'confident_unambiguous_match', changed: false };

  // Fallback guard: AI fires only where rules are genuinely uncertain or missing results
  const policyDecision = AiPolicy.shouldFire({
    stage: 'select',
    aiAssistLevel: enrichedPreferences.aiAssistLevel || (AiDecisionReviewer.isEnabled(enrichedPreferences) ? 'balanced' : 'off'),
    aiStages: enrichedPreferences.aiStages,
    callsUsed: aiCallsContext.callsUsed,
    maxCalls: aiCallsContext.maxCalls,
    aiMaxCallsPerBasket: aiCallsContext.maxCalls,
    topScore,
    secondScore,
    hasNoResult
  });

  if (policyDecision.fire && AiDecisionReviewer.isEnabled(enrichedPreferences)) {
    const candidatesForReview = match.scoredCandidates && match.scoredCandidates.length > 0
      ? match.scoredCandidates
      : [
          ...(match.product ? [{ product: match.product, score: topScore, packs: match.packsNeeded || 1, totalPrice: match.totalPrice }] : []),
          ...(match.alternatives || []).map((p) => ({ product: p, score: secondScore || 40, packs: 1, totalPrice: p.price }))
        ];

    if (candidatesForReview.length > 0) {
      const query = item.rawText || item.name || '';
      const reviewed = await AiDecisionReviewer.reviewCandidates(
        query,
        item,
        candidatesForReview,
        enrichedPreferences
      );

      if (reviewed) {
        const aiProduct = reviewed.product || (reviewed.id ? reviewed : null);
        const isChanged = Boolean(aiProduct && aiProduct.id !== match.product?.id);
        aiDecision = {
          fired: true,
          reason: policyDecision.reason,
          changed: isChanged,
          aiReasoning: reviewed.aiReasoning || null
        };

        if (isChanged && aiProduct) {
          match.product = aiProduct;
          match.totalPrice = reviewed.totalPrice || aiProduct.price;
          match.matchConfidence = reviewed.matchConfidence || 0.85;
          match.matchSource = 'ai';
          match.matchBadge = reviewed.matchBadge || 'AI Reviewed';
          if (reviewed.aiReasoning) {
            match.aiReasoning = reviewed.aiReasoning;
          }
        }
      }
    }
  } else {
    aiDecision.reason = policyDecision.reason;
  }

  MatchLog.recordDecision({
    item,
    store,
    candidates: match.scoredCandidates || match.alternatives || [],
    winner: match,
    runnerUp,
    aiDecision,
    preferences: enrichedPreferences
  });

  return match;
}

async function maybeEscalateUnresolvedItems(items, storeMatchesMap, enabledStores, enrichedPreferences, aiCallsContext) {
  if (!AiDecisionReviewer.isEnabled(enrichedPreferences) || enrichedPreferences.aiEscalationEnabled === false) {
    return;
  }
  const remainingBudget = Math.max(0, aiCallsContext.maxCalls - aiCallsContext.callsUsed);
  if (remainingBudget <= 0) {
    return;
  }

  const problemItems = [];
  for (const item of items) {
    for (const store of enabledStores) {
      const storeMatches = storeMatchesMap[store] || [];
      const m = storeMatches.find((match) => (match.parsedItem?.name === item.name) || match.parsedItem === item);
      if (!m || !m.product || (m.matchScore && m.matchScore < 40)) {
        problemItems.push({
          query: item.rawText || item.name,
          item,
          candidates: m?.scoredCandidates || m?.alternatives || [],
          supermarket: store
        });
        break;
      }
    }
  }

  if (problemItems.length > 0) {
    try {
      const escalationResult = await AiEscalation.escalateBatch(problemItems, {
        ...enrichedPreferences,
        maxItems: Math.min(10, remainingBudget)
      });
      if (escalationResult && escalationResult.calls > 0) {
        aiCallsContext.callsUsed += escalationResult.calls;
      }
    } catch (err) {
      console.warn(`[Logic-API] Escalation batch failed: ${err.message}`);
    }
  }
}

const KNOWN_SUPERMARKETS = new Set([
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

/**
 * POST /api/compare
 * Compare shopping basket across all UK supermarkets using real live data + 72h persistent cache
 */
compareRouter.post('/', async (req, res) => {
  const { items = [], preferences = getUserSettings(), forceRefresh = false } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No shopping items provided for comparison' });
  }

  if (items.length > 500) {
    return res.status(400).json({ error: 'Shopping list exceeds maximum allowed length of 500 items' });
  }

  if (preferences && preferences.enabledSupermarkets && Array.isArray(preferences.enabledSupermarkets)) {
    const unknown = preferences.enabledSupermarkets.filter(
      (s) => !KNOWN_SUPERMARKETS.has(String(s).toLowerCase().trim())
    );
    if (unknown.length > 0) {
      return res.status(400).json({
        error: `Unknown supermarket(s) specified: ${unknown.join(', ')}`
      });
    }
  }

  if (preferences.enablePastSearches !== false && items.length > 0) {
    const rawList = items.map((i) => i.rawText || i.name).join('\n');
    PriceCache.recordSearch({
      query: items[0]?.name || 'Shopping List',
      rawList,
      itemsCount: items.length
    });
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

  const aiMaxCallsPerBasket = preferences.aiMaxCallsPerBasket ?? 25;
  const aiCallsContext = { callsUsed: 0, maxCalls: aiMaxCallsPerBasket, aiBudget: aiMaxCallsPerBasket };
  const enrichedPreferences = { ...preferences, aiCallsContext, aiMaxCallsPerBasket, aiBudget: aiMaxCallsPerBasket };

  const sourcesCount = { live: 0, cache: 0, catalog: 0, direct: 0 };
  let firstScrapeError = null;

  try {
    for (const item of items) {
      const coreQuery = getCoreSearchQuery(item);
      const { products: candidateProducts, source, error: scrapeErr } =
        await getOrFetchCandidatesWithSource(coreQuery, {
          forceRefresh,
          enabledStores,
          includeDeals: preferences.includeDeals !== false,
          preferences: enrichedPreferences
        });

      if (scrapeErr && !firstScrapeError) {
        firstScrapeError = scrapeErr;
      }

      if (sourcesCount[source] !== undefined) {
        sourcesCount[source]++;
      }

      for (const store of enabledStores) {
        const match = await evaluateStoreMatch(store, item, candidateProducts, enrichedPreferences, aiCallsContext);
        storeMatchesMap[store].push(match);
      }
    }

    await maybeEscalateUnresolvedItems(items, storeMatchesMap, enabledStores, enrichedPreferences, aiCallsContext);

    const comparison = BasketCalculator.computeComparison(items, storeMatchesMap, enabledStores);
    const aiCallsUsed = aiCallsContext.callsUsed;
    comparison.aiCallsUsed = aiCallsUsed;
    comparison.aiBudget = aiMaxCallsPerBasket;
    comparison.meta = {
      sources: {
        live: sourcesCount.live,
        cache: sourcesCount.cache,
        catalog: sourcesCount.catalog,
        direct: sourcesCount.direct
      },
      aiCallsUsed,
      aiBudget: aiMaxCallsPerBasket,
      scrapeError: firstScrapeError || undefined
    };

    if (firstScrapeError) {
      console.warn(`[Logic-API] Live scraping fallback to catalog: ${firstScrapeError}`);
    }

    PriceHistory.recordSnapshot(comparison);

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
  const { items = [], preferences = getUserSettings(), forceRefresh = false } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No shopping items provided for comparison' });
  }

  if (items.length > 500) {
    return res.status(400).json({ error: 'Shopping list exceeds maximum allowed length of 500 items' });
  }

  if (preferences && preferences.enabledSupermarkets && Array.isArray(preferences.enabledSupermarkets)) {
    const unknown = preferences.enabledSupermarkets.filter(
      (s) => !KNOWN_SUPERMARKETS.has(String(s).toLowerCase().trim())
    );
    if (unknown.length > 0) {
      return res.status(400).json({
        error: `Unknown supermarket(s) specified: ${unknown.join(', ')}`
      });
    }
  }

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

  const aiMaxCallsPerBasket = preferences.aiMaxCallsPerBasket ?? 25;
  const aiCallsContext = { callsUsed: 0, maxCalls: aiMaxCallsPerBasket, aiBudget: aiMaxCallsPerBasket };
  const enrichedPreferences = { ...preferences, aiCallsContext, aiMaxCallsPerBasket, aiBudget: aiMaxCallsPerBasket };

  const sourcesCount = { live: 0, cache: 0, catalog: 0, direct: 0 };
  let firstScrapeError = null;

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

      const { products: candidateProducts, source, error: scrapeErr } =
        await getOrFetchCandidatesWithSource(coreQuery, {
          forceRefresh,
          enabledStores,
          includeDeals: preferences.includeDeals !== false,
          preferences: enrichedPreferences
        });

      if (scrapeErr && !firstScrapeError) {
        firstScrapeError = scrapeErr;
      }

      if (sourcesCount[source] !== undefined) {
        sourcesCount[source]++;
      }

      if (isClosed) break;

      for (const store of enabledStores) {
        const match = await evaluateStoreMatch(store, item, candidateProducts, enrichedPreferences, aiCallsContext);
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
      await maybeEscalateUnresolvedItems(items, storeMatchesMap, enabledStores, enrichedPreferences, aiCallsContext);
      const comparison = BasketCalculator.computeComparison(items, storeMatchesMap, enabledStores);
      const aiCallsUsed = aiCallsContext.callsUsed;
      comparison.aiCallsUsed = aiCallsUsed;
      comparison.aiBudget = aiMaxCallsPerBasket;
      comparison.meta = {
        sources: {
          live: sourcesCount.live,
          cache: sourcesCount.cache,
          catalog: sourcesCount.catalog,
          direct: sourcesCount.direct
        },
        aiCallsUsed,
        aiBudget: aiMaxCallsPerBasket,
        scrapeError: firstScrapeError || undefined
      };

      if (firstScrapeError) {
        console.warn(`[Logic-API] Stream live scraping fallback to catalog: ${firstScrapeError}`);
      }

      PriceHistory.recordSnapshot(comparison);

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
