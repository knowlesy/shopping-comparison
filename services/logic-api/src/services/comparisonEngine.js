import { FuzzyMatcher } from './fuzzyMatcher.js';
import { MatchResultBuilder } from './matchResultBuilder.js';
import { BasketCalculator } from './basketCalculator.js';
import { PriceCache } from './priceCache.js';
import { getCoreSearchQuery, getOrFetchCandidatesWithSource } from './candidatePipeline.js';
import { getUserSettings } from '../routes/settings.js';
import { PriceHistory } from './priceHistory.js';
import { AiPolicy } from './aiPolicy.js';
import { AiDecisionReviewer } from './aiDecisionReviewer.js';
import { AiEscalation } from './aiEscalation.js';
import { MatchLog } from './matchLog.js';
import { isKnownSupermarket, DEFAULT_ENABLED_SUPERMARKETS } from './supermarkets.js';

/**
 * Validates incoming comparison payload before any processing or side-effects occur.
 * Returns { error: string } if invalid, null if valid.
 */
export function validateComparisonInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const { items, preferences } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { error: 'No shopping items provided for comparison' };
  }

  if (items.length > 500) {
    return { error: 'Shopping list exceeds maximum allowed length of 500 items' };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: `Item at index ${i} is malformed: expected object` };
    }
    const name = item.rawText || item.name;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return { error: `Item at index ${i} is missing a valid name` };
    }
    if (item.targetQuantity !== undefined && item.targetQuantity !== null) {
      const num = Number(item.targetQuantity);
      if (isNaN(num) || num < 0) {
        return { error: `Item at index ${i} has invalid targetQuantity: must be a non-negative number` };
      }
    }
  }

  if (preferences !== undefined && preferences !== null) {
    if (typeof preferences !== 'object' || Array.isArray(preferences)) {
      return { error: 'Preferences must be an object' };
    }

    if (preferences.enabledSupermarkets !== undefined && preferences.enabledSupermarkets !== null) {
      if (!Array.isArray(preferences.enabledSupermarkets) || preferences.enabledSupermarkets.length === 0) {
        return { error: 'enabledSupermarkets must be a non-empty array of supermarket names' };
      }
      const unknown = preferences.enabledSupermarkets.filter((s) => !isKnownSupermarket(s));
      if (unknown.length > 0) {
        return { error: `Unknown supermarket(s) specified: ${unknown.join(', ')}` };
      }
    }
  }

  return null;
}

/**
 * Unified Comparison Engine
 *
 * Executes the complete grocery comparison workflow:
 * - Candidate fetching & caching
 * - Deterministic rules matching
 * - AI per-item candidate review
 * - Batched escalation for unresolved items
 * - Final diagnostic decision logging
 * - Basket optimization & price snapshotting
 */
