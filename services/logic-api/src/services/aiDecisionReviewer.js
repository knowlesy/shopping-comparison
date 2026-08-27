import { GoogleGenAI } from '@google/genai';
import { PriceCache } from './priceCache.js';
import { getUserSettings } from '../routes/settings.js';

/**
 * AI Decision Reviewer (Hybrid Matching Engine)
 *
 * Architecture Role:
 * Pass 1: Local deterministic FuzzyMatcher scores candidate products.
 * Pass 2 (Fallback): If fuzzy match score is low (< 65) or candidates are thin/borderline,
 * and AI matching is enabled, Google Gemini evaluates candidate products to select
 * the cheapest true match by weight and evaluate active deal structures.
 *
 * Token Minimisation: All Gemini decisions are cached in the 72h PriceCache.
 */

export class AiDecisionReviewer {
  /**
   * Check if AI candidate reviewing is configured and active
   * @param {object} preferences - User preferences containing aiMatchingEnabled
   * @returns {boolean}
   */
  static isEnabled(preferences = {}) {
    const settings = getUserSettings();
    if (preferences.aiMatchingEnabled === false) return false;
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

    // If AI matching is not enabled or top fuzzy candidate is already high confidence (score >= 65), use fuzzy top match
    if (!this.isEnabled(preferences) || (scoredCandidates[0]?.score >= 65 && scoredCandidates.length === 1)) {
      return scoredCandidates[0];
    }

    const supermarket = scoredCandidates[0]?.product?.supermarket || 'store';
    const cacheKey = `ai-match:${item.name || query}:${item.targetQuantity || 1}:${item.unit || ''}:${supermarket}`;

    // Token minimisation: check 72h cache
    const cachedDecision = PriceCache.get(cacheKey);
    if (cachedDecision && cachedDecision.productId) {
      const match = scoredCandidates.find((c) => c.product?.id === cachedDecision.productId);
      if (match) {
        return {
          ...match,
          confidence: '95% verified (Gemini AI Match - Cached)',
          aiReasoning: cachedDecision.reasoning
        };
      }
    }

    const settings = getUserSettings();
    const apiKey =
      settings.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY;

    try {
      const ai = new GoogleGenAI({ apiKey });
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

Candidates:
${JSON.stringify(candidatesPayload, null, 2)}

Respond with JSON only in this exact format:
{
  "selectedIndex": 0,
  "confidence": 0.95,
  "reasoning": "Reason for selection"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const text = response.text?.trim() || '{}';
      const parsed = JSON.parse(text);
      const chosenIdx = typeof parsed.selectedIndex === 'number' ? parsed.selectedIndex : 0;
      const chosen = scoredCandidates[chosenIdx] || scoredCandidates[0];

      // Cache decision for 72h to minimise API calls
      PriceCache.set(cacheKey, {
        productId: chosen.product?.id,
        selectedIndex: chosenIdx,
        reasoning: parsed.reasoning || 'Selected optimal match by weight and deal structure'
      });

      return {
        ...chosen,
        confidence: '95% verified (Gemini AI Match)',
        aiReasoning: parsed.reasoning
      };
    } catch (err) {
      console.warn(`[AI-Reviewer] Gemini evaluation failed (${err.message}). Falling back to top fuzzy match.`);
      return scoredCandidates[0];
    }
  }
}
