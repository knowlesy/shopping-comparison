import fs from 'fs';
import path from 'path';
import { SupermarketProduct, SupermarketInfo, IngredientIdea } from '../types';

const candidates = [
  path.resolve(__dirname, '../../../data/catalog.json'),
  path.resolve(process.cwd(), 'data/catalog.json')
];

let raw: any = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    try {
      raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    } catch (e) {
      // ignore
    }
  }
}

if (!raw) {
  raw = { supermarkets: {}, products: [], ingredientIdeas: [] };
}

export const SUPERMARKETS_INFO: Record<string, SupermarketInfo> = raw.supermarkets || {};
export const CATALOG_PRODUCTS: SupermarketProduct[] = raw.products || (Array.isArray(raw) ? raw : []);
export const DEFAULT_INGREDIENT_IDEAS: IngredientIdea[] = raw.ingredientIdeas || [];
