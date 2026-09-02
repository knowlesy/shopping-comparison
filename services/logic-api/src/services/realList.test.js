import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IngredientParser } from './ingredientParser.js';
import { FuzzyMatcher } from './fuzzyMatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REAL_LIST_PATH = path.resolve(__dirname, '../../../../tests/fixtures/real-list.json');

describe('Real 52-Line List Reality Fixtures & Match Fidelity', () => {
  const REAL_52_LIST = JSON.parse(fs.readFileSync(REAL_LIST_PATH, 'utf8'));

  it('should correctly parse all sentinel items from the real list', () => {
    // Sentinel 1: Maris Piper potatoes 1.8
    const potatoes = IngredientParser.parseItem('Maris Piper potatoes 1.8 kg');
    assert.ok(potatoes.name.toLowerCase().includes('maris piper potatoes') || potatoes.baseItem.toLowerCase().includes('potatoes'));
    assert.equal(potatoes.targetQuantity, 1.8);
    assert.equal(potatoes.unit, 'kg');
    assert.equal(potatoes.category, 'produce');

    // Sentinel 2: Tinned sardines in olive oil 2 x 120
    const sardines = IngredientParser.parseItem('Tinned sardines in olive oil 2 x 120 g');
    assert.ok(sardines.name.toLowerCase().includes('sardines'));
    assert.equal(sardines.multiplier, 2);
    assert.equal(sardines.targetQuantity, 240);
    assert.equal(sardines.unit, 'g');

    // Sentinel 3: Reduced-salt stock cubes
    const stockCubes = IngredientParser.parseItem('Reduced-salt stock cubes 3 (adults only, never for infant)');
    assert.ok(stockCubes.name.toLowerCase().includes('stock cubes'));
    assert.equal(stockCubes.targetQuantity, 3);
  });

  it('should parse all real-world lines with valid names and positive quantities', () => {
    const parsed = IngredientParser.parseList(REAL_52_LIST.join('\n'));
    // Since herb line expands to 7 items, 51 lines + 7 = 58 items
    assert.equal(parsed.length, 58);

    for (const item of parsed) {
      assert.ok(item.name && item.name.length > 0, `Empty name for ${item.rawText}`);
      assert.ok(item.targetQuantity > 0, `Invalid quantity for ${item.rawText}`);
      assert.ok(item.category, `Missing category for ${item.rawText}`);
    }
  });

  it('should reject nonsense matches and prevent cross-category contamination', () => {
    // Apples 250 g must NOT match spinach or other unrelated categories
    const appleItem = IngredientParser.parseItem('Apples 250 g');
    const spinachMatch = FuzzyMatcher.matchProduct('custom_store', appleItem, [
      { id: 't-spinach', title: 'Tesco Baby Spinach 250g', price: 1.10, category: 'produce' }
    ]);
    assert.equal(spinachMatch.product, null, 'Apples 250g must not match Baby Spinach 250g');

    // Walnuts 200 g must NOT match tomato puree
    const walnutItem = IngredientParser.parseItem('Walnuts 200 g');
    const pureeMatch = FuzzyMatcher.matchProduct('custom_store', walnutItem, [
      { id: 't-puree', title: 'Tesco Tomato Puree 200g', price: 0.65, category: 'store-cupboard' }
    ]);
    assert.equal(pureeMatch.product, null, 'Walnuts 200g must not match Tomato Puree 200g');
  });

  it('should match covered staples to genuine products in catalog', () => {
    const milkItem = IngredientParser.parseItem('Whole milk 4 pints');
    const milkMatch = FuzzyMatcher.matchProduct('tesco', milkItem);
    assert.ok(milkMatch.product, 'Whole milk should find a genuine match in Tesco catalog');
    assert.ok(milkMatch.product.title.toLowerCase().includes('milk'));

    const bananaItem = IngredientParser.parseItem('Bananas 6');
    const bananaMatch = FuzzyMatcher.matchProduct('tesco', bananaItem);
    assert.ok(bananaMatch.product, 'Bananas should match in Tesco catalog');
    assert.ok(bananaMatch.product.title.toLowerCase().includes('banana'));
  });
});
