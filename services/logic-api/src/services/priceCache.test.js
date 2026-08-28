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

  it('should auto-promote expiring unsaved search and replace previous auto-promoted list', () => {
    PriceCache.saveRecentSearches([]);
    const now = Date.now();
    const fourDaysAgo = now - 4 * 24 * 60 * 60 * 1000;
    const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;

    // Seed searches: 1 pinned, 2 expired unsaved
    const initial = [
      {
        id: 'pinned-shop',
        query: 'Weekly Staples',
        rawList: 'Eggs\nMilk',
        itemsCount: 2,
        timestamp: fiveDaysAgo,
        pinned: true,
        status: 'saved'
      },
      {
        id: 'old-search-1',
        query: 'Old List 1',
        rawList: 'Apples 1kg\nBananas',
        itemsCount: 2,
        timestamp: fiveDaysAgo,
        pinned: false,
        status: 'unsaved'
      },
      {
        id: 'old-search-2',
        query: 'Old List 2',
        rawList: 'Beef mince\nPotatoes',
        itemsCount: 2,
        timestamp: fourDaysAgo,
        pinned: false,
        status: 'unsaved'
      }
    ];
    PriceCache.saveRecentSearches(initial);

    // Run promotion sweep
    PriceCache.promoteExpiredSearches(now);

    let searches = PriceCache.loadRecentSearches();
    const promoted = searches.find((s) => s.status === 'promoted');
    assert.ok(promoted, 'Should have an auto-promoted search');
    assert.equal(promoted.id, 'old-search-2', 'Should promote most recent expiring unsaved search');

    const pinned = searches.find((s) => s.id === 'pinned-shop');
    assert.ok(pinned, 'Pinned saved shop must survive and never be replaced');

    // Add another newer expiring unsaved search and verify it replaces previous promotion
    const threeDaysAgo = now - 3.5 * 24 * 60 * 60 * 1000;
    searches.unshift({
      id: 'newer-search-3',
      query: 'Newer List 3',
      rawList: 'Greek Yogurt\nOats',
      itemsCount: 2,
      timestamp: threeDaysAgo,
      pinned: false,
      status: 'unsaved'
    });
    PriceCache.saveRecentSearches(searches);

    // Second promotion sweep replaces previous promotion
    PriceCache.promoteExpiredSearches(now);

    searches = PriceCache.loadRecentSearches();
    const promotedList = searches.filter((s) => s.status === 'promoted');
    assert.equal(promotedList.length, 1, 'Only ONE auto-promoted list can exist (new promotion replaces previous auto-promoted list)');
    assert.equal(promotedList[0].id, 'newer-search-3');
  });
});
