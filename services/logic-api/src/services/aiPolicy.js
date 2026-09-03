/**
 * AI Policy Coordinator (Step 16)
 * Single owner of when AI fires across stages (interpret, query, select).
 * Enforces:
 * 1. AI Assist level (off, economy, balanced, thorough)
 * 2. Per-basket budget cap (aiMaxCallsPerBasket, default 25)
 * 3. Per-stage toggles (aiStages: { interpret: true, query: false, select: true })
 * 4. Uncertainty predicate:
 *    - select: topScore < 65 OR (topScore - secondScore) < 8 (near-tie) OR contamination near-miss
 */

export class AiPolicy {
  /**
   * Evaluates whether AI should fire for a given pipeline stage and context.
   *
   * @param {object} params
   * @param {"interpret" | "query" | "select"} [params.stage="select"] - Stage in matching pipeline
   * @param {"off" | "economy" | "balanced" | "thorough"} [params.aiAssistLevel="balanced"] - User assist level
   * @param {object} [params.aiStages] - Per-stage enabled map
   * @param {number} [params.callsUsed=0] - Number of AI calls made in this basket so far
   * @param {number} [params.maxCalls] - Hard per-basket AI budget cap
   * @param {number} [params.aiMaxCallsPerBasket] - Hard per-basket AI budget cap
   * @param {number} [params.topScore] - Top match score (0-100)
   * @param {number} [params.secondScore=0] - Second highest match score (0-100)
   * @param {boolean} [params.hasNoResult=false] - True if no candidate was found
   * @param {boolean} [params.isHighValue=false] - True for high-value items (£10+)
   * @param {boolean} [params.nearMiss=false] - True if top match trips potential contamination near-miss
   * @param {boolean} [params.ambiguous=false] - True if interpretation was ambiguous
   * @returns {{ fire: boolean, reason: string }}
   */
  static shouldFire(params = {}) {
    const {
      stage = 'select',
      aiAssistLevel = 'balanced',
      aiStages = { interpret: true, query: false, select: true },
      callsUsed = 0,
      topScore = 0,
      secondScore = 0,
      hasNoResult = false,
      isHighValue = false,
      nearMiss = false,
      ambiguous = false
    } = params;

    const maxBudget = params.maxCalls ?? params.aiMaxCallsPerBasket ?? 25;

    // 1. Off check
    if (aiAssistLevel === 'off') {
      return { fire: false, reason: 'ai_assist_off' };
    }

    // 2. Budget check: hard cap per basket
    if (callsUsed >= maxBudget) {
      return { fire: false, reason: 'budget_exhausted' };
    }

    // 3. Stage toggle check
    if (aiStages && aiStages[stage] === false) {
      return { fire: false, reason: 'stage_disabled' };
    }

    // 4. Uncertainty & Assist Level evaluation
    if (stage === 'select') {
      if (aiAssistLevel === 'economy') {
        // Economy: AI only when a stage would otherwise produce no result at all
        if (hasNoResult || topScore === 0) {
          return { fire: true, reason: 'economy_no_result' };
        }
        return { fire: false, reason: 'economy_has_result' };
      }

      const scoreDiff = topScore - secondScore;
      const isNearTie = scoreDiff < 8;
      const isLowConfidence = topScore < 65;

      if (aiAssistLevel === 'thorough') {
        // Thorough: also verifies confident matches on high-value items
        if (isHighValue) {
          return { fire: true, reason: 'thorough_high_value_verification' };
        }
        if (isLowConfidence) {
          return { fire: true, reason: 'low_confidence_match' };
        }
        if (isNearTie) {
          return { fire: true, reason: 'near_tie' };
        }
        if (nearMiss) {
          return { fire: true, reason: 'contamination_near_miss' };
        }
        return { fire: false, reason: 'confident_unambiguous_match' };
      }

      // Default: balanced
      if (isLowConfidence) {
        return { fire: true, reason: 'low_confidence_match' };
      }
      if (isNearTie) {
        return { fire: true, reason: 'near_tie' };
      }
      if (nearMiss) {
        return { fire: true, reason: 'contamination_near_miss' };
      }

      return { fire: false, reason: 'confident_unambiguous_match' };
    }

    if (stage === 'interpret') {
      if (aiAssistLevel === 'economy') {
        if (hasNoResult || ambiguous) {
          return { fire: true, reason: 'economy_interpret_ambiguous' };
        }
        return { fire: false, reason: 'economy_interpret_clear' };
      }
      if (ambiguous || hasNoResult) {
        return { fire: true, reason: 'interpret_uncertain' };
      }
      return { fire: false, reason: 'interpret_confident' };
    }

    if (stage === 'query') {
      if (hasNoResult || ambiguous) {
        return { fire: true, reason: 'query_refinement_needed' };
      }
      return { fire: false, reason: 'query_standard' };
    }

    return { fire: false, reason: 'unknown_stage' };
  }

  static decide(params = {}) {
    return this.shouldFire(params);
  }
}

export default AiPolicy;