export class ComparisonEngine {
  /**
   * Runs the comparison operation across all requested items and stores.
   *
   * @param {object} params
   * @param {Array<object>} params.items - Parsed or raw items array
   * @param {object} [params.preferences] - User preferences
   * @param {boolean} [params.forceRefresh=false] - Force live scrape bypass
   * @param {object} [params.hooks={}] - Progress & cancellation hooks
   * @returns {Promise<object|null>} Final comparison object or null if cancelled
   */
  static async runComparison({
    items = [],
    preferences = getUserSettings(),
    forceRefresh = false,
    hooks = {}
  }) {
    const enabledStores = preferences?.enabledSupermarkets || DEFAULT_ENABLED_SUPERMARKETS;
    const totalChecks = items.length * enabledStores.length;

    const aiMaxCallsPerBasket = preferences?.aiMaxCallsPerBasket ?? 25;
    const aiCallsContext = {
      callsUsed: 0,
      maxCalls: aiMaxCallsPerBasket,
      aiBudget: aiMaxCallsPerBasket
    };
    const enrichedPreferences = {
      ...preferences,
      aiCallsContext,
      aiMaxCallsPerBasket,
      aiBudget: aiMaxCallsPerBasket
    };

    // Notify initial state
    hooks.onInit?.({
      totalItems: items.length,
      totalStores: enabledStores.length,
      totalChecks,
      completedChecks: 0,
      percent: 0,
      status: `Initialized comparison for ${items.length} items across ${enabledStores.length} supermarkets...`
    });

    const storeMatchesMap = {};
    for (const s of enabledStores) {
      storeMatchesMap[s] = [];
    }

    const sourcesCount = { live: 0, cache: 0, catalog: 0, direct: 0 };
    let firstScrapeError = null;

    // Track per-store-per-item AI decisions for logging
    const aiDecisionsMap = new Map(); // key: `${store}:${itemIndex}` -> aiDecision

    for (let i = 0; i < items.length; i++) {
      if (hooks.isCancelled?.()) {
        return null;
      }

      const item = items[i];
      const itemIndex = i;
      const itemId = item.id || `item_${i}`;
      const coreQuery = getCoreSearchQuery(item);

      hooks.onProgress?.({
        currentItemIndex: i + 1,
        totalItems: items.length,
        totalChecks,
        completedChecks: i * enabledStores.length,
        percent: Math.round((i / items.length) * 100),
        itemName: item.name,
        status: `[${i + 1}/${items.length}] Checking prices for "${item.name}"...`
      });

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

      if (hooks.isCancelled?.()) {
        return null;
      }

      for (const store of enabledStores) {
        let match = FuzzyMatcher.matchProduct(store, item, candidateProducts, enrichedPreferences);

        const topScore = match.matchScore ?? (match.product ? 80 : 0);
        const runnerUp = match.runnerUp || (match.alternatives?.[0] ? { product: match.alternatives[0], score: Math.max(0, topScore - 10) } : null);
        const secondScore = runnerUp?.score ?? 0;
        const hasNoResult = !match.product || topScore === 0;

        let aiDecision = { fired: false, reason: 'confident_unambiguous_match', changed: false };

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

        const shouldAttemptReview =
          AiDecisionReviewer.isEnabled(enrichedPreferences) &&
          (policyDecision.fire || (enrichedPreferences.forceReview && policyDecision.reason !== 'budget_exhausted' && policyDecision.reason !== 'stage_disabled' && policyDecision.reason !== 'ai_assist_off'));

        if (shouldAttemptReview) {
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
              const initialProductId = match.product?.id || null;
              match = MatchResultBuilder.applySelection(match, reviewed, {
                item,
                supermarket: store,
                preferences: enrichedPreferences
              });

              const isChanged = Boolean(
                (match.product && match.product.id !== initialProductId) ||
                (!match.product && initialProductId !== null)
              );
              aiDecision = {
                fired: true,
                reason: policyDecision.reason,
                changed: isChanged,
                aiReasoning: match.aiReasoning || reviewed.aiReasoning || null
              };
            }
          }
        } else {
          aiDecision.reason = policyDecision.reason;
        }

        match.itemIndex = itemIndex;
        match.itemId = itemId;
        storeMatchesMap[store].push(match);
        aiDecisionsMap.set(`${store}:${itemIndex}`, aiDecision);
      }

      if (hooks.isCancelled?.()) {
        return null;
      }

