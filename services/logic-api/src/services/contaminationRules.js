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
  const isFreshFood = /\bfresh\b/i.test(superDept) ||
                      /\bfresh\s*(?:food|produce|fruit|veg|meat|fish|salad|poultry)\b/i.test(`${superDept} ${dept} ${aisle}`);

  if (itemCategory === 'produce') {
    // Fresh produce / fresh food taxonomy is positive evidence that the candidate belongs to the category
    if (isFreshFood) {
      return false;
    }

    const isSweetQuery = /\b(?:dessert|cake|chocolate|sweet|biscuit|candy|pudding|ice\s*cream|drink|juice|smoothie|jam|marmalade)\b/i.test(queryText);
    if (!isSweetQuery) {
      // Act on whichever taxonomy levels arrive as a hierarchy:
      // Level 3: Aisle level (specific)
      if (
        aisle &&
        /\b(?:chocolate|chocolates|sweets|confectionery|desserts?|biscuits?|candy|crisps?|cakes?|jelly|jellies|ice\s*cream|ice\s*loll(?:y|ies)|snack\s*pots?|meringues?)\b/i.test(aisle)
      ) {
        return true;
      }

      // Level 2: Department level (intermediate)
      if (
        dept &&
        /\b(?:confectionery|chocolates?|sweets?|biscuits?|desserts?|crisps?|snacks?|cakes?)\b/i.test(dept)
      ) {
        return true;
      }

      // Level 1: SuperDepartment level (broadest)
      if (superDept) {
        if (/\b(?:drinks?|beverages?|pet\s*care|household|health\s*&\s*beauty|baby(?:\s*&\s*toddler)?)\b/i.test(superDept)) {
          return true;
        }
        if (/\b(?:confectionery|treats(?:\s*&\s*snacks)?|desserts?)\b/i.test(superDept)) {
          return true;
        }
        // An ambient Food Cupboard candidate cannot satisfy a fresh produce request
        // unless preserved/canned produce was explicitly requested (e.g. puree, paste, tinned)
        const isPreservedProduce = /\b(?:puree|paste|passata|tinned|canned|dried)\b/i.test(queryText);
        if (!isPreservedProduce && superDept === 'food cupboard') {
          return true;
        }
      }
    }
  }

  if (itemCategory === 'dairy-eggs' && /\beggs?\b/i.test(queryText)) {
    if (isFreshFood) return false;
    const isSweetQuery = /\b(?:chocolate|easter|creme)\b/i.test(queryText);
    if (!isSweetQuery) {
      if (aisle && /\b(?:chocolate|chocolates|sweets|confectionery|toys?)\b/i.test(aisle)) return true;
      if (dept && /\b(?:chocolate|confectionery|sweets?|toys?)\b/i.test(dept)) return true;
      if (superDept && /\b(?:confectionery|treats(?:\s*&\s*snacks)?|toys?|household|pet\s*care)\b/i.test(superDept)) return true;
    }
  }

  if (itemCategory === 'meat' || itemCategory === 'fish') {
    if (isFreshFood) return false;
    const isPetQuery = /\b(?:pet|dog|cat)\b/i.test(queryText);
    if (!isPetQuery) {
      if (aisle && /\b(?:pet\s*food|dog\s*food|cat\s*food|pet\s*treats?)\b/i.test(aisle)) return true;
      if (dept && /\b(?:pet\s*food|pet\s*care|pet\s*treats?)\b/i.test(dept)) return true;
      if (superDept && /\b(?:pet\s*care|household)\b/i.test(superDept)) return true;
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

