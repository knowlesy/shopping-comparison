import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { settingsRouter } from './settings.js';
import { alternativesRouter } from './alternatives.js';
import { compareRouter } from './compare.js';

describe('HTTP API: Settings & Alternatives Route Tests', () => {
  let app;
  let server;
  let port;

  before(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/settings', settingsRouter);
    app.use('/api/alternatives', alternativesRouter);
    app.use('/api/products/alternatives', alternativesRouter);
    app.use('/api/compare', compareRouter);

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('GET /api/settings should never echo back geminiApiKey and should return hasGeminiKey boolean', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/settings`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.geminiApiKey, undefined, 'geminiApiKey must never be exposed via GET /api/settings');
    assert.equal(typeof data.hasGeminiKey, 'boolean', 'hasGeminiKey must be a boolean flag');
  });

  it('PUT /api/settings changes preferences and actually reaches a subsequent compare', async () => {
    // 1. Update preference via PUT
    const putRes = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandTierPriority: 'value',
        preferOrganic: true
      })
    });
    assert.equal(putRes.status, 200);
    const updated = await putRes.json();
    assert.equal(updated.brandTierPriority, 'value');
    assert.equal(updated.preferOrganic, true);

    // 2. Perform compare without explicit preferences in body: should pick up userSettings
    const compRes = await fetch(`http://127.0.0.1:${port}/api/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ name: 'carrots', baseItem: 'carrots', targetQuantity: 1, unit: 'kg', category: 'produce' }]
      })
    });
    assert.equal(compRes.status, 200);
    const compData = await compRes.json();
    assert.ok(compData.supermarkets);
    assert.ok(compData.cheapestStore);

    // Revert settings to standard
    await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandTierPriority: 'standard',
        preferOrganic: false
      })
    });
  });

  it('GET /api/alternatives returns swaps labelled with confidence and catalog alternatives visibly estimated', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/alternatives?store=tesco&query=beef%20mince`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.alternatives), 'alternatives must be an array');
    assert.ok(data.alternatives.length > 0, 'alternatives should return candidates');

    for (const alt of data.alternatives) {
      assert.ok(alt.title, 'Alternative must have title');
      assert.ok(alt.confidence, 'Alternative must carry confidence');
      assert.ok(alt.confidenceSource, 'Alternative must carry confidenceSource');
      if (alt.source === 'catalog') {
        assert.equal(alt.confidence, 'estimated', 'Catalog alternative must have confidence: estimated');
        assert.equal(alt.isEstimated, true, 'Catalog alternative must be visibly isEstimated: true');
      }
    }
  });
});
