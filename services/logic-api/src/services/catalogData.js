import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultPath = path.resolve(__dirname, '../../../../data/catalog.json');
const containerPath = path.resolve(__dirname, '../../data/catalog.json');
const resolvedPath =
  process.env.CATALOG_PATH ||
  (fs.existsSync(defaultPath) ? defaultPath : containerPath);

let catalogData = null;
if (fs.existsSync(resolvedPath)) {
  try {
    catalogData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (e) {
    console.warn(`[CatalogData] Failed parsing ${resolvedPath}:`, e.message);
  }
}

if (!catalogData) {
  throw new Error(`[CatalogData] Could not find or parse catalog at ${resolvedPath}.`);
}

export const SUPERMARKETS_INFO = catalogData.supermarkets || {};
export const CATALOG_PRODUCTS =
  catalogData.products || (Array.isArray(catalogData) ? catalogData : []);
export const DEFAULT_INGREDIENT_IDEAS = catalogData.ingredientIdeas || [];
