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

  it('should record per-item price rows skipping estimated catalog products and dedupe per day', () => {
    PriceHistory.saveItemRows([]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const comparison = {
      timestamp: new Date().toISOString(),
      cheapestStore: 'tesco',
      parsedItems: [
        { name: 'Apples 1kg', category: 'produce' },
        { name: 'Fake Cheese', category: 'dairy-eggs' }
      ],
      supermarkets: {
        tesco: {
          totalPrice: 3.50,
          matches: [
            {
              parsedItem: { name: 'Apples 1kg' },
              product: { title: 'Tesco Royal Gala Apples 1kg', price: 1.50, unitPrice: 1.50, source: 'live' },
              totalPrice: 1.50,
              isEstimated: false,
              confidenceSource: 'live'
            },
            {
              parsedItem: { name: 'Fake Cheese' },
              product: { title: 'Tesco Cheddar 400g', price: 2.00, unitPrice: 5.00, source: 'catalog' },
              totalPrice: 2.00,
              isEstimated: true,
              confidenceSource: 'catalog'
            }
          ]
        },
        asda: {
          totalPrice: 1.40,
          matches: [
            {
              parsedItem: { name: 'Apples 1kg' },
              product: { title: 'Asda Gala Apples 1kg', price: 1.40, unitPrice: 1.40, source: 'cache' },
              totalPrice: 1.40,
              isEstimated: false,
              confidenceSource: 'cache'
            }
          ]
        }
      }
    };

    // First record
    PriceHistory.recordSnapshot(comparison);

    // Second record same day should dedupe
    PriceHistory.recordSnapshot(comparison);

    const rows = PriceHistory.loadItemRows();
    // Should contain 2 rows (tesco apples and asda apples), NOT the estimated cheese
    assert.equal(rows.length, 2, 'Estimated catalog items must be skipped; duplicate day rows deduped');
    assert.equal(rows.some((r) => r.itemKey === 'fake cheese'), false, 'Never record estimated catalog rows');

    const appleSeries = PriceHistory.getItemSeries('apples 1kg');
    assert.equal(appleSeries.itemKey, 'apples 1kg');
    assert.ok(appleSeries.series.tesco);
    assert.equal(appleSeries.series.tesco.length, 1);
    assert.equal(appleSeries.series.tesco[0].date, todayStr);
    assert.equal(appleSeries.series.tesco[0].totalPrice, 1.50);
    assert.equal(appleSeries.series.asda[0].totalPrice, 1.40);
  });
});
