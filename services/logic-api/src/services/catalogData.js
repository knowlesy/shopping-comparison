import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidates = [
  path.resolve(__dirname, '../../../../data/catalog.json'),
  path.resolve(__dirname, '../../data/catalog.json'),
  path.resolve(process.cwd(), 'data/catalog.json'),
  path.resolve(process.cwd(), '../data/catalog.json'),
  path.resolve('/usr/src/app/data/catalog.json')
];

let catalogData = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    try {
      catalogData = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    } catch (e) {
      console.warn(`[CatalogData] Failed parsing ${p}:`, e.message);
    }
  }
}

if (!catalogData) {
  throw new Error('[CatalogData] Could not find data/catalog.json in any search path.');
}

export const SUPERMARKETS_INFO = catalogData.supermarkets || {};
export const CATALOG_PRODUCTS =
  catalogData.products || (Array.isArray(catalogData) ? catalogData : []);
export const DEFAULT_INGREDIENT_IDEAS = catalogData.ingredientIdeas || [];
