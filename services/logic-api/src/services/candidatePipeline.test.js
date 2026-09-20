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
    it('should generate namespaced deterministic cache key with sorted stores identical for deals and raw', () => {
      const key1 = buildScrapeCacheKey('Beef Mince', ['tesco', 'asda', 'sainsburys']);
      const key2 = buildScrapeCacheKey('beef mince', ['asda', 'sainsburys', 'tesco']);
      const keyDeals = buildScrapeCacheKey('beef mince', ['asda', 'sainsburys', 'tesco'], true);
      const keyRaw = buildScrapeCacheKey('beef mince', ['asda', 'sainsburys', 'tesco'], false);

      assert.equal(key1, 'cache:v2:scrape:beef mince:asda,sainsburys,tesco');
      assert.equal(key1, key2, 'Key should be deterministic and case-insensitive');
      assert.equal(keyDeals, keyRaw, 'Key must be identical regardless of deals mode');
    });

    it('should handle empty or omitted stores parameter', () => {
      const key = buildScrapeCacheKey('milk');
      assert.equal(key, 'cache:v2:scrape:milk:all');
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
      const stores = ['asda'];
      const cacheKey = buildScrapeCacheKey(coreQuery, stores);

      const fakeProducts = [{ id: 'test-1', title: 'Test Product', price: 1.5, supermarket: 'asda' }];
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
      const { StoreFetcherClient } = await import('./storeFetcherClient.js');
      const { ScraperClient } = await import('./scraperClient.js');
      const originalSearch = StoreFetcherClient.search;
      const originalFetchHtml = ScraperClient.fetchHtml;
      try {
        StoreFetcherClient.search = async () => ({ success: false, stores: {}, error: 'offline fixture' });
        ScraperClient.fetchHtml = async () => {
          throw new Error('offline fixture');
        };
        const result = await getOrFetchCandidatesWithSource('nonexistent-query-xyz-12345', {
          forceRefresh: true,
          timeoutMs: 10,
          enabledStores: ['asda']
        });

        assert.equal(result.source, 'catalog');
        assert.ok(Array.isArray(result.products));
      } finally {
        StoreFetcherClient.search = originalSearch;
        ScraperClient.fetchHtml = originalFetchHtml;
      }
    });
  });

  describe('Task 08 Acceptance Conditions Suite', () => {
    it('Condition 1: One failed store remains visible and receives appropriate fallback/retry even when another store succeeds', async () => {
      const { StoreFetcherClient } = await import('./storeFetcherClient.js');
      const { ScraperClient } = await import('./scraperClient.js');

      const originalSearch = StoreFetcherClient.search;
      const originalFetchHtml = ScraperClient.fetchHtml;

      try {
        // Mock StoreFetcherClient: Tesco succeeds, Asda fails with deadline_exceeded
        StoreFetcherClient.search = async (_q, stores) => {
          const storeMap = {};
          if (stores.includes('tesco')) {
            storeMap.tesco = {
              success: true,
              products: [
                { id: 'tesco-1', title: 'Tesco Whole Milk 4 Pints', price: 1.65, supermarket: 'tesco' }
              ]
            };
          }
          if (stores.includes('asda')) {
            storeMap.asda = {
              success: false,
              status: 'deadline_exceeded',
              error: 'deadline_exceeded'
            };
          }
          return { success: true, stores: storeMap };
        };

        // Aggregator also fails for Asda, forcing it to catalog benchmark
        ScraperClient.fetchHtml = async () => {
          throw new Error('Aggregator unreachable');
        };

        const result = await getOrFetchCandidatesWithSource('whole milk', {
          forceRefresh: true,
          enabledStores: ['tesco', 'asda']
        });

        // Tesco has direct product
        assert.ok(result.products.some((p) => p.supermarket === 'tesco' && p.source === 'direct'));

        // Asda failure is explicitly recorded and marked as fallback
        assert.equal(result.storeStatuses.asda.fallback, true);
        assert.equal(result.storeStatuses.asda.error, 'deadline_exceeded');

        // Asda did NOT get cached as 72h empty products
        const asdaStoreKey = `cache:v3:store:whole milk:asda`;
        const cachedAsda = PriceCache.get(asdaStoreKey);
        assert.ok(cachedAsda.error || cachedAsda.status === 'deadline_exceeded');
        assert.ok(!Array.isArray(cachedAsda));
      } finally {
        StoreFetcherClient.search = originalSearch;
        ScraperClient.fetchHtml = originalFetchHtml;
      }
    });

    it('Condition 2: Toggling one store does not refetch valid candidates for every unchanged store', async () => {
      const { StoreFetcherClient } = await import('./storeFetcherClient.js');
      const originalSearch = StoreFetcherClient.search;

      let callCount = 0;
      let queriedStores = [];

      try {
        StoreFetcherClient.search = async (_q, stores) => {
          callCount++;
          queriedStores.push(...stores);
          const storeMap = {};
          for (const s of stores) {
            storeMap[s] = {
              success: true,
              products: [{ id: `${s}-1`, title: `${s} Milk`, price: 1.5, supermarket: s }]
            };
          }
          return { success: true, stores: storeMap };
        };

        // 1. First run with Tesco & Asda
        await getOrFetchCandidatesWithSource('milk', {
          forceRefresh: true,
          enabledStores: ['tesco', 'asda']
        });
        assert.equal(callCount, 2, 'Each retailer receives its own planned direct query');
        assert.deepEqual(queriedStores, ['tesco', 'asda']);

        // 2. User toggles on Sainsburys: enabledStores now ['tesco', 'asda', 'sainsburys']
        callCount = 0;
        queriedStores = [];

        const secondResult = await getOrFetchCandidatesWithSource('milk', {
          forceRefresh: false,
          enabledStores: ['tesco', 'asda', 'sainsburys']
        });

        // Only sainsburys should have been queried; tesco & asda loaded from cache
        assert.equal(callCount, 1);
        assert.deepEqual(queriedStores, ['sainsburys']);
        assert.equal(secondResult.storeStatuses.tesco.source, 'cache');
        assert.equal(secondResult.storeStatuses.asda.source, 'cache');
        assert.equal(secondResult.storeStatuses.sainsburys.source, 'direct');
      } finally {
        StoreFetcherClient.search = originalSearch;
      }
    });

    it('uses each retailer\'s planned query for direct acquisition', async () => {
      const { StoreFetcherClient } = await import('./storeFetcherClient.js');
      const { QueryStrategist } = await import('./queryStrategist.js');
      const originalSearch = StoreFetcherClient.search;
      const originalPlan = QueryStrategist.plan;
      const calls = [];

      try {
        QueryStrategist.plan = async (_item, { supermarket }) => ({
          queries: [`${supermarket} planned milk`],
          suggestedVariants: []
        });
        StoreFetcherClient.search = async (query, stores) => {
          calls.push({ query, stores });
          const store = stores[0];
          return {
            success: true,
            stores: {
              [store]: {
                success: true,
                products: [{ id: `${store}-planned`, title: `${store} milk`, price: 1, supermarket: store }]
              }
            }
          };
        };

        await getOrFetchCandidatesWithSource('milk', {
          forceRefresh: true,
          enabledStores: ['tesco', 'asda']
        });

        assert.deepEqual(calls, [
          { query: 'tesco planned milk', stores: ['tesco'] },
          { query: 'asda planned milk', stores: ['asda'] }
        ]);
      } finally {
        StoreFetcherClient.search = originalSearch;
        QueryStrategist.plan = originalPlan;
      }
    });

    it('Condition 3: Opening alternatives immediately after compare reuses the relevant candidates with zero redundant acquisition calls', async () => {
      const { StoreFetcherClient } = await import('./storeFetcherClient.js');
      const { ScraperClient } = await import('./scraperClient.js');

      const originalSearch = StoreFetcherClient.search;
      const originalFetchHtml = ScraperClient.fetchHtml;

      let searchCalls = 0;
      let scrapeCalls = 0;

      try {
        StoreFetcherClient.search = async (_q, _stores) => {
          searchCalls++;
          return {
            success: true,
            stores: {
              tesco: {
                success: true,
                products: [{ id: 'tesco-10', title: 'Tesco British Eggs 6pk', price: 1.5, supermarket: 'tesco' }]
              }
            }
          };
        };
        ScraperClient.fetchHtml = async () => {
          scrapeCalls++;
          return { html: '' };
        };

        // Run compare
        await getOrFetchCandidatesWithSource('eggs', {
          forceRefresh: true,
          enabledStores: ['tesco']
        });
        assert.equal(searchCalls, 1);

        // Immediate alternatives lookup for Tesco
        searchCalls = 0;
        scrapeCalls = 0;

        const { alternativesRouter } = await import('../routes/alternatives.js');
        const express = (await import('express')).default;
        const app = express();
        app.use('/api/alternatives', alternativesRouter);
        const server = await new Promise((resolve) => {
          const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
        });

        try {
          const response = await fetch(`http://127.0.0.1:${server.address().port}/api/alternatives?store=tesco&query=eggs`);
          assert.equal(response.status, 200);
          const payload = await response.json();

          // Opening the actual route makes zero acquisition calls and reuses the compare row.
          assert.equal(searchCalls, 0, 'Must make zero store-fetcher calls on alternatives');
          assert.equal(scrapeCalls, 0, 'Must make zero scraper calls on alternatives');
          assert.ok(payload.alternatives.some((product) => product.id === 'tesco-10'));
        } finally {
          await new Promise((resolve) => server.close(resolve));
        }
      } finally {
        StoreFetcherClient.search = originalSearch;
        ScraperClient.fetchHtml = originalFetchHtml;
      }
    });

    it('Condition 4: Direct/live rows win same-product deduplication over catalog; estimates remain labelled', async () => {
      // Test the deduplication behavior in alternatives route logic
      const query = 'beef mince';
      const store = 'tesco';

      // Seed per-store candidate cache with live direct product
      const directProduct = {
        id: 'tesco-live-mince',
        title: 'Tesco Lean Beef Steak Mince 5% Fat 500g',
        price: 3.49,
        supermarket: 'tesco',
        source: 'direct',
        confidenceSource: 'direct'
      };
      PriceCache.set(`cache:v3:store:${query}:${store}`, [directProduct]);

      const { alternativesRouter } = await import('../routes/alternatives.js');
      const express = (await import('express')).default;
      const app = express();
      app.use('/api/alternatives', alternativesRouter);

      const server = await new Promise((resolve) => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
      });
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/alternatives?store=${store}&query=${encodeURIComponent(query)}`);
        assert.equal(res.status, 200);
        const data = await res.json();

        // Direct product must be in results with confidenceSource: direct and isEstimated: false
        const winningRow = data.alternatives.find(
          (p) => p.title.toLowerCase().includes('lean beef steak mince 5% fat 500g')
        );
        assert.ok(winningRow, 'Direct row must be present');
        assert.equal(winningRow.confidenceSource, 'direct', 'Direct row must win over catalog');
        assert.equal(winningRow.isEstimated, false, 'Direct row must not be marked as estimated');

        // Catalog-only items must be labelled with confidence: estimated and isEstimated: true
        const catalogRow = data.alternatives.find((p) => p.confidenceSource === 'catalog');
        if (catalogRow) {
          assert.equal(catalogRow.isEstimated, true);
          assert.equal(catalogRow.confidence, 'estimated');
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('Condition 5: Force refresh, adapter-disabled settings and cache expiration behave deterministically; no unbounded retries', async () => {
      const { StoreFetcherClient } = await import('./storeFetcherClient.js');
      const { ScraperClient } = await import('./scraperClient.js');
      const originalSearch = StoreFetcherClient.search;
      const originalFetchHtml = ScraperClient.fetchHtml;

      let callCount = 0;
      let requestedStores = [];

      try {
        ScraperClient.fetchHtml = async () => {
          throw new Error('offline fixture');
        };
        StoreFetcherClient.search = async (_q, stores) => {
          callCount++;
          requestedStores = [...stores];
          return {
            success: true,
            stores: {
              asda: { success: true, products: [{ id: 'asda-1', title: 'Asda Bread', price: 1.0, supermarket: 'asda' }] }
            }
          };
        };

        // 1. Adapter disabled for Tesco: Tesco should not be sent to StoreFetcher
        await getOrFetchCandidatesWithSource('bread', {
          forceRefresh: true,
          enabledStores: ['tesco', 'asda'],
          preferences: {
            directStoreAdapters: { tesco: false, asda: true }
          }
        });

        assert.deepEqual(requestedStores, ['asda'], 'Disabled adapter must be excluded from direct fetch');

        // 2. Direct scrapers completely disabled
        callCount = 0;
        requestedStores = [];
        await getOrFetchCandidatesWithSource('bread', {
          forceRefresh: true,
          enabledStores: ['asda'],
          preferences: {
            directScrapersEnabled: false
          }
        });
        assert.equal(callCount, 0, 'No direct fetch when directScrapersEnabled is false');

        // 3. Transient failure cooldown: fails once, next immediate call within cooldown does not hammer sidecar
        callCount = 0;
        StoreFetcherClient.search = async () => {
          callCount++;
          return {
            success: false,
            error: 'Network timeout',
            stores: { asda: { success: false, error: 'Network timeout' } }
          };
        };

        await getOrFetchCandidatesWithSource('butter', {
          forceRefresh: true,
          enabledStores: ['asda']
        });
        assert.equal(callCount, 1);

        // Immediate subsequent call (without forceRefresh)
        await getOrFetchCandidatesWithSource('butter', {
          forceRefresh: false,
          enabledStores: ['asda']
        });
        assert.equal(callCount, 1, 'Transient failure cooldown must prevent unbounded retries');
      } finally {
        StoreFetcherClient.search = originalSearch;
        ScraperClient.fetchHtml = originalFetchHtml;
      }
    });

    it('Condition 6: Existing cache files can be read or deliberately bypassed safely; saved history survives', async () => {
      // 1. Seed legacy combined scrape cache
      const legacyKey = buildScrapeCacheKey('pasta', ['asda', 'morrisons']);
      const legacyData = [
        { id: 'asda-pasta', title: 'Asda Penne Pasta 500g', price: 0.75, supermarket: 'asda' },
        { id: 'morrisons-pasta', title: 'Morrisons Penne Pasta 500g', price: 0.85, supermarket: 'morrisons' }
      ];
      PriceCache.set(legacyKey, legacyData);

      // Querying asda should read legacy cache safely
      const result = await getOrFetchCandidatesWithSource('pasta', {
        forceRefresh: false,
        enabledStores: ['asda']
      });
      assert.equal(result.source, 'cache');
      assert.ok(result.products.some((p) => p.id === 'asda-pasta'));

      // 2. Clear cache and verify shop history / recent searches survive
      PriceCache.saveShopHistory([{ id: 'hist-1', itemsCount: 5, date: '2026-09-20' }]);
      PriceCache.saveRecentSearches([{ id: 'search-1', query: 'milk', pinned: true }]);

      PriceCache.clear();

      const history = PriceCache.loadShopHistory();
      const searches = PriceCache.loadRecentSearches();
      assert.equal(history.length, 1, 'Shop history must survive PriceCache.clear()');
      assert.equal(searches.length, 1, 'Recent searches must survive PriceCache.clear()');
    });
  });
});