      hooks.onItemMatched?.({
        currentItemIndex: i + 1,
        totalItems: items.length,
        totalChecks,
        completedChecks: (i + 1) * enabledStores.length,
        percent: Math.round(((i + 1) / items.length) * 100),
        itemName: item.name,
        status: `[${i + 1}/${items.length}] Matched "${item.name}" across supermarkets.`
      });
    }

    // Escalation pass for remaining unresolved / low-confidence items
    if (!hooks.isCancelled?.()) {
      await this.maybeEscalateUnresolvedItems(
        items,
        storeMatchesMap,
        enabledStores,
        enrichedPreferences,
        aiCallsContext,
        aiDecisionsMap
      );
    }

    if (hooks.isCancelled?.()) {
      return null;
    }

    // Record final decisions to MatchLog after all AI review and escalation is complete
    for (const store of enabledStores) {
      const matches = storeMatchesMap[store] || [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const finalMatch = matches[i];
        if (!finalMatch) continue;

        const aiDec = aiDecisionsMap.get(`${store}:${i}`) || {
          fired: finalMatch.matchSource === 'ai' || finalMatch.matchSource === 'ai-escalation',
          reason: finalMatch.matchSource || 'rules_sufficient',
          changed: Boolean(finalMatch.matchSource === 'ai' || finalMatch.matchSource === 'ai-escalation'),
          aiReasoning: finalMatch.aiReasoning || null
        };

        MatchLog.recordDecision({
          item,
          store,
          candidates: finalMatch.scoredCandidates || finalMatch.alternatives || [],
          winner: finalMatch,
          runnerUp: finalMatch.runnerUp,
          aiDecision: aiDec,
          preferences: enrichedPreferences
        });
      }
    }

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

    return comparison;
  }

  /**
   * Applies batched AI escalation to unresolved items with stable item identity.
   */
  static async maybeEscalateUnresolvedItems(
    items,
    storeMatchesMap,
    enabledStores,
    enrichedPreferences,
    aiCallsContext,
    aiDecisionsMap
  ) {
    if (!AiDecisionReviewer.isEnabled(enrichedPreferences) || enrichedPreferences.aiEscalationEnabled === false) {
      return;
    }
    if (enrichedPreferences.aiStages && enrichedPreferences.aiStages.escalate === false) {
      return;
    }

    const remainingBudget = Math.max(0, aiCallsContext.maxCalls - aiCallsContext.callsUsed);
    if (remainingBudget <= 0) {
      return;
    }

    const problemItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemId = item.id || `item_${i}`;
      for (const store of enabledStores) {
        const storeMatches = storeMatchesMap[store] || [];
        const m = storeMatches.find((match) => match.itemIndex === i) || storeMatches[i];
        if (!m || !m.product || (m.matchScore && m.matchScore < 40)) {
          problemItems.push({
            itemIndex: i,
            itemId,
            query: item.rawText || item.name,
            item,
            candidates: m?.scoredCandidates || m?.alternatives || [],
            supermarket: store
          });
        }
      }
    }

    if (problemItems.length > 0) {
      try {
        aiCallsContext.callsUsed++; // Account for attempt against budget even if call fails
        const escalationResult = await AiEscalation.escalateBatch(problemItems, {
          ...enrichedPreferences,
          maxItems: Math.min(10, remainingBudget)
        });

        if (escalationResult && Array.isArray(escalationResult.results)) {
          for (const escResult of escalationResult.results) {
            const storeMatches = storeMatchesMap[escResult.supermarket];
            if (!storeMatches) continue;
            const matchIndex = storeMatches.findIndex((m) => m.itemIndex === escResult.itemIndex);
            if (matchIndex === -1) continue;

            const currentMatch = storeMatches[matchIndex];
            const updatedMatch = MatchResultBuilder.applySelection(currentMatch, escResult, {
              item: escResult.item || currentMatch.parsedItem,
              supermarket: escResult.supermarket,
              preferences: enrichedPreferences
            });
            updatedMatch.itemIndex = escResult.itemIndex;
            updatedMatch.itemId = escResult.itemId;
            storeMatches[matchIndex] = updatedMatch;

            if (aiDecisionsMap) {
              aiDecisionsMap.set(`${escResult.supermarket}:${escResult.itemIndex}`, {
                fired: true,
                reason: 'ai_escalation',
                changed: Boolean(updatedMatch.product && updatedMatch.product.id !== currentMatch.product?.id),
                aiReasoning: escResult.reasoning || escResult.aiReasoning || null
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[Logic-API] Escalation batch failed: ${err.message}`);
      }
    }
  }
}
