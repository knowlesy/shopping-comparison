import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { detectItemCategory } from './ingredientParser.js';

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
  const matchRegex = rule.matchPattern ? new RegExp(rule.matchPattern, 'i') : null;
  const matchNegateRegex = rule.matchNegatePattern ? new RegExp(rule.matchNegatePattern, 'i') : null;
  const prohibitedRegex = new RegExp(rule.prohibitedPattern, 'i');

  return {
    category: rule.category,
    matchCategory: rule.matchCategory,
    matchQuery: (q, category) => {
      // 1. If query explicitly requests a derivative form (e.g. "orange juice", "strawberry jam"), negate
      if (matchNegateRegex && matchNegateRegex.test(q)) {
        return false;
      }
      // 2. Drive produce rule from parsed category
      const cat = category || detectItemCategory(q);
      if (rule.matchCategory && cat === rule.matchCategory) {
        return true;
      }
      if (rule.category === 'produce-derivatives' && cat === 'produce') {
        return true;
      }
      // 3. Fallback to noun matchPattern
      if (matchRegex && matchRegex.test(q)) {
        return true;
      }
      return false;
    },
    prohibited: prohibitedRegex
  };
});

/**
 * Checks if a product title is contaminated for a given user query.
 * @param {string|object} query - The search query / item name or parsed item object
 * @param {string} productTitle - The title of the product candidate
 * @returns {boolean} true if contaminated/prohibited, false otherwise
 */
export function isContaminated(query, productTitle) {
  if (!query || !productTitle) return false;
  const qStr = typeof query === 'string'
    ? query
    : `${query.baseItem || ''} ${query.name || ''} ${query.rawText || ''}`.trim();
  const qLower = qStr.toLowerCase();
  const tLower = String(productTitle).toLowerCase();
  const itemCategory = typeof query === 'object' && query.category ? query.category : detectItemCategory(qLower);

  for (const rule of CONTAMINATION_RULES) {
    if (rule.matchQuery(qLower, itemCategory)) {
      if (rule.prohibited.test(tLower)) {
        return true;
      }
    }
  }
  return false;
}
