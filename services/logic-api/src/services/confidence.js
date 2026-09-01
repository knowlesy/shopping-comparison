/**
 * Structured Confidence Helper
 * Single source of truth for confidence scores, sources, and display labels.
 */

export const CONFIDENCE_BY_SOURCE = Object.freeze({
  ai: 0.95,
  direct: 0.90,
  aggregator: 0.60,
  catalog: 0.40
});

export const DEFAULT_CONFIDENCE = CONFIDENCE_BY_SOURCE;

const STORE_NAMES = {
  tesco: 'Tesco',
  sainsburys: "Sainsbury's",
  asda: 'Asda',
  morrisons: 'Morrisons',
  iceland: 'Iceland',
  waitrose: 'Waitrose',
  aldi: 'Aldi',
  lidl: 'Lidl',
  ocado: 'Ocado',
  coop: 'Co-op'
};

function formatStoreName(store) {
  if (!store) return null;
  const key = String(store).toLowerCase().trim();
  return STORE_NAMES[key] || (store.charAt(0).toUpperCase() + store.slice(1));
}

/**
 * Generates structured confidence object and backwards-compatible display label.
 * @param {number} [score] - Confidence score between 0 and 1 (e.g. 0.9, 0.6, 0.4)
 * @param {"direct" | "aggregator" | "ai" | "ai-cached" | "catalog"} [source] - Source of the match
 * @param {string} [customLabel] - Optional explicit label override or store name
 * @param {string} [store] - Optional store name for direct source
 * @returns {{ confidenceScore: number, confidenceSource: string, confidence: string }}
 */
export function formatConfidence(score = null, source = "aggregator", customLabel = null, store = null) {
  const resolvedScore = score !== null ? score : (CONFIDENCE_BY_SOURCE[source] ?? 0.60);
  let label = customLabel;

  if (!label || (source === 'direct' && !label.includes('%'))) {
    switch (source) {
      case "direct": {
        const storeName = store || (customLabel && !customLabel.includes('%') ? customLabel : null);
        const prettyStore = formatStoreName(storeName);
        const storeSuffix = prettyStore ? `${prettyStore} direct` : 'direct';
        label = `${Math.round(resolvedScore * 100)}% verified (${storeSuffix})`;
        break;
      }
      case "ai-cached":
        label = `${Math.round(resolvedScore * 100)}% verified (Gemini AI Match - Cached)`;
        break;
      case "ai":
        label = `${Math.round(resolvedScore * 100)}% verified (Gemini AI Match)`;
        break;
      case "catalog":
        label = `${Math.round(resolvedScore * 100)}% verified (Catalog benchmark)`;
        break;
      case "aggregator":
      default:
        label = `${Math.round(resolvedScore * 100)}% likely (Aggregator match)`;
        break;
    }
  }

  return {
    confidenceScore: resolvedScore,
    confidenceSource: source,
    confidence: label
  };
}
