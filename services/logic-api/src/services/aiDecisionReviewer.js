import { GoogleGenAI } from '@google/genai';
import { PriceCache } from './priceCache.js';
import { getUserSettings } from '../routes/settings.js';
import { composeConfidence } from './confidence.js';
import { AiPolicy } from './aiPolicy.js';
import { isContaminated } from './contaminationRules.js';

try {
  process.loadEnvFile();
} catch {}

/**
 * AI Decision Reviewer (Hybrid Matching Engine)
 *
 * Architecture Role:
 * Pass 1: Local deterministic FuzzyMatcher scores candidate products.
 * Pass 2 (Fallback): Governed by AiPolicy (ladder, assist level, per-basket budget).
 * When fired, Google Gemini evaluates candidate products to select
 * the cheapest true match by weight and evaluate active deal structures.
 *
 * Token Minimisation: All Gemini decisions are cached in the 72h PriceCache.
 */

export class AiDecisionReviewer {
  static _clientFactory = null;

  /**
   * Seam for injecting test Gemini clients in offline unit/robustness tests
   * @param {Function} fn - Function receiving { apiKey, model } and returning client with models.generateContent
   */
  static setClientFactory(fn) {
    this._clientFactory = fn;
  }

  /**
   * Reset client factory back to default GoogleGenAI
   */
  static resetClientFactory() {
    this._clientFactory = null;
  }

  /**
   * Check if AI candidate reviewing is configured and active
   * @param {object} preferences - User preferences containing aiMatchingEnabled
   * @returns {boolean}
   */
  static isEnabled(preferences = {}) {
    const settings = getUserSettings();
    if (preferences.aiMatchingEnabled === false) return false;
    if (preferences.aiAssistLevel === 'off') return false;
    const key =
      settings.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY;
    const isExplicitlyEnabled =
      preferences.aiMatchingEnabled === true ||
      settings.aiMatchingEnabled === true ||
      process.env.ENABLE_GEMINI_MATCHING === 'true';

    return Boolean(isExplicitlyEnabled && key && typeof key === 'string' && key.trim().length > 5);
  }

