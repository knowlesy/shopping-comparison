import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidatePaths = [
  process.env.CONTAMINATION_RULES_PATH,
  path.resolve(__dirname, '../../../../data/contamination-rules.json'),
  path.resolve(__dirname, '../../data/contamination-rules.json'),
  path.resolve(process.cwd(), 'data/contamination-rules.json')
].filter(Boolean);

let rawRules = null;
for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    rawRules = JSON.parse(fs.readFileSync(p, 'utf8'));
    break;
  }
}

if (!rawRules) {
  throw new Error('[Logic-API] Could not locate data/contamination-rules.json in candidate paths.');
}

/**
 * Data-driven food form contamination rules table loaded from data/contamination-rules.json.
 */
export const CONTAMINATION_RULES = rawRules.map((rule) => {
  const matchRegex = new RegExp(rule.matchPattern, 'i');
  const matchNegateRegex = rule.matchNegatePattern ? new RegExp(rule.matchNegatePattern, 'i') : null;
  const prohibitedRegex = new RegExp(rule.prohibitedPattern, 'i');

  return {
    category: rule.category,
    matchQuery: (q) => matchRegex.test(q) && (!matchNegateRegex || !matchNegateRegex.test(q)),
    prohibited: prohibitedRegex
  };
});

/**
 * Checks if a product title is contaminated for a given user query.
 * @param {string} query - The search query / item name
 * @param {string} productTitle - The title of the product candidate
 * @returns {boolean} true if contaminated/prohibited, false otherwise
 */
export function isContaminated(query, productTitle) {
  if (!query || !productTitle) return false;
  const qLower = String(query).toLowerCase();
  const tLower = String(productTitle).toLowerCase();

  for (const rule of CONTAMINATION_RULES) {
    if (rule.matchQuery(qLower)) {
      if (rule.prohibited.test(tLower)) {
        return true;
      }
    }
  }
  return false;
}
