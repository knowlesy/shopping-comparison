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

  describe('Task 09 Acceptance Conditions Suite (two-store split savings)', () => {
    // Deterministic fixtures with hand-computed totals. Delivery thresholds in
    // SUPERMARKETS_INFO: asda £40/£3.50, tesco £50/£4.50, sainsburys £40/£4.00,
    // iceland £40/£0.00, aldi £0/£0.00, lidl £0/£0.00.
    const parsed = (names) => names.map((name, i) => ({ id: `item_${i}`, name, rawText: name, targetQuantity: 1 }));

    const line = (store, name, price, { estimated = false } = {}) => ({
      parsedItem: { name },
      itemId: name,
      product: {
        id: `${store}-${name}`,
        title: `${store} ${name}`,
        price,
        supermarket: store,
        source: estimated ? 'catalog' : 'live',
        isEstimated: estimated
      },
      totalPrice: price,
      packsNeeded: 1,
      lines: [{ product: { id: `${store}-${name}` }, packs: 1, subtotal: price }],
      isEstimated: estimated,
      confidenceSource: estimated ? 'catalog' : 'live'
    });

    const noMatch = (name) => ({ parsedItem: { name }, itemId: name, product: null, totalPrice: 0, lines: [] });

    it('Condition 1: three cheapest stores collapse to at most two, with hand-computed totals', () => {
      const items = parsed(['A', 'B', 'C']);
      const stores = ['aldi', 'lidl', 'iceland'];
      const map = {
        aldi: [line('aldi', 'A', 1.00), line('aldi', 'B', 5.00), line('aldi', 'C', 5.00)],
        lidl: [line('lidl', 'A', 5.00), line('lidl', 'B', 1.00), line('lidl', 'C', 5.00)],
        iceland: [line('iceland', 'A', 5.00), line('iceland', 'B', 5.00), line('iceland', 'C', 1.00)]
      };

      const split = BasketCalculator.computeComparison(items, map, stores).splitOptimization;

      // Each store is cheapest on exactly one item, but a route may use at most two.
      assert.equal(split.stores.length, 2, 'A route may never name more than two stores');
      assert.equal(split.itemsCovered, 3);
      // Two of the three 1.00 lines plus one 5.00 line; all three stores deliver free here.
      assert.equal(split.combinedTotal, 7.00);
      assert.equal(split.combinedDeliveryFee, 0);
      // Any single store costs 1.00 + 5.00 + 5.00 = 11.00 with free delivery.
      assert.equal(split.singleBestTotal, 11.00);
      assert.equal(split.savingsVsSingleBest, 4.00);
      assert.equal(split.savingsAreVerified, true);
      assert.equal(split.provenance, 'verified');
      assert.equal(split.hasFullCoverage, true);
    });

    it('Condition 2: delivery fees erase a nominal product-price saving and none is advertised', () => {
      const items = parsed(['A', 'B']);
      const stores = ['asda', 'tesco'];
      const map = {
        asda: [line('asda', 'A', 2.00), line('asda', 'B', 2.00)],
        tesco: [line('tesco', 'A', 5.00), line('tesco', 'B', 1.00)]
      };

      // On product price alone the split looks cheaper: 2.00 + 1.00 = 3.00 against asda's 4.00.
      const splitRoute = BasketCalculator.costRoute(items, {
        asda: { items: map.asda },
        tesco: { items: map.tesco }
      }, ['asda', 'tesco']);
      assert.equal(splitRoute.subtotal, 3.00, 'nominal product saving of £1.00 exists');
      // Delivery at both stores (neither subtotal reaches its minimum) costs 3.50 + 4.50.
      assert.equal(splitRoute.deliveryFee, 8.00);
      assert.equal(splitRoute.total, 11.00);

      const split = BasketCalculator.computeComparison(items, map, stores).splitOptimization;

      // asda alone: 4.00 + 3.50 = 7.50, cheaper than the 11.00 split.
      assert.equal(split.stores.length, 1);
      assert.equal(split.stores[0].supermarket, 'asda');
      assert.equal(split.combinedTotal, 7.50);
      assert.equal(split.savingsVsSingleBest, 0, 'a vanished saving is never advertised');
      assert.equal(split.indicativeSavingsVsSingleBest, 0);
      assert.match(split.explanation, /Single-store checkout/);
    });

    it('Condition 3: coverage is equal on both sides and an empty or partial store cannot win', () => {
      const items = parsed(['A', 'B']);
      const stores = ['asda', 'iceland', 'tesco'];
      const map = {
        asda: [line('asda', 'A', 3.00), line('asda', 'B', 3.00)],
        iceland: [line('iceland', 'A', 0.50), noMatch('B')], // cheaper, but only half the basket
        tesco: [noMatch('A'), noMatch('B')]                  // nothing at all
      };

      const comparison = BasketCalculator.computeComparison(items, map, stores);

      assert.equal(comparison.cheapestStore, 'asda', 'a partial basket cannot be the cheapest store');
      assert.equal(comparison.supermarkets.tesco.isCheapest, false);
      assert.equal(comparison.supermarkets.iceland.savingsVsHighest, 0, 'a partial basket quotes no saving');
      assert.equal(comparison.supermarkets.iceland.isComparable, false);
      assert.equal(comparison.highestStore, 'asda', 'the dearest comparable basket, not the last ranked row');
      assert.equal(comparison.recommendationBasis, 'lowest_comparable_price');

      const split = comparison.splitOptimization;
      // asda alone: 6.00 + 3.50 = 9.50. Split: iceland A 0.50 (free delivery) + asda B 3.00 + 3.50 = 7.00.
      assert.equal(split.itemsCovered, 2);
      assert.equal(split.combinedTotal, 7.00);
      assert.equal(split.singleBestTotal, 9.50, 'the baseline prices the same two items at one store');
      assert.equal(split.savingsVsSingleBest, 2.50);
      assert.equal(split.stores.some((s) => s.supermarket === 'tesco'), false, 'a store supplying nothing is not in the route');
    });

    it('Condition 4: estimated-only and partial baskets are labelled and claim no verified saving', () => {
      const items = parsed(['A', 'B']);

      // (a) every line is an estimated catalog benchmark
      const estimatedOnly = BasketCalculator.computeComparison(items, {
        aldi: [line('aldi', 'A', 1.00, { estimated: true }), line('aldi', 'B', 1.00, { estimated: true })],
        lidl: [line('lidl', 'A', 2.00, { estimated: true }), line('lidl', 'B', 2.00, { estimated: true })]
      }, ['aldi', 'lidl']).splitOptimization;

      assert.equal(estimatedOnly.provenance, 'estimated');
      assert.equal(estimatedOnly.savingsAreVerified, false);
      assert.equal(estimatedOnly.savingsVsSingleBest, 0);
      assert.match(estimatedOnly.explanation, /estimated catalog price/);

      // (b) a cheaper split that leans on one estimated line is indicative, not confirmed
      const mixed = BasketCalculator.computeComparison(items, {
        aldi: [line('aldi', 'A', 1.00, { estimated: true }), line('aldi', 'B', 5.00, { estimated: true })],
        lidl: [line('lidl', 'A', 5.00), line('lidl', 'B', 1.00)]
      }, ['aldi', 'lidl']).splitOptimization;

      assert.equal(mixed.stores.length, 2);
      assert.equal(mixed.combinedTotal, 2.00);
      assert.equal(mixed.provenance, 'mixed');
      assert.equal(mixed.savingsAreVerified, false);
      assert.equal(mixed.savingsVsSingleBest, 0, 'an estimated route cannot advertise a confirmed saving');
      assert.equal(mixed.indicativeSavingsVsSingleBest, 4.00);
      assert.match(mixed.explanation, /indicative/);

      // (c) an item no store can price is reported as missing, never as a saving
      const partial = BasketCalculator.computeComparison(parsed(['A', 'B', 'C']), {
        aldi: [line('aldi', 'A', 1.00), line('aldi', 'B', 1.00), noMatch('C')],
        lidl: [line('lidl', 'A', 2.00), line('lidl', 'B', 2.00), noMatch('C')]
      }, ['aldi', 'lidl']).splitOptimization;

      assert.equal(partial.itemsCovered, 2);
      assert.equal(partial.itemsTotal, 3);
      assert.equal(partial.hasFullCoverage, false);
      assert.equal(partial.missingItems.length, 1);
      assert.equal(partial.missingItems[0].name, 'C');
      assert.match(partial.explanation, /could not be priced at any store/);
    });

    it('Condition 4b: savingsVsHighest is arithmetically consistent with the named highest store', () => {
      // The audit noted an estimated store advertising a saving larger than the gap to the
      // store the response named as highest. "Highest" now means the dearest comparable basket.
      const items = parsed(['A']);
      const comparison = BasketCalculator.computeComparison(items, {
        aldi: [line('aldi', 'A', 0.75, { estimated: true })],
        tesco: [line('tesco', 'A', 1.45)],
        asda: [line('asda', 'A', 1.20)]
      }, ['aldi', 'tesco', 'asda']);

      const highestTotal = comparison.supermarkets[comparison.highestStore].totalPrice;
      for (const [store, result] of Object.entries(comparison.supermarkets)) {
        assert.ok(
          result.savingsVsHighest <= highestTotal - result.totalPrice + 0.001,
          `${store} advertised £${result.savingsVsHighest} against a highest basket of £${highestTotal}`
        );
      }
      assert.equal(comparison.highestStore, 'tesco', 'all three cover the basket; tesco is dearest');
    });
  });
});
