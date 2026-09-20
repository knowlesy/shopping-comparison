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
    const candidateStatusesByStore = {};
    for (const s of enabledStores) {
      storeMatchesMap[s] = [];
      candidateStatusesByStore[s] = [];
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

      const { products: candidateProducts, source, storeStatuses = {}, error: scrapeErr } =
        await getOrFetchCandidatesWithSource(coreQuery, {
          forceRefresh,
          enabledStores,
          includeDeals: preferences.includeDeals !== false,
          preferences: enrichedPreferences
        });

      for (const store of enabledStores) {
        if (storeStatuses[store]) {
          candidateStatusesByStore[store].push({
            itemIndex,
            itemId,
            ...storeStatuses[store]
          });
        }
      }

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
    for (const store of enabledStores) {
      const statuses = candidateStatusesByStore[store];
      const failed = statuses.filter((status) => status.success === false);
      const fallbackItems = statuses.filter((status) => status.fallback).length;
      comparison.supermarkets[store].candidateStatus = {
        fallbackItems,
        failedItems: failed.length,
        sources: [...new Set(statuses.map((status) => status.source))],
        lastError: failed.at(-1)?.error
      };
    }
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
      candidateStatuses: candidateStatusesByStore,
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

  /**
   * Adjusts a single item in an existing comparison (product swap and/or quantity override)
   * and returns a completely recalculated comparison without re-scraping.
   */
  static adjustComparison({
    comparison,
    store,
    itemIndex,
    itemId,
    selection,
    preferences = getUserSettings()
  }) {
    // 1. Validate comparison shape
    if (!comparison || typeof comparison !== 'object' || !Array.isArray(comparison.parsedItems) || !comparison.supermarkets || typeof comparison.supermarkets !== 'object') {
      throw new Error('Invalid comparison payload: parsedItems and supermarkets required');
    }

    const items = comparison.parsedItems;
    if (items.length === 0) {
      throw new Error('Comparison contains no parsed items');
    }

    // 2. Validate store
    if (!store || typeof store !== 'string' || !isKnownSupermarket(store)) {
      throw new Error(`Invalid or unknown supermarket: ${store}`);
    }

    if (!comparison.supermarkets[store] || !Array.isArray(comparison.supermarkets[store].items)) {
      throw new Error(`Supermarket "${store}" is not present in comparison`);
    }

    const storeItems = comparison.supermarkets[store].items;

    // 3. Resolve target item index
    let targetIndex = -1;
    if (itemIndex !== undefined && itemIndex !== null) {
      const idx = Number(itemIndex);
      if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) {
        throw new Error(`Invalid itemIndex: ${itemIndex}`);
      }
      targetIndex = idx;
    } else if (itemId !== undefined && itemId !== null) {
      const sid = String(itemId);
      targetIndex = items.findIndex((it, idx) => it.id === sid || `item_${idx}` === sid);
      if (targetIndex === -1) {
        targetIndex = storeItems.findIndex((m, idx) => m.itemId === sid || m.parsedItem?.id === sid || `item_${idx}` === sid);
      }
      if (targetIndex === -1) {
        throw new Error(`Item with id "${itemId}" not found in comparison`);
      }
    } else {
      throw new Error('Either itemIndex or itemId must be provided');
    }

    const item = items[targetIndex];
    const currentMatch = storeItems[targetIndex];
    if (!currentMatch) {
      throw new Error(`Match not found at index ${targetIndex} for store ${store}`);
    }

    // 4. Validate selection
    if (!selection || typeof selection !== 'object') {
      throw new Error('Selection must be an object');
    }

    // Packs validation
    let packs = undefined;
    if (selection.packs !== undefined) {
      if (selection.packs === null) {
        throw new Error('packs must be a positive integer between 1 and 99');
      }
      packs = Number(selection.packs);
      if (!Number.isInteger(packs) || packs < 1 || packs > 99) {
        throw new Error('packs must be a positive integer between 1 and 99');
      }
    }

    // Product validation
    let chosenProduct = null;
    let isSwap = false;
    if (selection.product !== undefined && selection.product !== null) {
      const prod = selection.product;
      if (typeof prod !== 'object' || !prod.id || typeof prod.title !== 'string' || prod.title.trim().length === 0) {
        throw new Error('Invalid product selection: valid id and title required');
      }
      if (typeof prod.price !== 'number' || isNaN(prod.price) || prod.price < 0) {
        throw new Error('Invalid product selection: price must be a non-negative number');
      }
      if (prod.supermarket && prod.supermarket !== store) {
        throw new Error(`Product supermarket (${prod.supermarket}) does not match requested store (${store})`);
      }
      chosenProduct = prod;
      isSwap = !currentMatch.product || currentMatch.product.id !== prod.id;
    } else {
      if (!currentMatch.product) {
        throw new Error('Cannot adjust quantity on an item with no matched product');
      }
      chosenProduct = currentMatch.product;
    }

    // 5. Build updated match result
    const packOverrides = packs !== undefined ? { packs } : (isSwap ? null : (currentMatch.packsNeeded ? { packs: currentMatch.packsNeeded } : null));
    const selectionPayload = {
      product: chosenProduct,
      isUserSwap: true,
      matchSource: isSwap ? 'user-swap' : (currentMatch.matchSource || 'user-swap'),
      matchConfidence: isSwap ? 1.0 : (currentMatch.matchConfidence ?? 1.0),
      matchBadge: isSwap ? 'User Selected' : currentMatch.matchBadge,
      aiReasoning: isSwap ? undefined : currentMatch.aiReasoning
    };

    const updatedMatch = MatchResultBuilder.applySelection(currentMatch, selectionPayload, {
      item,
      supermarket: store,
      preferences,
      packOverrides
    });

    updatedMatch.itemIndex = targetIndex;
    updatedMatch.itemId = item.id || `item_${targetIndex}`;

    // 6. Assemble storeMatchesMap across all supermarkets
    const storeMatchesMap = {};
    const enabledSupermarkets = Object.keys(comparison.supermarkets);
    for (const s of enabledSupermarkets) {
      const existingMatches = [...(comparison.supermarkets[s].items || [])];
      if (s === store) {
        existingMatches[targetIndex] = updatedMatch;
      }
      storeMatchesMap[s] = existingMatches;
    }

    // 7. Compute full updated comparison
    const updatedComparison = BasketCalculator.computeComparison(
      items,
      storeMatchesMap,
      enabledSupermarkets
    );

    // Preserve metadata
    if (comparison.aiCallsUsed !== undefined) {
      updatedComparison.aiCallsUsed = comparison.aiCallsUsed;
    }
    if (comparison.aiBudget !== undefined) {
      updatedComparison.aiBudget = comparison.aiBudget;
    }
    if (comparison.meta) {
      updatedComparison.meta = { ...comparison.meta };
    }

    return updatedComparison;
  }
}
