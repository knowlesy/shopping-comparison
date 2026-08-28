import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScrapeCacheKey,
  getCoreSearchQuery,
  getOrFetchCandidatesWithSource
} from './candidatePipeline.js';
import { PriceCache } from './priceCache.js';

describe('candidatePipeline', () => {
  beforeEach(() => {
    PriceCache.clear();
  });

  describe('buildScrapeCacheKey', () => {
    it('should generate namespaced cache key with sorted stores and deals tag', () => {
      const key1 = buildScrapeCacheKey('Beef Mince', ['tesco', 'asda', 'sainsburys'], true);
      const key2 = buildScrapeCacheKey('beef mince', ['asda', 'sainsburys', 'tesco'], true);
      const keyRaw = buildScrapeCacheKey('beef mince', ['asda', 'sainsburys', 'tesco'], false);

      assert.equal(key1, 'cache:v2:scrape:beef mince:asda,sainsburys,tesco:deals');
      assert.equal(key1, key2, 'Key should be deterministic and case-insensitive');
      assert.equal(keyRaw, 'cache:v2:scrape:beef mince:asda,sainsburys,tesco:raw');
    });

    it('should handle empty or omitted stores parameter', () => {
      const key = buildScrapeCacheKey('milk');
      assert.equal(key, 'cache:v2:scrape:milk:all:deals');
    });

    it('should differentiate cache keys when enabled store sets differ', () => {
      const keyA = buildScrapeCacheKey('eggs', ['asda', 'tesco']);
      const keyB = buildScrapeCacheKey('eggs', ['asda', 'tesco', 'aldi']);
      assert.notEqual(keyA, keyB);
    });
  });

  describe('getCoreSearchQuery', () => {
    it('should strip fat percentages, modifiers, and units from ingredient strings', () => {
      assert.equal(getCoreSearchQuery('900g 5% lean beef mince'), 'beef mince');
      assert.equal(
        getCoreSearchQuery({ baseItem: '1kg authentic Greek yogurt 0% fat' }),
        'greek yogurt'
      );
      assert.equal(
        getCoreSearchQuery('2 Pints British Fresh Semi-Skimmed Milk'),
        'british semi skimmed milk'
      );
      assert.equal(getCoreSearchQuery('3 x 400g tinned chopped tomatoes'), 'chopped tomatoes');
    });
  });

  describe('getOrFetchCandidatesWithSource & Meta Counting', () => {
    it('should return cache source on cache hit', async () => {
      const coreQuery = 'test item';
      const stores = ['asda', 'tesco'];
      const cacheKey = buildScrapeCacheKey(coreQuery, stores);

      const fakeProducts = [{ id: 'test-1', title: 'Test Product', price: 1.5 }];
      PriceCache.set(cacheKey, fakeProducts);

      const result = await getOrFetchCandidatesWithSource(coreQuery, {
        forceRefresh: false,
        enabledStores: stores
      });

      assert.equal(result.source, 'cache');
      assert.equal(result.products.length, 1);
      assert.equal(result.products[0].title, 'Test Product');
    });

    it('should return catalog source on scrape fallback', async () => {
      // Scrape to an unreachable or timed out query will fall back to catalog
      const result = await getOrFetchCandidatesWithSource('nonexistent-query-xyz-12345', {
        forceRefresh: true,
        timeoutMs: 10,
        enabledStores: ['asda']
      });

      assert.equal(result.source, 'catalog');
      assert.ok(Array.isArray(result.products));
    });
  });
});
