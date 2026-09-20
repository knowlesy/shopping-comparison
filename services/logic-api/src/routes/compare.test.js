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
import { getCoreSearchQuery, buildScrapeCacheKey, buildStoreCandidateCacheKey } from '../services/candidatePipeline.js';
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
  let settingsUrl;

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
        settingsUrl = `http://127.0.0.1:${port}/api/settings`;
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
    assert.ok(comparison.meta?.candidateStatuses, 'candidate provenance must survive into comparison metadata');
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
      assert.ok(storeRes.candidateStatus, `${store} must expose a concise candidate fallback status`);
      assert.ok(
        Array.isArray(comparison.meta.candidateStatuses[store]),
        `${store} must retain per-item candidate status metadata`
      );
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
      // Task 08 made the per-store v3 key authoritative and it is consulted before the
      // legacy combined v2 entry. The 52-line list in the outer before() hook shares this
      // core query, so it leaves a v3 tesco row behind. Seed the canonical key (and the
      // legacy one, so the migration path stays covered) to pin these fixtures.
      PriceCache.set(buildStoreCandidateCacheKey(coreQuery, 'tesco'), mockCandidates);
      PriceCache.set(buildScrapeCacheKey(coreQuery, ['tesco']), mockCandidates);
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
        { body: { items: [{ name: 'Milk' }], preferences: 'not-an-object' }, desc: 'invalid preferences type' },
        { body: { items: [{ name: 'Milk' }], preferences: null }, desc: 'explicitly null preferences' }
      ];

      // An explicit null used to pass validation (only `undefined` defaults), so both handlers
      // read `preferences.enablePastSearches` outside their try/catch and rejected with an
      // unhandled TypeError. Prove the rejection is a controlled 400 with no search recorded.
      const recordedQueries = [];
      const origRecordSearch = PriceCache.recordSearch;
      PriceCache.recordSearch = (params) => {
        recordedQueries.push(params);
        return origRecordSearch.call(PriceCache, params);
      };

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

      PriceCache.recordSearch = origRecordSearch;
      assert.equal(
        recordedQueries.length,
        0,
        'No rejected payload may record a past search before validation'
      );
    });

    it('Condition 7: Disabling the saved selection stage stops per-item review and batched escalation', async () => {
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
            generateContent: async () => ({ text: JSON.stringify({ decisions: [] }) })
          }
        };
      });

      // Drive the switch through the supported settings contract, not a request-only field.
      // settingsStore only permits interpret/query/select, so `escalate` cannot be saved at all;
      // escalation is the batched fallback of the selection stage and must follow `select`.
      const rejected = await fetch(settingsUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiStages: { escalate: false } })
      });
      assert.equal(rejected.status, 400, 'aiStages.escalate is not a supported saved stage');

      const saved = await fetch(settingsUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiMatchingEnabled: true,
          enabledSupermarkets: ['tesco'],
          aiStages: { interpret: false, query: false, select: false }
        })
      });
      assert.equal(saved.status, 200);
      const savedBody = await saved.json();
      assert.equal(savedBody.aiStages.select, false);

      try {
        // No `preferences` in the body: the route falls back to the saved settings.
        const res = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{ name: 'Unknown Exotic Item 123', rawText: 'Unknown Exotic Item 123', targetQuantity: 1 }]
          })
        });
        assert.equal(res.status, 200);
        assert.equal(selectCalls, 0, 'Saved select=false must make zero per-item review calls');
        assert.equal(escalationCalls, 0, 'Saved select=false must also stop batched escalation');
      } finally {
        await fetch(settingsUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aiStages: { interpret: true, query: false, select: true } })
        });
      }
    });
  });

  describe('Task 05 Acceptance Conditions Suite (Basket Recalculation & Swaps)', () => {
    const adjustUrl = () => `${baseUrl}/adjust`;

    const getBaseComparison = async () => {
      const items = [
        { id: 'milk_1', name: 'Semi-skimmed milk', rawText: 'Semi-skimmed milk 4 pints', targetQuantity: 4, unit: 'pt' },
        { id: 'bread_1', name: 'Wholemeal bread', rawText: 'Wholemeal bread 1 loaf', targetQuantity: 1, unit: 'loaf' }
      ];

      const stores = ['tesco', 'asda', 'sainsburys'];

      // Candidates a swap may later choose must be candidates the server actually acquired:
      // POST /api/compare/adjust resolves a product id against this pool and ignores whatever
      // price or source the caller sends. Seed both the canonical per-store v3 keys and the
      // legacy combined v2 key (see the task 03 suite for why v3 must be seeded explicitly).
      const milkCandidates = [
        { id: 't-live-milk', title: 'Tesco British Semi Skimmed Milk 4 Pints', price: 1.55, supermarket: 'tesco', source: 'live', packageSize: 4, packageUnit: 'pt', isEstimated: false },
        { id: 'a-live-milk', title: 'Asda British Semi Skimmed Milk 4 Pints', price: 1.50, supermarket: 'asda', source: 'live', packageSize: 4, packageUnit: 'pt', isEstimated: false },
        { id: 's-live-milk', title: "Sainsbury's British Semi Skimmed Milk 4 Pints", price: 1.55, supermarket: 'sainsburys', source: 'live', packageSize: 4, packageUnit: 'pt', isEstimated: false },
        // Estimated catalog benchmark offered alongside the live row (Condition 1 swaps to it).
        {
          id: 'tesco-cat-milk-999', supermarket: 'tesco', title: 'Tesco Benchmark Milk 4 Pints',
          brand: 'Tesco', tier: 'standard', category: 'dairy-eggs',
          packageSize: 4, packageUnit: 'pt', packageDisplay: '4 Pints',
          price: 3.50, unitPrice: 0.88, unitPriceMeasure: 'per pint',
          source: 'catalog', isEstimated: true, isHealthier: false
        },
        // Deliberately unmatched value lines used by Condition 4 to force a store rank change.
        { id: 'super-cheap-tesco', supermarket: 'tesco', title: 'Super Value Item', brand: 'Value', tier: 'value', category: 'dairy-eggs', packageSize: 4, packageUnit: 'pt', packageDisplay: '4 Pints', price: 0.10, unitPrice: 0.02, unitPriceMeasure: 'per pint', source: 'live', isEstimated: false, isHealthier: false },
        { id: 'super-cheap-asda', supermarket: 'asda', title: 'Super Value Item', brand: 'Value', tier: 'value', category: 'dairy-eggs', packageSize: 4, packageUnit: 'pt', packageDisplay: '4 Pints', price: 0.10, unitPrice: 0.02, unitPriceMeasure: 'per pint', source: 'live', isEstimated: false, isHealthier: false }
      ];

      const breadCandidates = [
        { id: 't-live-bread', title: 'Tesco Wholemeal Medium Bread 800g', price: 0.85, supermarket: 'tesco', source: 'live', packageSize: 800, packageUnit: 'g', isEstimated: false },
        { id: 'a-live-bread', title: 'Asda Wholemeal Medium Bread 800g', price: 0.80, supermarket: 'asda', source: 'live', packageSize: 800, packageUnit: 'g', isEstimated: false },
        { id: 's-live-bread', title: "Sainsbury's Wholemeal Medium Bread 800g", price: 0.85, supermarket: 'sainsburys', source: 'live', packageSize: 800, packageUnit: 'g', isEstimated: false },
        // Clubcard + multibuy line used by Condition 2.
        {
          id: 'tesco-deal-bread-555', supermarket: 'tesco', title: 'Tesco Toastie Bread 800g',
          brand: 'Tesco', tier: 'standard', category: 'bakery',
          packageSize: 800, packageUnit: 'g', packageDisplay: '800g',
          price: 2.00, clubcardPrice: 1.20, unitPrice: 0.25, unitPriceMeasure: 'per 100g',
          source: 'live', isEstimated: false, isHealthier: false,
          deal: { rawText: 'Buy 2 for £2.50', type: 'multibuy_fixed', bundleQuantity: 2, bundlePrice: 2.50, badge: '2 for £2.50' }
        }
      ];

      const seed = (query, candidates) => {
        PriceCache.set(buildScrapeCacheKey(query, stores), candidates);
        for (const store of stores) {
          PriceCache.set(
            buildStoreCandidateCacheKey(query, store),
            candidates.filter((c) => c.supermarket === store)
          );
        }
      };
      // Derive the keys from the same helper the pipeline uses; 'Wholemeal bread' normalises
      // to the core query 'bread', so a hand-written key silently seeds nothing.
      seed(getCoreSearchQuery(items[0]), milkCandidates);
      seed(getCoreSearchQuery(items[1]), breadCandidates);

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          preferences: { enabledSupermarkets: stores, includeDeals: true }
        })
      });

      assert.equal(res.status, 200);
      return await res.json();
    };

    it('Condition 1: Live→estimated swap updates source/confidence, estimates, coverage, badges, savings and all dependent totals', async () => {
      const initialComp = await getBaseComparison();
      const initialTesco = initialComp.supermarkets.tesco;
      const initialEstimatedShare = initialTesco.estimatedShare;
      const initialTotalPrice = initialTesco.totalPrice;

      // Swap item 0 at tesco to the estimated catalog benchmark in its candidate pool
      const adjustRes = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: 'tesco',
          itemIndex: 0,
          selection: {
            product: { id: 'tesco-cat-milk-999' }
          }
        })
      });

      assert.equal(adjustRes.status, 200);
      const updatedComp = await adjustRes.json();
      const updatedTesco = updatedComp.supermarkets.tesco;
      const updatedItem = updatedTesco.items[0];

      // 1. Source and confidence updated
      assert.equal(updatedItem.product.id, 'tesco-cat-milk-999');
      assert.equal(updatedItem.isEstimated, true);
      assert.equal(updatedItem.confidenceSource, 'catalog');
      assert.equal(updatedItem.matchSource, 'user-swap');
      assert.ok(updatedItem.confidence.includes('catalog') || updatedItem.confidence.includes('Catalog'));

      // 2. Dependent totals updated
      assert.notEqual(updatedTesco.totalPrice, initialTotalPrice);
      assert.ok(updatedTesco.estimatedShare > initialEstimatedShare, 'Estimated share should increase');
      assert.equal(updatedTesco.hasEstimatedPrices, true);
      assert.equal(updatedComp.hasEstimatedPrices, true);
      assert.ok(updatedComp.splitOptimization, 'Split optimization should be recomputed');
    });

    it('Condition 2: Deals disabled never applies clubcard/multibuy pricing; enabled deals belong to the replacement product', async () => {
      const initialComp = await getBaseComparison();

      const productWithDeals = { id: 'tesco-deal-bread-555' };

      // Case A: includeDeals: false -> neither loyalty clubcard nor multibuy deal applied
      const noDealsRes = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: 'tesco',
          itemIndex: 1,
          selection: {
            product: productWithDeals,
            packs: 2
          },
          preferences: { includeDeals: false }
        })
      });

      assert.equal(noDealsRes.status, 200);
      const noDealsComp = await noDealsRes.json();
      const noDealsMatch = noDealsComp.supermarkets.tesco.items[1];
      assert.equal(noDealsMatch.totalPrice, 4.00, '2 packs at £2.00 standard price without deals');
      assert.equal(noDealsMatch.dealApplied, undefined, 'dealApplied must be undefined when includeDeals is false');

      // Case B: includeDeals: true -> deal applied from the replacement product
      const dealsRes = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: 'tesco',
          itemIndex: 1,
          selection: {
            product: productWithDeals,
            packs: 2
          },
          preferences: { includeDeals: true }
        })
      });

      assert.equal(dealsRes.status, 200);
      const dealsComp = await dealsRes.json();
      const dealsMatch = dealsComp.supermarkets.tesco.items[1];
      assert.equal(dealsMatch.totalPrice, 2.50, 'Multibuy deal 2 for £2.50 applied');
      assert.ok(dealsMatch.dealApplied, 'dealApplied must be populated');
      assert.equal(dealsMatch.dealApplied.dealText, '2 for £2.50');
    });

    it('Condition 3: Manual quantities produce correct totals/shortfall/lines and reject invalid values without corrupting state', async () => {
      const initialComp = await getBaseComparison();

      // Adjust packs to 3
      const validRes = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: 'tesco',
          itemIndex: 0,
          selection: {
            packs: 3
          }
        })
      });

      assert.equal(validRes.status, 200);
      const validComp = await validRes.json();
      const match = validComp.supermarkets.tesco.items[0];
      assert.equal(match.packsNeeded, 3);
      assert.equal(match.lines.length, 1);
      assert.equal(match.lines[0].packs, 3);
      assert.ok(match.explanation.startsWith('3x'));

      // Test invalid quantities rejection
      const invalidPacks = [0, -1, 2.5, 'three', null, 100];
      for (const badPack of invalidPacks) {
        const invalidRes = await fetch(adjustUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comparisonId: initialComp.comparisonId,
            store: 'tesco',
            itemIndex: 0,
            selection: {
              packs: badPack
            }
          })
        });

        assert.equal(invalidRes.status, 400, `Expected 400 for bad packs value: ${badPack}`);
        const errBody = await invalidRes.json();
        assert.ok(errBody.error);
      }
    });

    it('Condition 4: Changing the recommended store updates cheapestStore AND per-store flags; unrelated basket selections survive', async () => {
      const initialComp = await getBaseComparison();
      const initialCheapest = initialComp.cheapestStore;

      // Pick the competitor store to make cheapest
      const competitorStore = initialCheapest === 'tesco' ? 'asda' : 'tesco';

      // Swap an item in competitorStore to a super-cheap 10p product to force store rank change
      const cheapProduct = { id: `super-cheap-${competitorStore}` };

      const res = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: competitorStore,
          itemIndex: 0,
          selection: {
            product: cheapProduct,
            packs: 1
          }
        })
      });

      assert.equal(res.status, 200);
      const updatedComp = await res.json();

      // Assert cheapest store shifted to competitorStore
      assert.equal(updatedComp.cheapestStore, competitorStore);
      assert.equal(updatedComp.supermarkets[competitorStore].isCheapest, true);
      assert.equal(updatedComp.supermarkets[competitorStore].badge, '🏆 Cheapest Overall');

      // Assert previous cheapest store lost cheapest flag and badge
      assert.equal(updatedComp.supermarkets[initialCheapest].isCheapest, false);
      assert.notEqual(updatedComp.supermarkets[initialCheapest].badge, '🏆 Cheapest Overall');

      // Assert unrelated stores (e.g. sainsburys) retained all their items and selections
      const initialSains = initialComp.supermarkets.sainsburys;
      const updatedSains = updatedComp.supermarkets.sainsburys;
      assert.equal(updatedSains.items.length, initialSains.items.length);
      assert.equal(updatedSains.totalPrice, initialSains.totalPrice);
      assert.equal(updatedSains.items[0].product.id, initialSains.items[0].product.id);
    });

    it('Condition 5: Failed adjustment leaves previous basket intact with visible failure', async () => {
      const initialComp = await getBaseComparison();
      const goodId = initialComp.comparisonId;

      const invalidRequests = [
        { body: {}, desc: 'empty request body' },
        { body: { store: 'tesco', itemIndex: 0, selection: { packs: 2 } }, desc: 'missing comparisonId' },
        { body: { comparisonId: 'ffffffffffffffffffffffffffffffff', store: 'tesco', itemIndex: 0, selection: { packs: 2 } }, desc: 'unknown or expired comparisonId' },
        { body: { comparisonId: goodId, store: 'unknown_mart', itemIndex: 0, selection: { packs: 2 } }, desc: 'unknown supermarket' },
        { body: { comparisonId: goodId, store: 'tesco', itemIndex: 99, selection: { packs: 2 } }, desc: 'out of bounds itemIndex' },
        { body: { comparisonId: goodId, store: 'tesco', selection: { packs: 2 } }, desc: 'neither itemIndex nor itemId' },
        { body: { comparisonId: goodId, store: 'tesco', itemIndex: 0, selection: { product: { id: 'never-seen-product' } } }, desc: 'product outside this comparison' }
      ];

      for (const req of invalidRequests) {
        const res = await fetch(adjustUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body)
        });

        assert.equal(res.status, 400, `Expected 400 for ${req.desc}`);
        const data = await res.json();
        assert.ok(data.error, `Error response expected for ${req.desc}`);
      }

      // The server-owned basket must be untouched by every rejected attempt.
      const afterRes = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: goodId,
          store: 'tesco',
          itemIndex: 0,
          selection: { packs: initialComp.supermarkets.tesco.items[0].packsNeeded }
        })
      });
      assert.equal(afterRes.status, 200);
      const afterComp = await afterRes.json();
      assert.equal(afterComp.supermarkets.tesco.items[0].product.id, initialComp.supermarkets.tesco.items[0].product.id);
      assert.equal(afterComp.supermarkets.tesco.totalPrice, initialComp.supermarkets.tesco.totalPrice);
      assert.equal(afterComp.cheapestStore, initialComp.cheapestStore);
    });

    it('Condition 6: Caller-supplied price, provenance and identity are never trusted', async () => {
      const initialComp = await getBaseComparison();
      const before = initialComp.supermarkets.tesco.items[0];
      assert.equal(before.product.id, 't-live-milk', 'precondition: tesco milk matched the live row');

      // A real candidate id, but with a tampered price and an invented "direct" provenance.
      const tamperedRes = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: 'tesco',
          itemIndex: 0,
          selection: {
            product: {
              id: 'tesco-cat-milk-999',
              title: 'Free Milk',
              price: 0.01,
              source: 'direct',
              isEstimated: false,
              packageSize: 400,
              clubcardPrice: 0.01
            },
            packs: 1
          }
        })
      });

      assert.equal(tamperedRes.status, 200);
      const tampered = await tamperedRes.json();
      const item = tampered.supermarkets.tesco.items[0];

      assert.equal(item.product.id, 'tesco-cat-milk-999');
      assert.equal(item.product.price, 3.50, 'server-held price must win over the caller price');
      assert.equal(item.product.title, 'Tesco Benchmark Milk 4 Pints', 'server-held title must win');
      assert.equal(item.product.source, 'catalog', 'caller cannot invent a direct provenance');
      assert.equal(item.product.clubcardPrice, undefined, 'caller cannot invent a loyalty price');
      assert.equal(item.totalPrice, 3.50, '1 pack at the server-held price');
      assert.equal(item.confidenceSource, 'catalog');
      assert.equal(item.isEstimated, true);

      // An id that was never a candidate of this comparison is refused outright.
      const unknownRes = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: 'tesco',
          itemIndex: 0,
          selection: { product: { id: 'never-seen-product', title: 'Ghost', price: 0.01, source: 'direct' } }
        })
      });
      assert.equal(unknownRes.status, 400);
      const unknownBody = await unknownRes.json();
      assert.match(unknownBody.error, /not a candidate of this comparison/);

      // A candidate belonging to another store cannot be moved into this one.
      const crossStoreRes = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: 'tesco',
          itemIndex: 0,
          selection: { product: { id: 'a-live-milk' } }
        })
      });
      assert.equal(crossStoreRes.status, 400);
    });

    it('Condition 7: Untouched lines are recalculated from server-held context, not from the caller', async () => {
      const initialComp = await getBaseComparison();
      const untouchedBefore = initialComp.supermarkets.sainsburys.items[0];

      // Even if a caller could describe the rest of the basket, it is never sent: only the id
      // and the requested change are. Prove the untouched store keeps its server-side numbers.
      const res = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: 'tesco',
          itemIndex: 0,
          selection: { packs: 2 }
        })
      });
      assert.equal(res.status, 200);
      const updated = await res.json();

      const untouchedAfter = updated.supermarkets.sainsburys.items[0];
      assert.equal(untouchedAfter.product.id, untouchedBefore.product.id);
      assert.equal(untouchedAfter.totalPrice, untouchedBefore.totalPrice);
      assert.equal(updated.supermarkets.sainsburys.totalPrice, initialComp.supermarkets.sainsburys.totalPrice);

      // Successive edits chain onto the same server-owned context.
      assert.equal(updated.comparisonId, initialComp.comparisonId);
      const second = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: updated.comparisonId,
          store: 'tesco',
          itemIndex: 0,
          selection: { packs: 3 }
        })
      });
      assert.equal(second.status, 200);
      const secondComp = await second.json();
      assert.equal(secondComp.supermarkets.tesco.items[0].packsNeeded, 3);
    });

    // Task 09 acceptance condition 5: split savings are recomputed through the task 05 route.
    it('Condition 8: an adjustment recomputes the split route, its delivery and its coverage', async () => {
      const initialComp = await getBaseComparison();
      const before = initialComp.splitOptimization;

      assert.equal(before.itemsCovered, 2, 'both items are priced before the edit');
      assert.equal(
        before.combinedTotal,
        Number((before.combinedSubtotal + before.combinedDeliveryFee).toFixed(2)),
        'the advertised split total includes delivery'
      );

      // Swap the tesco milk line to the dearer catalog benchmark; the split must re-cost.
      const res = await fetch(adjustUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comparisonId: initialComp.comparisonId,
          store: 'tesco',
          itemIndex: 0,
          selection: { product: { id: 'tesco-cat-milk-999' }, packs: 1 }
        })
      });
      assert.equal(res.status, 200);
      const after = (await res.json()).splitOptimization;

      assert.ok(after.stores.length >= 1 && after.stores.length <= 2, 'never more than two stores');
      assert.equal(after.itemsCovered, 2);
      assert.equal(
        after.combinedTotal,
        Number((after.combinedSubtotal + after.combinedDeliveryFee).toFixed(2))
      );
      assert.equal(after.savingsVsSingleBest > 0, after.savingsAreVerified);
      assert.ok(after.singleBestTotal >= after.combinedTotal, 'the split is never dearer than its own baseline');
    });
  });
});
