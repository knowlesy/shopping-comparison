/**
 * Structured Confidence Helper
 * Single source of truth for confidence scores, sources, and display labels.
 */

/**
 * Generates structured confidence object and backwards-compatible display label.
 * @param {number} score - Confidence score between 0 and 1 (e.g. 0.8, 0.95, 1.0)
 * @param {"aggregator" | "ai" | "ai-cached" | "catalog"} source - Source of the match
 * @param {string} [customLabel] - Optional explicit label override
 * @returns {{ confidenceScore: number, confidenceSource: string, confidence: string }}
 */
export function formatConfidence(score = 0.8, source = "aggregator", customLabel = null) {
  let label = customLabel;

  if (!label) {
    switch (source) {
      case "ai-cached":
        label = `${Math.round(score * 100)}% verified (Gemini AI Match - Cached)`;
        break;
      case "ai":
        label = `${Math.round(score * 100)}% verified (Gemini AI Match)`;
        break;
      case "catalog":
        label = `${Math.round(score * 100)}% verified (Catalog benchmark)`;
        break;
      case "aggregator":
      default:
        label = `${Math.round(score * 100)}% likely (Aggregator match)`;
        break;
    }
  }

  return {
    confidenceScore: score,
    confidenceSource: source,
    confidence: label
  };
}
