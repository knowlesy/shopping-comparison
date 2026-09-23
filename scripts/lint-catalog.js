/**
 * Offline Benchmark Catalog Linter & Integrity Validator
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { FOOD_CATEGORIES, MAX_TYPES_PER_CATEGORY } from '../shared/foodTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const catalogPath = path.resolve(__dirname, '../data/catalog.json');

const VALID_STORES = new Set([
  'tesco',
  'asda',
  'sainsburys',
  'morrisons',
  'iceland',
  'waitrose',
  'ocado',
  'coop',
  'aldi',
  'lidl'
]);

const VALID_UNITS = new Set([
  'g',
  'kg',
  'ml',
  'l',
  'pack',
  'item',
  'pint',
  'pints',
  'head',
  'bulb',
  'tube',
  'bunch',
  'loaf',
  'tin',
  'can',
  'pot',
  'tub',
  'box',
  'jar',
  'bag'
]);

function lintCatalog() {
  console.log('--- Linting Offline Benchmark Catalog ---');
  console.log(`Target: ${catalogPath}`);

  if (!fs.existsSync(catalogPath)) {
    console.error(`❌ Catalog file not found at ${catalogPath}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to parse catalog JSON: ${err.message}`);
    process.exit(1);
  }

  const products = data.products || (Array.isArray(data) ? data : []);
  if (!Array.isArray(products) || products.length === 0) {
    console.error('❌ Catalog contains no products array or is empty');
    process.exit(1);
  }

  console.log(`Validating ${products.length} catalog products...`);

  const seenIds = new Set();
  const errors = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const prefix = `[Product #${i + 1} (${p.id || 'NO_ID'})]`;

    // ID uniqueness
    if (!p.id || typeof p.id !== 'string') {
      errors.push(`${prefix} Missing or invalid string id`);
    } else if (seenIds.has(p.id)) {
      errors.push(`${prefix} Duplicate product id: "${p.id}"`);
    } else {
      seenIds.add(p.id);
    }

    // Title
    if (!p.title || typeof p.title !== 'string' || p.title.trim().length === 0) {
      errors.push(`${prefix} Missing or empty title`);
    }

    // Supermarket
    if (!p.supermarket || !VALID_STORES.has(p.supermarket.toLowerCase())) {
      errors.push(`${prefix} Invalid supermarket: "${p.supermarket}"`);
    }

    // Price
    if (typeof p.price !== 'number' || p.price <= 0 || isNaN(p.price)) {
      errors.push(`${prefix} Invalid price: ${p.price}`);
    }

    // Package size
    if (typeof p.packageSize !== 'number' || p.packageSize <= 0 || isNaN(p.packageSize)) {
      errors.push(`${prefix} Invalid packageSize: ${p.packageSize}`);
    }

    // Package unit
    if (!p.packageUnit || !VALID_UNITS.has(p.packageUnit.toLowerCase())) {
      errors.push(`${prefix} Invalid packageUnit: "${p.packageUnit}"`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ Catalog linting failed with ${errors.length} error(s):`);
    for (const err of errors.slice(0, 20)) {
      console.error(`  - ${err}`);
    }
    if (errors.length > 20) {
      console.error(`  ... and ${errors.length - 20} more errors.`);
    }
    process.exit(1);
  }

  console.log(`✅ Catalog linting passed! All ${products.length} products are valid.\n`);
}

/**
 * Validate the rateable food types in shared/foodTypes.js: unique ids, a bounded number of
 * types per category, and patterns that compile and are safe to call .test() on.
 */
function lintFoodTypes() {
  console.log('--- Linting Food Types ---');
  const errors = [];

  const checkPattern = (where, re, { allowGlobal = false } = {}) => {
    if (!(re instanceof RegExp)) {
      errors.push(`${where} is not a RegExp`);
      return;
    }
    try {
      new RegExp(re.source, re.flags);
    } catch (err) {
      errors.push(`${where} does not compile: ${err.message}`);
      return;
    }
    // A global or sticky pattern keeps lastIndex between .test() calls and gives
    // alternating answers for the same title.
    if (!allowGlobal && (re.global || re.sticky)) errors.push(`${where} must not use the g or y flag`);
    if (re.test('')) errors.push(`${where} matches an empty string`);
  };

  const categoryIds = new Set();
  for (const category of FOOD_CATEGORIES) {
    const where = `[category ${category.id || 'NO_ID'}]`;
    if (!category.id || typeof category.id !== 'string') errors.push(`${where} missing id`);
    else if (categoryIds.has(category.id)) errors.push(`${where} duplicate category id`);
    categoryIds.add(category.id);
    if (!category.label) errors.push(`${where} missing label`);

    checkPattern(`${where}.appliesTo`, category.appliesTo);
    if (category.excludes !== undefined) checkPattern(`${where}.excludes`, category.excludes);
    if (category.ignore !== undefined) checkPattern(`${where}.ignore`, category.ignore, { allowGlobal: true });

    if (!Array.isArray(category.types) || category.types.length === 0) {
      errors.push(`${where} has no types`);
      continue;
    }
    if (category.types.length > MAX_TYPES_PER_CATEGORY) {
      errors.push(`${where} has ${category.types.length} types; the most is ${MAX_TYPES_PER_CATEGORY}`);
    }
    const typeIds = new Set();
    for (const type of category.types) {
      const typeWhere = `${where}.${type.id || 'NO_ID'}`;
      if (!type.id || typeof type.id !== 'string') errors.push(`${typeWhere} missing id`);
      else if (typeIds.has(type.id)) errors.push(`${typeWhere} duplicate type id`);
      typeIds.add(type.id);
      if (!type.label) errors.push(`${typeWhere} missing label`);
      if (!(type.match instanceof RegExp)) {
        errors.push(`${typeWhere}.match is not a RegExp`);
        continue;
      }
      try {
        new RegExp(type.match.source, type.match.flags);
      } catch (err) {
        errors.push(`${typeWhere}.match does not compile: ${err.message}`);
      }
      if (type.match.global || type.match.sticky) errors.push(`${typeWhere}.match must not use the g or y flag`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ Food type linting failed with ${errors.length} error(s):`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  const typeCount = FOOD_CATEGORIES.reduce((n, c) => n + c.types.length, 0);
  console.log(`✅ Food types valid: ${FOOD_CATEGORIES.length} categories, ${typeCount} types.\n`);
}

lintCatalog();
lintFoodTypes();
