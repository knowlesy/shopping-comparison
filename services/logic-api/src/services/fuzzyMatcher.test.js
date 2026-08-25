import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FuzzyMatcher } from './fuzzyMatcher.js';
import { IngredientParser } from './ingredientParser.js';

describe('FuzzyMatcher', () => {
  const preferences = {
    healthierDefault: true,
    fatPercentagePreference: 5,
    preferWholewheat: true,
    preferFreeRange: true,
    preferOrganic: false,
    brandTierPriority: 'standard',
    packSizingPolicy: 'closest',
    enabledSupermarkets: ['asda', 'tesco', 'aldi']
  };

  it('should match 6 free range eggs without processed contamination', () => {
    const item = IngredientParser.parseItem('6 free range eggs');
    const match = FuzzyMatcher.matchProduct('asda', item, [], preferences);

    assert.ok(match.product, 'Expected a matched product');
    assert.equal(match.supermarket, 'asda');
    assert.match(match.product.title, /egg/i);
    assert.doesNotMatch(match.product.title, /scotch/i);
    assert.doesNotMatch(match.product.title, /mayo/i);
    assert.ok(match.matchScore >= 40);
  });

  it('should calculate pack counts correctly for closest weight matching', () => {
    // 900g target with 500g packs should require 2 packs (1000g total)
    const item = IngredientParser.parseItem('900g 5% lean beef mince');
    const match = FuzzyMatcher.matchProduct('tesco', item, [], preferences);

    assert.ok(match.product);
    assert.equal(match.packsNeeded >= 1, true);
    assert.equal(match.totalQuantity >= 500, true);
    assert.equal(typeof match.totalPrice, 'number');
    assert.equal(match.totalPrice > 0, true);
  });

  it('should match Greek yogurt without dessert drink contamination', () => {
    const item = IngredientParser.parseItem('1kg authentic Greek yogurt 0%');
    const match = FuzzyMatcher.matchProduct('aldi', item, [], preferences);

    assert.ok(match.product);
    assert.match(match.product.title, /greek/i);
    assert.doesNotMatch(match.product.title, /corner/i);
    assert.doesNotMatch(match.product.title, /drink/i);
    assert.doesNotMatch(match.product.title, /frubes/i);
  });

  it('should return clean alternatives for swap picker', () => {
    const item = IngredientParser.parseItem('2L semi-skimmed milk');
    const match = FuzzyMatcher.matchProduct('asda', item, [], preferences);

    assert.ok(match.alternatives);
    assert.ok(match.alternatives.length > 0);
    for (const alt of match.alternatives) {
      assert.notEqual(alt.id, match.product.id);
      assert.match(alt.title, /milk/i);
      assert.doesNotMatch(alt.title, /shake/i);
    }
  });

  it('should enforce hard category guard to prevent cross-category contamination', () => {
    const item = IngredientParser.parseItem('500g fresh salmon fillets'); // category: fish
    const breadProduct = {
      id: 'test-bread',
      supermarket: 'tesco',
      title: 'Tesco Wholemeal Bread 800g',
      brand: 'Tesco',
      tier: 'standard',
      category: 'bakery',
      packageSize: 800,
      packageUnit: 'g',
      price: 1.2,
      unitPrice: 1.5,
      unitPriceMeasure: '£/kg',
      isHealthier: true,
      inStock: true
    };

    const scored = FuzzyMatcher.scoreCandidate(
      breadProduct,
      item,
      ['salmon', 'fillet'],
      preferences
    );
    assert.equal(scored.score, -500);
  });
});
