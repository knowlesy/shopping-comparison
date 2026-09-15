import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compareRouter } from './compare.js';
import { settingsRouter } from './settings.js';
import { PriceCache } from '../services/priceCache.js';
import { IngredientParser } from '../services/ingredientParser.js';
import { getCoreSearchQuery, buildScrapeCacheKey } from '../services/candidatePipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../..');

const REAL_LIST_PATH = path.join(ROOT_DIR, 'tests/fixtures/real-list.json');
const FIXTURES_PATH = path.join(ROOT_DIR, 'tests/fixtures/reality-fixtures.json');
const SAMPLE_PATH = path.join(ROOT_DIR, 'tests/fixtures/reality-sample.json');

describe('HTTP API: POST /api/compare Route Tests', () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/compare', compareRouter);
    app.use('/api/settings', settingsRouter);

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/compare`;
        resolve();
      });
    });

    // Populate PriceCache offline from recorded fixtures so compare executes in 0ms without network
    const fixturesFile = fs.existsSync(FIXTURES_PATH) ? FIXTURES_PATH : SAMPLE_PATH;
    assert.ok(fs.existsSync(fixturesFile), 'offline fixtures must exist');
    const fixtures = JSON.parse(fs.readFileSync(fixturesFile, 'utf8'));

    const realList = JSON.parse(fs.readFileSync(REAL_LIST_PATH, 'utf8'));
    const parsedItems = IngredientParser.parseList(realList);
    const enabledStores = ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'];

    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const coreQuery = getCoreSearchQuery(item);
      const candidates = fixtures.items?.[i]?.products || [];
      const cacheKey = buildScrapeCacheKey(coreQuery, enabledStores);
      PriceCache.set(cacheKey, candidates);
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should process real 52-line list through real route and return sane basket totals with honest data-source stamps', async () => {
    const realList = JSON.parse(fs.readFileSync(REAL_LIST_PATH, 'utf8'));
    const parsedItems = IngredientParser.parseList(realList);

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: parsedItems
      })
    });

    assert.equal(res.status, 200, 'POST /api/compare must return HTTP 200');
    const comparison = await res.json();

    // 1. Assert per-store result set for supermarkets
    assert.ok(comparison.supermarkets, 'Response must include supermarkets comparison');
    const stores = Object.keys(comparison.supermarkets);
    assert.ok(stores.includes('tesco'), 'Tesco must be in supermarkets');
    assert.ok(stores.includes('sainsburys'), 'Sainsburys must be in supermarkets');
    assert.ok(stores.includes('asda'), 'Asda must be in supermarkets');
    assert.ok(stores.includes('morrisons'), 'Morrisons must be in supermarkets');
    assert.ok(stores.includes('iceland'), 'Iceland must be in supermarkets');
    assert.ok(stores.includes('aldi'), 'Aldi must be in supermarkets');
    assert.ok(stores.includes('lidl'), 'Lidl must be in supermarkets');

    // 2. Assert plausible basket totalPrice
    for (const store of stores) {
      const storeRes = comparison.supermarkets[store];
      assert.ok(storeRes.itemsFound > 0, `${store} must have matched products`);
      assert.equal(typeof storeRes.totalPrice, 'number', `${store} must have numeric totalPrice`);
      assert.ok(
        storeRes.totalPrice > 40 && storeRes.totalPrice < 450,
        `${store} basket total £${storeRes.totalPrice} is outside plausible range (£40-£450)`
      );
    }

    // 3. Assert confidence and data-source stamp on every line
    for (const store of stores) {
      const storeRes = comparison.supermarkets[store];
      for (const m of storeRes.items) {
        if (m && m.product) {
          assert.ok(m.product.source, `Product ${m.product.title} at ${store} must carry data source stamp`);
          assert.ok(
            ['direct', 'cache', 'catalog', 'live'].includes(m.product.source),
            `Invalid source stamp: ${m.product.source}`
          );
          assert.ok(m.confidence || m.product.confidence, `Product ${m.product.title} must carry confidence`);
        }
      }
    }

    // 4. Critical Invariant: Store with no live data (Aldi / Lidl) MUST be labelled estimated
    const aldi = comparison.supermarkets['aldi'];
    assert.ok(aldi, 'Aldi must be present in response');
    assert.equal(aldi.hasEstimatedPrices, true, 'Aldi must be flagged hasEstimatedPrices: true');
    assert.ok(aldi.estimatedShare > 0.8, 'Aldi must have high estimatedShare since no live adapter exists');
    for (const m of aldi.items) {
      if (m && m.product) {
        assert.equal(m.product.source, 'catalog', 'Aldi products must be catalog-sourced');
        assert.equal(m.product.confidence, 'estimated', 'Aldi products must be labelled confidence: estimated');
      }
    }

    const lidl = comparison.supermarkets['lidl'];
    assert.ok(lidl, 'Lidl must be present in response');
    assert.equal(lidl.hasEstimatedPrices, true, 'Lidl must be flagged hasEstimatedPrices: true');
    assert.ok(lidl.estimatedShare > 0.8, 'Lidl must have high estimatedShare');
  });

  describe('Bad Input & Error Paths', () => {
    it('should reject empty items list with 400', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('should reject malformed non-array items with 400', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: 'not-an-array' })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('should reject unknown supermarket in preferences with 400', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ name: 'milk', targetQuantity: 1, unit: 'item' }],
          preferences: { enabledSupermarkets: ['fake_retailer_xyz'] }
        })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Unknown supermarket'));
    });

    it('should reject 1000-line list with 400 instead of hanging or 500', async () => {
      const hugeList = Array.from({ length: 1000 }, (_, i) => ({
        name: `Item ${i}`,
        targetQuantity: 1,
        unit: 'item'
      }));

      const start = Date.now();
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: hugeList })
      });
      const duration = Date.now() - start;

      assert.equal(res.status, 400);
      assert.ok(duration < 2000, 'Rejection of oversized input must be fast (<2s)');
      const data = await res.json();
      assert.ok(data.error.includes('maximum allowed length'));
    });
  });
});
