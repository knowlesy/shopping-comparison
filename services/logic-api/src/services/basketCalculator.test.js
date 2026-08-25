import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BasketCalculator } from './basketCalculator.js';
import { IngredientParser } from './ingredientParser.js';
import { FuzzyMatcher } from './fuzzyMatcher.js';

describe('BasketCalculator', () => {
  const items = IngredientParser.parseList(['2 pints semi-skimmed milk', '6 free range eggs']);

  const enabledStores = ['asda', 'tesco', 'aldi'];
  const storeMatchesMap = {};
  for (const store of enabledStores) {
    storeMatchesMap[store] = items.map((item) =>
      FuzzyMatcher.matchProduct(store, item, [], { enabledSupermarkets: enabledStores })
    );
  }

  it('should compute full supermarket comparison matrix', () => {
    const comparison = BasketCalculator.computeComparison(items, storeMatchesMap, enabledStores);

    assert.ok(comparison);
    assert.ok(comparison.supermarkets);
    assert.equal(Object.keys(comparison.supermarkets).length, 3);
    assert.ok(comparison.cheapestStore);
    assert.ok(comparison.supermarkets[comparison.cheapestStore].totalPrice > 0);
  });

  it('should compute split-basket optimization with valid savings', () => {
    const comparison = BasketCalculator.computeComparison(items, storeMatchesMap, enabledStores);
    const split = comparison.splitOptimization;

    assert.ok(split);
    assert.ok(split.stores.length >= 1 && split.stores.length <= 3);
    assert.equal(typeof split.combinedTotal, 'number');
    assert.equal(typeof split.savingsVsSingleBest, 'number');
    const cheapestTotal = comparison.supermarkets[comparison.cheapestStore].totalPrice;
    assert.ok(split.combinedTotal <= cheapestTotal + 0.01);
  });
});
