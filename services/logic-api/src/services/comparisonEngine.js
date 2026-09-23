import { FuzzyMatcher } from './fuzzyMatcher.js';
import { MatchResultBuilder } from './matchResultBuilder.js';
import { BasketCalculator } from './basketCalculator.js';
import { PenaltyRules } from './penaltyRules.js';
import { PriceCache } from './priceCache.js';
import { getCoreSearchQuery, getOrFetchCandidatesWithSource } from './candidatePipeline.js';
import { getUserSettings } from '../routes/settings.js';
import { PriceHistory } from './priceHistory.js';
import { AiPolicy } from './aiPolicy.js';
import { AiDecisionReviewer } from './aiDecisionReviewer.js';
import { AiEscalation } from './aiEscalation.js';
import { MatchLog } from './matchLog.js';
import { saveComparisonContext, loadComparisonContext, resolveTrustedProduct } from './comparisonContext.js';
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

  // `undefined` means "not supplied" and falls back to saved settings in the routes.
  // An explicit `null` is an invalid value: the handlers read preferences before their
  // try/catch, so letting it through produces an unhandled TypeError instead of a 400.
  if (preferences !== undefined) {
    if (preferences === null || typeof preferences !== 'object' || Array.isArray(preferences)) {
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
    // Every candidate this comparison actually considered, kept so that a later basket edit can
    // resolve a chosen product id against server-held data instead of trusting the browser.
    const candidatesByItem = [];
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

      candidatesByItem[i] = Array.isArray(candidateProducts) ? candidateProducts : [];

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
        // After AI review and escalation, so the flag describes the product actually chosen.
        PenaltyRules.annotateFoodRating(finalMatch, item, enrichedPreferences);

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

    comparison.comparisonId = saveComparisonContext({
      items,
      storeMatchesMap,
      enabledStores,
      candidatesByItem,
      derived: {
        aiCallsUsed: comparison.aiCallsUsed,
        aiBudget: comparison.aiBudget,
        meta: comparison.meta,
        candidateStatus: Object.fromEntries(
          enabledStores.map((s) => [s, comparison.supermarkets[s]?.candidateStatus])
        )
      }
    });

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
    // Escalation is the batched fallback of the selection stage, so it follows the saved
    // `select` switch — settingsStore only permits interpret/query/select, so an `escalate`
    // key can never be saved and the user-facing control would otherwise do nothing here.
    // An explicit request-only `escalate` boolean still overrides, so a caller can isolate
    // escalation from per-item review.
    const aiStages = enrichedPreferences.aiStages;
    if (aiStages) {
      if (typeof aiStages.escalate === 'boolean') {
        if (aiStages.escalate === false) return;
      } else if (aiStages.select === false) {
        return;
      }
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
    comparisonId,
    store,
    itemIndex,
    itemId,
    selection,
    preferences = getUserSettings()
  }) {
    // 1. Resolve the server-owned snapshot of this comparison.
    //    The caller supplies only an opaque id and what it wants changed; every item, match,
    //    price and provenance badge used below comes from server-held data.
    const context = loadComparisonContext(comparisonId);
    if (!context) {
      throw new Error(
        'Comparison context is unknown or has expired; re-run the comparison before editing the basket'
      );
    }

    const items = context.items;
    if (items.length === 0) {
      throw new Error('Comparison contains no parsed items');
    }

    // 2. Validate store
    if (!store || typeof store !== 'string' || !isKnownSupermarket(store)) {
      throw new Error(`Invalid or unknown supermarket: ${store}`);
    }

    const storeItems = context.storeMatchesMap[store];
    if (!Array.isArray(storeItems)) {
      throw new Error(`Supermarket "${store}" is not present in comparison`);
    }

    // 3. Resolve target item index
    let targetIndex;
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

    // Product resolution. Only the id is taken from the caller; price, source, title, deals and
    // every other field come from the candidate this comparison actually considered, so a
    // tampered price or an invented "direct" badge cannot reach the basket.
    let chosenProduct;
    let isSwap = false;
    if (selection.product !== undefined && selection.product !== null) {
      const prod = selection.product;
      const productId =
        typeof prod === 'string' || typeof prod === 'number'
          ? prod
          : (prod && typeof prod === 'object' ? prod.id : null);
      if (productId === undefined || productId === null || String(productId).trim().length === 0) {
        throw new Error('Invalid product selection: a product id is required');
      }
      if (prod && typeof prod === 'object' && prod.supermarket && prod.supermarket !== store) {
        throw new Error(`Product supermarket (${prod.supermarket}) does not match requested store (${store})`);
      }

      const trusted = resolveTrustedProduct(context, targetIndex, store, productId);
      if (!trusted) {
        throw new Error(
          `Product "${productId}" is not a candidate of this comparison for ${store}`
        );
      }
      chosenProduct = trusted;
      isSwap = !currentMatch.product || String(currentMatch.product.id) !== String(trusted.id);
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

    // 6. Assemble storeMatchesMap from the trusted snapshot. Untouched lines are the server's
    //    own previous results, not anything the caller sent back.
    const storeMatchesMap = {};
    const enabledSupermarkets = context.enabledStores?.length
      ? [...context.enabledStores]
      : Object.keys(context.storeMatchesMap);
    for (const s of enabledSupermarkets) {
      const existingMatches = [...(context.storeMatchesMap[s] || [])];
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

    // Re-apply the metadata the snapshot recorded at acquisition time.
    const derived = context.derived || {};
    if (derived.aiCallsUsed !== undefined) {
      updatedComparison.aiCallsUsed = derived.aiCallsUsed;
    }
    if (derived.aiBudget !== undefined) {
      updatedComparison.aiBudget = derived.aiBudget;
    }
    if (derived.meta) {
      updatedComparison.meta = { ...derived.meta };
    }
    for (const s of enabledSupermarkets) {
      const status = derived.candidateStatus?.[s];
      if (status && updatedComparison.supermarkets[s]) {
        updatedComparison.supermarkets[s].candidateStatus = status;
      }
    }

    // Successive edits chain onto the same context.
    updatedComparison.comparisonId = saveComparisonContext({
      comparisonId,
      items,
      storeMatchesMap,
      enabledStores: enabledSupermarkets,
      candidatesByItem: context.candidatesByItem,
      derived
    });

    return updatedComparison;
  }
}
