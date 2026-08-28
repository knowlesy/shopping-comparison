import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PriceHistory } from './priceHistory.js';

describe('PriceHistory Snapshots & Stats', () => {
  beforeEach(() => {
    PriceHistory.saveSnapshots([]);
  });

  it('should record snapshots and calculate win rates and source ratios accurately', () => {
    const mockComparison1 = {
      timestamp: new Date().toISOString(),
      cheapestStore: 'asda',
      parsedItems: [
        { name: 'Apples 1kg', category: 'produce' },
        { name: 'Milk 2 Pints', category: 'dairy-eggs' }
      ],
      supermarkets: {
        asda: { totalPrice: 4.50 },
        tesco: { totalPrice: 5.20 }
      },
      meta: {
        sources: { live: 1, cache: 1, catalog: 0 }
      }
    };

    const mockComparison2 = {
      timestamp: new Date().toISOString(),
      cheapestStore: 'asda',
      parsedItems: [
        { name: 'Beef Mince 500g', category: 'meat' }
      ],
      supermarkets: {
        asda: { totalPrice: 3.50 },
        tesco: { totalPrice: 3.80 }
      },
      meta: {
        sources: { live: 0, cache: 0, catalog: 1 }
      }
    };

    PriceHistory.recordSnapshot(mockComparison1);
    PriceHistory.recordSnapshot(mockComparison2);

    const stats = PriceHistory.getStats();
    assert.equal(stats.totalComparisons, 2);
    assert.equal(stats.winRates.asda.wins, 2);
    assert.equal(stats.winRates.asda.percentage, 100);

    // Total matches: 1 live + 1 cache + 1 catalog = 3
    assert.equal(stats.sourceRatios.counts.live, 1);
    assert.equal(stats.sourceRatios.counts.cache, 1);
    assert.equal(stats.sourceRatios.counts.catalog, 1);
    assert.equal(stats.sourceRatios.live, 33);
    assert.equal(stats.sourceRatios.cache, 33);
    assert.equal(stats.sourceRatios.catalog, 33);
  });
});
