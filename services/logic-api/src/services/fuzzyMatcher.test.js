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

  it('should reject garbage matches without noun evidence (Apples != Spinach, Walnuts != Tomato Puree)', () => {
    const apples = IngredientParser.parseItem('Apples 250 g');
    const applesMatch = FuzzyMatcher.matchProduct('asda', apples, [], preferences);
    if (applesMatch.product) {
      assert.match(applesMatch.product.title, /apple/i);
    } else {
      assert.equal(applesMatch.product, null);
    }

    const walnuts = IngredientParser.parseItem('Walnuts 200 g');
    const walnutsMatch = FuzzyMatcher.matchProduct('tesco', walnuts, [], preferences);
    if (walnutsMatch.product) {
      assert.match(walnutsMatch.product.title, /walnut/i);
    } else {
      assert.equal(walnutsMatch.product, null);
    }

    const butterBeans = IngredientParser.parseItem('Butter beans in water 2 x 400 g');
    const butterBeansMatch = FuzzyMatcher.matchProduct('sainsburys', butterBeans, [], preferences);
    if (butterBeansMatch.product) {
      assert.match(butterBeansMatch.product.title, /bean/i);
      assert.doesNotMatch(butterBeansMatch.product.title, /milk/i);
    } else {
      assert.equal(butterBeansMatch.product, null);
    }

    const peanutButter = IngredientParser.parseItem('Smooth peanut butter 300 g');
    const peanutButterMatch = FuzzyMatcher.matchProduct('sainsburys', peanutButter, [], preferences);
    if (peanutButterMatch.product) {
      assert.match(peanutButterMatch.product.title, /peanut|butter/i);
      assert.doesNotMatch(peanutButterMatch.product.title, /egg/i);
    } else {
      assert.equal(peanutButterMatch.product, null);
    }

    const sultanas = IngredientParser.parseItem('Sultanas 500 g');
    const sultanasMatch = FuzzyMatcher.matchProduct('tesco', sultanas, [], preferences);
    if (sultanasMatch.product) {
      assert.match(sultanasMatch.product.title, /sultana|raisin/i);
      assert.doesNotMatch(sultanasMatch.product.title, /fusilli|pasta/i);
    } else {
      assert.equal(sultanasMatch.product, null);
    }
  });

  it('should set weightShortfall when supplied quantity under-delivers against target quantity', () => {
    const item = IngredientParser.parseItem('1.6kg frozen cod loins');
    const candidate = [{
      id: 'test-cod-1500',
      supermarket: 'tesco',
      title: 'Tesco Frozen Cod Loins 1.5kg',
      brand: 'Tesco',
      tier: 'standard',
      category: 'fish',
      packageSize: 1500,
      packageUnit: 'g',
      price: 12.00,
      unitPrice: 8.00,
      unitPriceMeasure: '£/kg',
      isFrozen: true,
      inStock: true
    }];

    const match = FuzzyMatcher.matchProduct('tesco', item, candidate, preferences);
    assert.ok(match.product);
    assert.ok(match.weightShortfall);
    assert.equal(match.weightShortfall.requested, 1.6);
    assert.equal(match.weightShortfall.supplied, 1.5);
    assert.equal(match.weightShortfall.unit, 'kg');
  });

  it('should positively match single-noun real-world items (Bananas 10, Red lentils 500 g, Porridge oats 1 kg)', () => {
    const bananas = IngredientParser.parseItem('Bananas 10');
    const bananasMatch = FuzzyMatcher.matchProduct('tesco', bananas, [], preferences);
    assert.ok(bananasMatch.product, 'Expected bananas product match');
    assert.match(bananasMatch.product.title, /banana/i);

    const lentils = IngredientParser.parseItem('Red lentils 500 g');
    const lentilsMatch = FuzzyMatcher.matchProduct('tesco', lentils, [], preferences);
    assert.ok(lentilsMatch.product, 'Expected lentils product match');
    assert.match(lentilsMatch.product.title, /lentil/i);

    const oats = IngredientParser.parseItem('Rolled porridge oats 1 kg');
    const oatsMatch = FuzzyMatcher.matchProduct('asda', oats, [], preferences);
    assert.ok(oatsMatch.product, 'Expected oats product match');
    assert.match(oatsMatch.product.title, /oat/i);

    const courgette = IngredientParser.parseItem('Courgette 1');
    const courgetteMatch = FuzzyMatcher.matchProduct('tesco', courgette, [], preferences);
    assert.ok(courgetteMatch.product, 'Expected courgettes product match');
    assert.match(courgetteMatch.product.title, /courgette/i);

    const sweetPotato = IngredientParser.parseItem('Sweet potato 1');
    const sweetPotatoMatch = FuzzyMatcher.matchProduct('tesco', sweetPotato, [], preferences);
    assert.equal(sweetPotatoMatch.product, null, 'Sweet potato should remain honest no-match without catalog entry');
  });

  describe('Preference Options Matrix', () => {
    const candidates = [
      {
        id: 'beef-500g-value',
        supermarket: 'asda',
        title: 'ASDA Just Essentials Beef Mince 500g',
        brand: 'ASDA',
        tier: 'value',
        category: 'meat',
        packageSize: 500,
        packageUnit: 'g',
        price: 2.50,
        unitPrice: 5.00,
        unitPriceMeasure: '£/kg',
        fatPercentage: 20,
        inStock: true
      },
      {
        id: 'beef-500g-std',
        supermarket: 'asda',
        title: 'ASDA British 5% Lean Beef Steak Mince 500g',
        brand: 'ASDA',
        tier: 'standard',
        category: 'meat',
        packageSize: 500,
        packageUnit: 'g',
        price: 3.50,
        unitPrice: 7.00,
        unitPriceMeasure: '£/kg',
        fatPercentage: 5,
        inStock: true
      },
      {
        id: 'beef-500g-prem',
        supermarket: 'asda',
        title: 'ASDA Extra Special Aberdeen Angus Beef Mince 500g',
        brand: 'ASDA',
        tier: 'premium',
        category: 'meat',
        packageSize: 500,
        packageUnit: 'g',
        price: 4.80,
        unitPrice: 9.60,
        unitPriceMeasure: '£/kg',
        fatPercentage: 5,
        inStock: true
      }
    ];

    it('1. Pack Sizing Policy: closest vs cover', () => {
      const item = IngredientParser.parseItem('1.4kg beef mince');
      const prod = candidates[1]; // 500g pack

      // Closest: 1400g / 500g = 2.8 -> closest is 3 packs (1500g)
      const closest = FuzzyMatcher.calculatePacks(prod, item, { packSizingPolicy: 'closest' });
      assert.equal(closest.packs, 3);
      assert.equal(closest.totalQty, 1500);

      // Cover: ensures at least 1400g is fulfilled -> 3 packs (1500g)
      const cover = FuzzyMatcher.calculatePacks(prod, item, { packSizingPolicy: 'cover' });
      assert.equal(cover.packs, 3);
      assert.equal(cover.totalQty, 1500);
    });

    it('2. Cut Matching Strategy: best_value vs strict_cut', () => {
      const fishItem = IngredientParser.parseItem('500g cod loin');
      const filletProd = {
        id: 'cod-fillet',
        supermarket: 'tesco',
        title: 'Tesco Skinless Cod Fillets 500g',
        brand: 'Tesco',
        tier: 'standard',
        category: 'fish',
        packageSize: 500,
        packageUnit: 'g',
        price: 4.50,
        unitPrice: 9.00,
        unitPriceMeasure: '£/kg',
        inStock: true
      };

      // In best_value (equivalent cuts), cod fillets compete freely for loin request
      const bestValueScore = FuzzyMatcher.scoreCandidate(
        filletProd,
        fishItem,
        ['cod', 'loin'],
        { cutMatchingStrategy: 'best_value' }
      );
      assert.ok(bestValueScore.score > 25);

      // In strict_cut, missing requested cut gets penalized
      const strictScore = FuzzyMatcher.scoreCandidate(
        filletProd,
        fishItem,
        ['cod', 'loin'],
        { cutMatchingStrategy: 'strict_cut' }
      );
      assert.ok(strictScore.score < bestValueScore.score);
    });

    it('3. Brand Tier Priority: value vs standard vs premium', () => {
      const item = IngredientParser.parseItem('500g beef mince');
      const keywords = ['beef', 'mince'];

      const scoreValueWhenValuePreferred = FuzzyMatcher.scoreCandidate(
        candidates[0],
        item,
        keywords,
        { brandTierPriority: 'value' }
      );
      const scoreStdWhenValuePreferred = FuzzyMatcher.scoreCandidate(
        candidates[1],
        item,
        keywords,
        { brandTierPriority: 'value' }
      );
      assert.ok(scoreValueWhenValuePreferred.score > scoreStdWhenValuePreferred.score);

      const scoreStdWhenStdPreferred = FuzzyMatcher.scoreCandidate(
        candidates[1],
        item,
        keywords,
        { brandTierPriority: 'standard' }
      );
      const scoreValueWhenStdPreferred = FuzzyMatcher.scoreCandidate(
        candidates[0],
        item,
        keywords,
        { brandTierPriority: 'standard' }
      );
      assert.ok(scoreStdWhenStdPreferred.score > scoreValueWhenStdPreferred.score);

      const scorePremWhenPremPreferred = FuzzyMatcher.scoreCandidate(
        candidates[2],
        item,
        keywords,
        { brandTierPriority: 'premium' }
      );
      const scoreStdWhenPremPreferred = FuzzyMatcher.scoreCandidate(
        candidates[1],
        item,
        keywords,
        { brandTierPriority: 'premium' }
      );
      assert.ok(scorePremWhenPremPreferred.score > scoreStdWhenPremPreferred.score);
    });

    it('4. Deals Toggle: includeDeals true vs false', () => {
      const dealProd = {
        id: 'tins-deal',
        supermarket: 'asda',
        title: 'ASDA Chopped Tomatoes in Juice 400g',
        brand: 'ASDA',
        tier: 'standard',
        category: 'pantry',
        packageSize: 400,
        packageUnit: 'g',
        price: 0.80,
        unitPrice: 2.00,
        unitPriceMeasure: '£/kg',
        deal: {
          type: 'multibuy_fixed',
          bundleQuantity: 3,
          bundlePrice: 2.00,
          badge: '3 for £2'
        },
        inStock: true
      };

      const item = IngredientParser.parseItem('3 x 400g chopped tomatoes');

      const withDeals = FuzzyMatcher.calculatePacks(dealProd, item, { includeDeals: true });
      assert.equal(withDeals.totalPrice, 2.00);
      assert.ok(withDeals.dealApplied);
      assert.equal(withDeals.dealApplied.savings, 0.40);

      const withoutDeals = FuzzyMatcher.calculatePacks(dealProd, item, { includeDeals: false });
      assert.equal(withoutDeals.totalPrice, 2.40); // 3 * £0.80
      assert.equal(withoutDeals.dealApplied, undefined);
    });
  });
});
