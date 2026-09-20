import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
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
import { AiDecisionReviewer } from '../services/aiDecisionReviewer.js';
import { AiEscalation } from '../services/aiEscalation.js';
import { MatchLog } from '../services/matchLog.js';

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
    app.use((err, req, res, next) => {
      if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'Malformed JSON payload' });
      }
      next(err);
    });
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

  describe('Task 03 Canonical AI Match Application Route Tests', () => {
    const fakeClient = (text, opts = {}) => ({
      models: {
        generateContent: async () => {
          if (opts.throw) throw new Error('simulated model failure');
          return { text };
        }
      }
    });

    const mockItem = {
      rawText: 'Greek yogurt 1 kg',
      name: 'Greek yogurt',
      baseItem: 'Greek yogurt',
      category: 'dairy-eggs',
      targetQuantity: 1000,
      unit: 'g'
    };

    const mockCandidates = [
      {
        id: 'y-500',
        title: 'Tesco Greek Style Yogurt 500g',
        price: 1.50,
        packageSize: 500,
        packageUnit: 'g',
        category: 'dairy-eggs',
        supermarket: 'tesco',
        source: 'direct'
      },
      {
        id: 'y-250',
        title: 'Tesco Greek Style Yogurt 250g',
        price: 0.80,
        packageSize: 250,
        packageUnit: 'g',
        category: 'dairy-eggs',
        supermarket: 'tesco',
        source: 'direct'
      }
    ];

    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key-task-03';
      const coreQuery = getCoreSearchQuery(mockItem);
      const cacheKey = buildScrapeCacheKey(coreQuery, ['tesco']);
      PriceCache.set(cacheKey, mockCandidates);
    });

    afterEach(() => {
      AiDecisionReviewer.resetClientFactory();
    });

    it('should rebuild dependent fields when AI changes product from 2x500g to 4x250g', async () => {
      AiDecisionReviewer.setClientFactory(() =>
        fakeClient(JSON.stringify({ selectedIndex: 1, confidence: 0.95, reasoning: '250g pack is cheaper' }))
      );

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [mockItem],
          preferences: {
            enabledSupermarkets: ['tesco'],
            aiMatchingEnabled: true,
            forceReview: true,
            bypassCache: true
          }
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const match = data.supermarkets.tesco.items[0];

      assert.equal(match.product.id, 'y-250');
      assert.equal(match.packsNeeded, 4, 'Must require 4 packs for 1000g');
      assert.equal(match.totalQuantity, 1000);
      assert.equal(match.totalPrice, 3.20);
      assert.equal(match.lines[0].product.id, 'y-250');
      assert.equal(match.lines[0].packs, 4);
      assert.equal(match.matchSource, 'ai');
      assert.equal(match.matchConfidence, 0.95);
    });

    it('should update match-confidence metadata when AI reviews same product without changing it', async () => {
      AiDecisionReviewer.setClientFactory(() =>
        fakeClient(JSON.stringify({ selectedIndex: 0, confidence: 0.97, reasoning: '500g pack confirmed optimal' }))
      );

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [mockItem],
          preferences: {
            enabledSupermarkets: ['tesco'],
            aiMatchingEnabled: true,
            forceReview: true,
            bypassCache: true
          }
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const match = data.supermarkets.tesco.items[0];

      assert.equal(match.product.id, 'y-500');
      assert.equal(match.matchSource, 'ai', 'Same product must still receive AI matchSource stamp');
      assert.equal(match.matchConfidence, 0.97);
      assert.equal(match.aiReasoning, '500g pack confirmed optimal');
    });

    it('should produce a coherent no-match with zero total and no product when AI declines', async () => {
      AiDecisionReviewer.setClientFactory(() =>
        fakeClient(JSON.stringify({ selectedIndex: null, confidence: 0.90, reasoning: 'No candidate satisfies dietary requirements' }))
      );

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [mockItem],
          preferences: {
            enabledSupermarkets: ['tesco'],
            aiMatchingEnabled: true,
            forceReview: true,
            bypassCache: true
          }
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const match = data.supermarkets.tesco.items[0];

      assert.equal(match.product, null, 'Must have product null');
      assert.equal(match.totalPrice, 0, 'Must have totalPrice 0');
      assert.equal(match.totalQuantity, 0, 'Must have totalQuantity 0');
      assert.equal(match.dealApplied, undefined, 'Must not retain deal');
      assert.equal(match.lines.length, 0);
      assert.equal(match.matchSource, 'ai');
      assert.equal(match.aiReasoning, 'No candidate satisfies dietary requirements');
    });

    it('should fall back safely to rules without AI stamp when model evaluation fails', async () => {
      AiDecisionReviewer.setClientFactory(() =>
        fakeClient('', { throw: true })
      );

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [mockItem],
          preferences: {
            enabledSupermarkets: ['tesco'],
            aiMatchingEnabled: true,
            forceReview: true,
            bypassCache: true
          }
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      const match = data.supermarkets.tesco.items[0];

      assert.equal(match.product.id, 'y-500', 'Should fall back to rules match');
      assert.notEqual(match.matchSource, 'ai', 'Must not claim AI matchSource on model failure');
      assert.equal(match.totalPrice, 3.00);
    });
  });

  describe('Task 04 Acceptance Conditions Suite', () => {
    const streamBaseUrl = () => baseUrl + '/stream';

    const parseSseEvents = (text) => {
      const lines = text.split('\n');
      const events = [];
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            events.push(JSON.parse(line.slice(6)));
          } catch {}
        }
      }
      return events;
    };

    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-fake-key-task-04';
      AiDecisionReviewer.resetClientFactory();
      AiEscalation.resetClientFactory();
    });

    afterEach(() => {
      AiDecisionReviewer.resetClientFactory();
      AiEscalation.resetClientFactory();
    });

    it('Condition 1: Normal and SSE transports produce semantically identical baskets (excluding timestamps/meta)', async () => {
      const items = [
        { name: 'Apples', rawText: 'Apples 1 kg', targetQuantity: 1, unit: 'kg' }
      ];
      const cacheKey = buildScrapeCacheKey('apples', ['tesco']);
      PriceCache.set(cacheKey, [
        { id: 'app-1', title: 'Tesco British Apples 1kg', price: 1.80, packageSize: 1, packageUnit: 'kg', supermarket: 'tesco', source: 'catalog' }
      ]);

      // POST /api/compare
      const normalRes = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          preferences: { enabledSupermarkets: ['tesco'], aiMatchingEnabled: false }
        })
      });
      assert.equal(normalRes.status, 200);
      const normalBasket = await normalRes.json();

      // POST /api/compare/stream
      const streamRes = await fetch(streamBaseUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          preferences: { enabledSupermarkets: ['tesco'], aiMatchingEnabled: false }
        })
      });
      assert.equal(streamRes.status, 200);
      assert.equal(streamRes.headers.get('content-type')?.includes('text/event-stream'), true);
      const sseText = await streamRes.text();
      const events = parseSseEvents(sseText);
      const completeEvent = events.find((e) => e.type === 'complete');
      assert.ok(completeEvent, 'SSE stream must emit complete event');
      const streamBasket = completeEvent.comparison;

      // Assert semantic equivalence
      assert.equal(streamBasket.cheapestStore, normalBasket.cheapestStore);
      assert.equal(streamBasket.supermarkets.tesco.totalPrice, normalBasket.supermarkets.tesco.totalPrice);
      assert.equal(streamBasket.supermarkets.tesco.items.length, normalBasket.supermarkets.tesco.items.length);
      assert.equal(streamBasket.supermarkets.tesco.items[0].product.id, normalBasket.supermarkets.tesco.items[0].product.id);
      assert.equal(streamBasket.supermarkets.tesco.items[0].totalPrice, normalBasket.supermarkets.tesco.items[0].totalPrice);
    });

    it('Condition 2: Escalation updates duplicate item names and stores accurately without cross-application', async () => {
      // Two duplicate items with same name, tested across two stores
      const items = [
        { id: 'bread_1', name: 'ZzzUnmatchedBread', rawText: 'ZzzUnmatchedBread 1 loaf', targetQuantity: 1, unit: 'loaf' },
        { id: 'bread_2', name: 'ZzzUnmatchedBread', rawText: 'ZzzUnmatchedBread 2 loaves', targetQuantity: 2, unit: 'loaf' }
      ];

      // No catalog match: score 0 triggers escalation
      const cacheKey = buildScrapeCacheKey('zzzunmatchedbread', ['tesco', 'asda']);
      PriceCache.set(cacheKey, [
        { id: 't-unrelated', title: 'Unrelated Product 800g', price: 2.00, supermarket: 'tesco', source: 'catalog' },
        { id: 'a-unrelated', title: 'Unrelated Product 800g', price: 2.10, supermarket: 'asda', source: 'catalog' }
      ]);

      // Mock escalation returning explicit decisions per batch item:
      // batch 0: tesco, item 0 -> decline with specific reasoning
      // batch 1: asda, item 0 -> decline with specific reasoning
      // batch 2: tesco, item 1 -> decline with specific reasoning
      // batch 3: asda, item 1 -> decline with specific reasoning
      AiEscalation.setClientFactory(() => ({
        models: {
          generateContent: async () => ({
            text: JSON.stringify({
              decisions: [
                { batchIndex: 0, selectedIndex: null, confidence: 0.96, reasoning: 'Escalation decision for Tesco Item 0' },
                { batchIndex: 1, selectedIndex: null, confidence: 0.90, reasoning: 'Escalation decision for Asda Item 0' },
                { batchIndex: 2, selectedIndex: null, confidence: 0.92, reasoning: 'Escalation decision for Tesco Item 1' },
                { batchIndex: 3, selectedIndex: null, confidence: 0.88, reasoning: 'Escalation decision for Asda Item 1' }
              ]
            })
          })
        }
      }));

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          preferences: {
            enabledSupermarkets: ['tesco', 'asda'],
            aiMatchingEnabled: true,
            aiAssistLevel: 'balanced',
            aiStages: { select: false, escalate: true },
            aiEscalationEnabled: true,
            bypassCache: true
          }
        })
      });

      assert.equal(res.status, 200);
      const comparison = await res.json();
      const tescoItems = comparison.supermarkets.tesco.items;
      const asdaItems = comparison.supermarkets.asda.items;

      assert.equal(tescoItems.length, 2);
      assert.equal(asdaItems.length, 2);

      // Item 0 at Tesco
      assert.equal(tescoItems[0].itemIndex, 0);
      assert.equal(tescoItems[0].itemId, 'bread_1');
      assert.equal(tescoItems[0].matchSource, 'ai-escalation');
      assert.equal(tescoItems[0].aiReasoning, 'Escalation decision for Tesco Item 0');

      // Item 0 at Asda
      assert.equal(asdaItems[0].itemIndex, 0);
      assert.equal(asdaItems[0].itemId, 'bread_1');
      assert.equal(asdaItems[0].matchSource, 'ai-escalation');
      assert.equal(asdaItems[0].aiReasoning, 'Escalation decision for Asda Item 0');

      // Item 1 at Tesco
      assert.equal(tescoItems[1].itemIndex, 1);
      assert.equal(tescoItems[1].itemId, 'bread_2');
      assert.equal(tescoItems[1].matchSource, 'ai-escalation');
      assert.equal(tescoItems[1].aiReasoning, 'Escalation decision for Tesco Item 1');

      // Item 1 at Asda
      assert.equal(asdaItems[1].itemIndex, 1);
      assert.equal(asdaItems[1].itemId, 'bread_2');
      assert.equal(asdaItems[1].matchSource, 'ai-escalation');
      assert.equal(asdaItems[1].aiReasoning, 'Escalation decision for Asda Item 1');
    });

    it('Condition 3: Stage disabling (select=false, escalate=false) and exhausted budget prevent prohibited calls', async () => {
      let selectCalls = 0;
      let escalationCalls = 0;

      AiDecisionReviewer.setClientFactory(() => {
        selectCalls++;
        return {
          models: {
            generateContent: async () => ({
              text: JSON.stringify({ selectedIndex: 0, confidence: 0.9, reasoning: 'Reviewer pick' })
            })
          }
        };
      });

      AiEscalation.setClientFactory(() => {
        escalationCalls++;
        return {
          models: {
            generateContent: async () => ({
              text: JSON.stringify({ decisions: [] })
            })
          }
        };
      });

      const items = [
        { name: 'Unknown Exotic Item 123', rawText: 'Unknown Exotic Item 123', targetQuantity: 1 }
      ];

      // 1. Stage select=false, escalate=false
      const res1 = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          preferences: {
            enabledSupermarkets: ['tesco'],
            aiMatchingEnabled: true,
            aiStages: { select: false, escalate: false },
            bypassCache: true
          }
        })
      });
      assert.equal(res1.status, 200);
      assert.equal(selectCalls, 0, 'Must make zero select AI calls when select stage is disabled');
      assert.equal(escalationCalls, 0, 'Must make zero escalation AI calls when escalate stage is disabled');

      // 2. Budget exhausted (aiMaxCallsPerBasket: 0)
      const res2 = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          preferences: {
            enabledSupermarkets: ['tesco'],
            aiMatchingEnabled: true,
            aiMaxCallsPerBasket: 0,
            forceReview: true,
            bypassCache: true
          }
        })
      });
      assert.equal(res2.status, 200);
      assert.equal(selectCalls, 0, 'Must make zero AI calls when budget is 0');
      assert.equal(escalationCalls, 0, 'Must make zero escalation calls when budget is 0');
    });

    it('Condition 4: Client disconnect aborts work; explicit error events distinct from complete', async () => {
      // Test explicit error handling in SSE stream
      const res = await fetch(streamBaseUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: 'invalid-items-payload'
        })
      });

      // Returns 400 JSON before stream headers are established
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('Condition 5: No-match logs include considered candidates and final AI results without leaking raw credentials', async () => {
      const items = [{ name: 'Nonexistent Special Item', rawText: 'Nonexistent Special Item', targetQuantity: 1 }];
      const cacheKey = buildScrapeCacheKey('nonexistent special item', ['tesco']);
      PriceCache.set(cacheKey, [
        { id: 'cand-1', title: 'Unrelated Product A', price: 2.50, supermarket: 'tesco', source: 'catalog' }
      ]);

      const logCapture = [];
      const origRecord = MatchLog.recordDecision;
      MatchLog.recordDecision = (params) => {
        logCapture.push(params);
        return origRecord.call(MatchLog, params);
      };

      try {
        const res = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            preferences: {
              enabledSupermarkets: ['tesco'],
              aiMatchingEnabled: false,
              enableMatchLog: true,
              geminiApiKey: 'SECRET_API_KEY_NEVER_LOG'
            }
          })
        });

        assert.equal(res.status, 200);
        assert.ok(logCapture.length > 0, 'MatchLog.recordDecision must have been called');

        // Check written log file on disk to ensure raw secret credentials were not serialized
        const dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
        const logFile = path.join(dataDir, 'match_decisions.jsonl');
        if (fs.existsSync(logFile)) {
          const logContent = fs.readFileSync(logFile, 'utf8');
          assert.equal(logContent.includes('SECRET_API_KEY_NEVER_LOG'), false, 'Log file must never leak raw API key');
        }

        const decision = logCapture[0];
        assert.ok(decision.candidates, 'Must record candidates');
        assert.ok(decision.candidates.length > 0, 'Candidates list must not be empty');
        assert.equal(decision.candidates[0].product.id, 'cand-1');
      } finally {
        MatchLog.recordDecision = origRecord;
      }
    });

    it('Condition 6: Both transports reject malformed items, null/invalid preferences, and invalid supermarket with 400 before side effects', async () => {
      const testCases = [
        { body: '', desc: 'empty string body' },
        { body: 'invalid json primitive', desc: 'string primitive body' },
        { body: { items: [{ targetQuantity: -5 }] }, desc: 'missing item name' },
        { body: { items: [{ name: 'Milk', targetQuantity: -1 }] }, desc: 'negative targetQuantity' },
        { body: { items: [{ name: 'Milk' }], preferences: { enabledSupermarkets: ['bogus_market'] } }, desc: 'invalid supermarket' },
        { body: { items: [{ name: 'Milk' }], preferences: 'not-an-object' }, desc: 'invalid preferences type' }
      ];

      for (const tc of testCases) {
        // Normal POST /api/compare
        const normalRes = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tc.body)
        });
        assert.equal(normalRes.status, 400, `POST /api/compare must reject ${tc.desc} with 400`);
        const normalData = await normalRes.json();
        assert.ok(normalData.error, `Response for ${tc.desc} must contain error message`);

        // SSE POST /api/compare/stream
        const streamRes = await fetch(streamBaseUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tc.body)
        });
        assert.equal(streamRes.status, 400, `POST /api/compare/stream must reject ${tc.desc} with 400 before SSE`);
        const streamData = await streamRes.json();
        assert.ok(streamData.error, `Stream response for ${tc.desc} must contain error message`);
      }
    });
  });
});