  /**
   * Evaluates top scraped candidates for an ingredient query using Gemini.
   *
   * @param {string} query - Raw user ingredient query (e.g. "5% lean beef mince 900g")
   * @param {object} item - Parsed ingredient object
   * @param {Array<object>} scoredCandidates - Candidates scored by FuzzyMatcher
   * @param {object} preferences - User preferences
   * @returns {Promise<object|null>} Selected product candidate
   */
  static async reviewCandidates(query, item, scoredCandidates = [], preferences = {}) {
    if (!scoredCandidates || scoredCandidates.length === 0) {
      return null;
    }

    const settings = getUserSettings();
    const mergedPrefs = { ...settings, ...preferences };
    const topScore = scoredCandidates[0]?.score ?? 0;
    const secondScore = scoredCandidates[1]?.score ?? 0;
    const callsUsed = preferences.aiCallsContext?.callsUsed ?? preferences.aiCallsUsed ?? 0;
    const maxCalls = mergedPrefs.aiMaxCallsPerBasket ?? 25;
    const aiAssistLevel = mergedPrefs.aiAssistLevel ?? (this.isEnabled(mergedPrefs) ? 'balanced' : 'off');
    const aiStages = mergedPrefs.aiStages ?? { interpret: true, query: false, select: true };

    const policyDecision = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel,
      aiStages,
      callsUsed,
      maxCalls,
      aiMaxCallsPerBasket: maxCalls,
      topScore,
      secondScore,
      hasNoResult: scoredCandidates.length === 0 || topScore === 0
    });

    // If AI matching is not enabled or AiPolicy decides not to fire, use top fuzzy candidate
    if (!this.isEnabled(preferences) || (!preferences.forceReview && !policyDecision.fire)) {
      return scoredCandidates[0];
    }

    const supermarket = scoredCandidates[0]?.product?.supermarket || 'store';
    const cacheKey = `ai-match:${item.name || query}:${item.targetQuantity || 1}:${item.unit || ''}:${supermarket}`;

    // Token minimisation: check 72h cache unless explicitly bypassed
    const cachedDecision = preferences.bypassCache ? null : PriceCache.get(cacheKey);
    if (cachedDecision && cachedDecision.productId) {
      const match = scoredCandidates.find((c) => c.product?.id === cachedDecision.productId);
      if (match) {
        const dataSource = match.product?.source || 'catalog';
        const cachedConf = typeof cachedDecision.confidence === 'number' ? cachedDecision.confidence : 0.9;
        const conf = composeConfidence({
          dataSource,
          matchConfidence: Math.min(Math.max(cachedConf, 0.5), 0.99),
          matchSource: 'ai-cached',
          store: supermarket
        });
        return {
          ...match,
          ...conf,
          aiReasoning: cachedDecision.reasoning
        };
      }
    }

    const apiKey =
      settings.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY;

    // Increment basket AI call counter for every attempt (failed calls consume quota)
    if (preferences.aiCallsContext && typeof preferences.aiCallsContext.callsUsed === 'number') {
      preferences.aiCallsContext.callsUsed++;
    }

    try {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const ai = this._clientFactory
        ? this._clientFactory({ apiKey, model })
        : new GoogleGenAI({ apiKey });

      // Model sees only the top 5 candidates; indexing must be bounded to this payload
      const candidatesPayload = scoredCandidates.slice(0, 5).map((c, idx) => ({
        index: idx,
        id: c.product?.id,
        title: c.product?.title,
        brand: c.product?.brand,
        packageSize: c.product?.packageSize,
        packageUnit: c.product?.packageUnit,
        price: c.product?.price,
        unitPrice: c.product?.unitPrice,
        unitPriceMeasure: c.product?.unitPriceMeasure,
        deal: c.product?.deal?.rawText || null,
        packsNeeded: c.packs,
        totalPrice: c.totalPrice
      }));

      const prompt = `You are an expert UK supermarket grocery price comparison assistant.
User requested ingredient: "${item.rawText || query}"
Target: ${item.targetQuantity || 1} ${item.unit || 'items'}, Health/Dietary: ${item.isHealthierPreferred ? 'Healthier/Lean' : 'Standard'} (fat preference: ${item.fatPercentage || 'any'}%).

Evaluate these candidate products from ${supermarket.toUpperCase()} and select the single best, cheapest genuine match by weight and dietary equivalence. Account for any active multibuy deals.
If none of the candidates are genuine matches (e.g. dietary or category mismatch with no acceptable alternative), return selectedIndex as null.

Candidates:
${JSON.stringify(candidatesPayload, null, 2)}

Respond with JSON only in this exact format:
{
  "selectedIndex": 0,
  "confidence": 0.9,
  "reasoning": "Reason for selection"
}`;

      const timeoutMs = 3500;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`AI candidate review timed out (exceeded ${timeoutMs}ms)`)), timeoutMs)
      );

      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0
          }
        }),
        timeoutPromise
      ]);

      const text = response.text?.trim() || '{}';
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Malformed JSON fails closed to rules without an AI confidence stamp
        return scoredCandidates[0];
      }

      if (!parsed || typeof parsed !== 'object') {
        return scoredCandidates[0];
      }

      // Model decline: selectedIndex null indicates none of the candidates match
      if (parsed.selectedIndex === null) {
        return {
          ...scoredCandidates[0],
          product: null,
          matchScore: 0,
          totalPrice: 0,
          matchConfidence: Math.min(Math.max(Number(parsed.confidence) || 0.8, 0.5), 0.99),
          matchSource: 'ai',
          aiReasoning: parsed.reasoning || 'Model declined: no candidate matches the query'
        };
      }

      // Bounds validation: reject negative, non-integer, or out-of-range indices
      if (
        typeof parsed.selectedIndex !== 'number' ||
        !Number.isInteger(parsed.selectedIndex) ||
        parsed.selectedIndex < 0 ||
        parsed.selectedIndex >= candidatesPayload.length
      ) {
        // Reject invalid index and fall back to rules without AI confidence stamp
        return scoredCandidates[0];
      }

      const chosenIdx = parsed.selectedIndex;
      const chosen = scoredCandidates[chosenIdx];
      if (!chosen || !chosen.product) {
        return scoredCandidates[0];
      }

      // Contamination check: re-applied to AI pick to prevent AI from repealing food form guarantees
      const itemText = `${item.baseItem || ''} ${item.name || ''} ${item.rawText || ''}`.toLowerCase();
      const prodTitle = chosen.product.title || '';
      if (isContaminated(itemText, prodTitle)) {
        console.warn(`[AI-Reviewer] AI pick "${prodTitle}" is contaminated for "${itemText}". Rejecting AI pick and falling back to rules.`);
        return scoredCandidates[0];
      }

      // Model's reported confidence, clamped to sane range [0.5, 0.99]
      const rawConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.8;
      const matchConfidence = Math.min(Math.max(rawConfidence, 0.5), 0.99);

      // Cache decision for 72h to minimise API calls
      if (!preferences.bypassCache) {
        PriceCache.set(cacheKey, {
          productId: chosen.product.id,
          selectedIndex: chosenIdx,
          confidence: matchConfidence,
          reasoning: parsed.reasoning || 'Selected optimal match by weight and deal structure'
        });
      }

      const dataSource = chosen.product.source || 'catalog';
      const conf = composeConfidence({
        dataSource,
        matchConfidence,
        matchSource: 'ai',
        store: supermarket
      });

      return {
        ...chosen,
        ...conf,
        aiReasoning: parsed.reasoning
      };
    } catch (err) {
      console.warn(`[AI-Reviewer] Gemini evaluation failed (${err.message}). Falling back to top fuzzy match.`);
      return scoredCandidates[0];
    }
  }
}

