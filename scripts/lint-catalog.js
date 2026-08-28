/**
 * Offline Benchmark Catalog Linter & Integrity Validator
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

lintCatalog();
