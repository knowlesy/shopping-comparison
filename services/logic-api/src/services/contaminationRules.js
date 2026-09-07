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
 * Checks if a candidate product's retailer taxonomy indicates contamination.
 * @param {string} queryText - Normalized query string
 * @param {string} itemCategory - Detected or parsed category of the query item
 * @param {object} product - Product candidate with optional retailer taxonomy
 * @returns {boolean} true if taxonomy indicates contamination, false otherwise
 */
function isTaxonomyContaminated(queryText, itemCategory, product) {
  if (!product || typeof product !== 'object') return false;

  const superDept = (product.superDepartmentName || '').toLowerCase();
  const dept = (product.departmentName || '').toLowerCase();
  const aisle = (product.aisleName || '').toLowerCase();

  // If retailer taxonomy explicitly confirms fresh produce or fresh food,
  // use it as positive evidence: it is NOT contaminated.
  const isFreshFood = /\bfresh\s*(?:food|produce|fruit|veg|meat|fish)\b/i.test(`${superDept} ${dept}`);

  if (itemCategory === 'produce') {
    // Fresh produce / fresh food taxonomy is positive evidence that the candidate belongs to the category
    if (isFreshFood) {
      return false;
    }

    const isSweetQuery = /\b(?:dessert|cake|chocolate|sweet|biscuit|candy|pudding|ice\s*cream|drink|juice|smoothie|jam|marmalade)\b/i.test(queryText);
    if (!isSweetQuery) {
      // Reject candidates whose taxonomy affirmatively places them in confectionery, dessert, chocolate, drinks, or pet aisles
      if (
        superDept === 'confectionery' ||
        /\b(?:confectionery|desserts?)\b/i.test(superDept) ||
        /\b(?:desserts?|chocolates?|sweets\s*&|biscuits\s*&)\b/i.test(dept) ||
        /\b(?:desserts?|chocolate\s+blocks|sweets\s*&|confectionery)\b/i.test(aisle)
      ) {
        return true;
      }
      if (/\b(?:drinks|pet\s*care|household)\b/i.test(superDept)) {
        return true;
      }
    }
  }

  if (itemCategory === 'dairy-eggs' && /\beggs?\b/i.test(queryText)) {
    if (isFreshFood) return false;
    const isSweetQuery = /\b(?:chocolate|easter|creme)\b/i.test(queryText);
    if (!isSweetQuery && (superDept === 'confectionery' || /\b(?:confectionery|chocolates?|toys?)\b/i.test(aisle))) {
      return true;
    }
  }

  if (itemCategory === 'meat' || itemCategory === 'fish') {
    if (isFreshFood) return false;
    const isPetQuery = /\b(?:pet|dog|cat)\b/i.test(queryText);
    if (!isPetQuery && (superDept === 'pet care' || /\b(?:pet\s*food|dog\s*food|cat\s*food)\b/i.test(aisle))) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a product title is contaminated for a given user query.
 * @param {string|object} query - The search query / item name or parsed item object
 * @param {string} productTitle - The title of the product candidate
 * @param {object} product - Optional candidate product metadata with retailer taxonomy
 * @returns {boolean} true if contaminated/prohibited, false otherwise
 */
export function isContaminated(query, productTitle, product) {
  if (!query || !productTitle) return false;
  const qStr = typeof query === 'string'
    ? query
    : `${query.baseItem || ''} ${query.name || ''} ${query.rawText || ''}`.trim();
  const qLower = qStr.toLowerCase();
  const tLower = String(productTitle).toLowerCase();
  const itemCategory = typeof query === 'object' && query.category ? query.category : detectItemCategory(qLower);

  // 1. Retailer taxonomy check
  if (isTaxonomyContaminated(qLower, itemCategory, product)) {
    return true;
  }

  // 2. Data-driven rule check against title
  for (const rule of CONTAMINATION_RULES) {
    if (rule.matchQuery(qLower, itemCategory)) {
      if (rule.prohibited.test(tLower)) {
        return true;
      }
    }
  }
  return false;
}

