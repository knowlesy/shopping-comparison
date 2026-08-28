import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PriceCache } from './priceCache.js';

describe('PriceCache & Search Lifecycle', () => {
  beforeEach(() => {
    PriceCache.clear();
  });

  it('should store and retrieve active cached items within TTL', () => {
    PriceCache.set('apples', [{ title: 'Apples 1kg', price: 1.50 }]);
    assert.equal(PriceCache.has('apples'), true);
    const data = PriceCache.get('apples');
    assert.equal(data.length, 1);
    assert.equal(data[0].title, 'Apples 1kg');
  });

  it('should expire entries when TTL has passed', () => {
    // Set with negative/past TTL
    PriceCache.set('bananas', [{ title: 'Bananas', price: 0.80 }], -1000);
    assert.equal(PriceCache.has('bananas'), false);
    assert.equal(PriceCache.get('bananas'), null);
  });

  it('should sweep expired entries from memory and sync to disk', () => {
    PriceCache.set('item1', [{ title: 'Active 1' }], 100000);
    PriceCache.set('item2', [{ title: 'Expired 1' }], -500);
    PriceCache.set('item3', [{ title: 'Expired 2' }], -1000);

    const sweep = PriceCache.sweepExpiredEntries();
    assert.equal(sweep.evictedCount, 2);
    assert.equal(sweep.activeCount, 1);
    assert.equal(PriceCache.has('item1'), true);
    assert.equal(PriceCache.has('item2'), false);
  });

  it('should enforce maximum 10 recent searches cap with FIFO drop', () => {
    // Clear recent searches
    PriceCache.saveRecentSearches([]);

    // Record 15 distinct searches
    for (let i = 1; i <= 15; i++) {
      PriceCache.recordSearch({
        query: `Search Item ${i}`,
        rawList: `Raw list item ${i} 500g\nOther thing`,
        itemsCount: 2
      });
    }

    const recent = PriceCache.loadRecentSearches();
    assert.equal(recent.length, 10, 'Must cap recent searches at exactly 10 items');
    assert.equal(recent[0].query, 'Search Item 15', 'Most recent search should be at top');
    assert.equal(recent[9].query, 'Search Item 6', 'Oldest search in window should be #6 (1-5 dropped)');
  });
});
