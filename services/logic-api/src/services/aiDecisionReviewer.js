/**
 * AI Decision Reviewer (Pluggable Candidate Selection Reviewer)
 *
 * Architecture Role:
 * Scraped supermarket products are initially scored by the deterministic FuzzyMatcher.
 * For high-confidence matches (score >= 0.85) or clear rejections (score < 0.50),
 * deterministic math is used directly.
 *
 * For borderline candidates (score 0.60 - 0.80) or ambiguous dietary / packaging substitutions,
 * this component provides an optional LLM reasoning hook (e.g., Gemini, Claude, or local Ollama)
 * to evaluate the candidates and select the optimal product.
 */

export class AiDecisionReviewer {
  /**
   * Check if AI decision reviewing is configured and active
   */
  static isEnabled() {
    const rawKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.AI_REVIEWER_API_KEY;
    return Boolean(rawKey && typeof rawKey === 'string' && rawKey.trim().length > 10);
  }

  /**
   * Evaluates top scraped candidates for an ambiguous ingredient query.
   *
   * @param {string} query - Raw user ingredient query (e.g. "5% lean beef mince 500g")
   * @param {object} item - Parsed ingredient object (targetQuantity, targetUnit, healthPreferences)
   * @param {Array<object>} candidates - Scraped candidate products scored by FuzzyMatcher
   * @param {object} options - User preferences and thresholds
   * @returns {Promise<object|null>} Selected product candidate with optional reasoning
   */
  static async reviewBorderlineCandidates(query, item, candidates, _options = {}) {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    // Default fast-path: return top scored candidate if AI review is not enabled
    if (!this.isEnabled()) {
      return candidates[0];
    }

    try {
      // TODO: Connect structured LLM candidate review prompt when API key is enabled:
      // Prompt inputs: { query, itemPreferences: item, topCandidates: candidates.slice(0, 5) }
      // Expected JSON output: { selectedProductId: string, confidenceScore: number, matchReason: string }
      return candidates[0];
    } catch (err) {
      console.warn(`[AI-Reviewer] Fallback to top scored candidate: ${err.message}`);
      return candidates[0];
    }
  }
}
