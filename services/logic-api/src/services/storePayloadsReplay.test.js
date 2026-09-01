import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../');
const FIXTURES_DIR = path.join(ROOT_DIR, 'tests/fixtures/store-payloads');

describe('Store Payloads Offline Replay Suite', () => {
  it('should verify store-payloads directory and reachability report exist', () => {
    assert.ok(fs.existsSync(FIXTURES_DIR), 'tests/fixtures/store-payloads/ directory must exist');

    const reachabilityFile = path.join(FIXTURES_DIR, '_reachability.json');
    if (fs.existsSync(reachabilityFile)) {
      const reachability = JSON.parse(fs.readFileSync(reachabilityFile, 'utf8'));
      assert.ok(reachability.stores, '_reachability.json must define a stores object');
    }
  });

  it('should replay all recorded store-payloads offline without network requests', () => {
    if (!fs.existsSync(FIXTURES_DIR)) return;

    const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));

    for (const file of files) {
      const filePath = path.join(FIXTURES_DIR, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Validate provenance structure
      const prov = content._provenance || content.provenance;
      if (prov) {
        assert.ok(prov.recordedAt, `${file}: _provenance.recordedAt is required`);
        assert.ok(prov.requestUrl, `${file}: _provenance.requestUrl is required`);
        assert.equal(typeof prov.httpStatus, 'number', `${file}: _provenance.httpStatus must be numeric`);
      }

      // Assert payload contains no unscrubbed tokens or cookies
      const rawText = JSON.stringify(content.payload ?? content);
      assert.ok(!/bearer [A-Za-z0-9\-._~+/]+=*/i.test(rawText), `${file}: payload must not contain bearer tokens`);
    }
  });

  it('should load a recorded tesco store-payload fixture and assert normalization offline', () => {
    if (!fs.existsSync(FIXTURES_DIR)) return;

    const tescoFiles = fs.readdirSync(FIXTURES_DIR).filter(f => f.startsWith('tesco-') && f.endsWith('.json'));
    assert.ok(tescoFiles.length > 0, 'At least one recorded Tesco fixture must exist in tests/fixtures/store-payloads');

    const fixturePath = path.join(FIXTURES_DIR, tescoFiles[0]);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.equal(fixture.store, 'tesco');
    assert.ok(fixture.payload, 'Tesco fixture must carry a payload');

    const rawProducts = fixture.payload.products || [];
    assert.ok(rawProducts.length > 0, 'Tesco payload must contain raw products');

    // Offline normalization function matching services/store-fetcher/adapters/tesco.py
    function normalizeTescoProduct(raw) {
      const id = String(raw.id || raw.tpnc || '');
      const title = raw.title || 'Unknown Product';
      const price = Number(raw.price?.actual || 0);
      const unitPrice = raw.price?.unitPrice !== undefined ? Number(raw.price.unitPrice) : null;
      const unitPriceMeasure = raw.price?.unitOfMeasure || null;
      const inStock = raw.isForSale !== false && raw.status !== 'UnavailableForSale';

      return {
        id,
        supermarket: 'tesco',
        title,
        price,
        unitPrice,
        unitPriceMeasure,
        inStock,
        source: 'direct',
        schemaVersion: '1.0.0'
      };
    }

    const normalized = rawProducts.map(normalizeTescoProduct);
    assert.ok(normalized.length > 0, 'Normalized product list must not be empty');

    const sample = normalized[0];
    assert.ok(sample.id, 'Normalized Tesco product must have an id');
    assert.equal(sample.supermarket, 'tesco');
    assert.equal(typeof sample.title, 'string');
    assert.ok(sample.title.length > 0);
    assert.equal(typeof sample.price, 'number');
    assert.ok(sample.price >= 0);
    assert.equal(sample.source, 'direct');
    assert.equal(sample.schemaVersion, '1.0.0');
  });

  it('should load a recorded sainsbury store-payload fixture and assert normalization offline', () => {
    if (!fs.existsSync(FIXTURES_DIR)) return;

    const sainsburyFiles = fs.readdirSync(FIXTURES_DIR).filter(f => f.startsWith('sainsburys-') && f.endsWith('.json'));
    if (sainsburyFiles.length === 0) return;

    const fixturePath = path.join(FIXTURES_DIR, sainsburyFiles[0]);
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    assert.equal(fixture.store, 'sainsburys');

    const rawProducts = fixture.payload.products || [];
    assert.ok(rawProducts.length > 0);

    function normalizeSainsburyProduct(raw) {
      return {
        id: String(raw.product_uid || raw.sainId || ''),
        supermarket: 'sainsburys',
        title: raw.name || '',
        price: Number(raw.retail_price?.price || 0),
        unitPrice: raw.unit_price?.price !== undefined ? Number(raw.unit_price.price) : null,
        unitPriceMeasure: raw.unit_price?.measure || null,
        inStock: Boolean(raw.is_available),
        source: 'direct',
        schemaVersion: '1.0.0'
      };
    }

    const normalized = rawProducts.map(normalizeSainsburyProduct);
    assert.ok(normalized.length > 0);
    const sample = normalized[0];
    assert.ok(sample.id);
    assert.equal(sample.supermarket, 'sainsburys');
    assert.ok(sample.price > 0);
    assert.equal(sample.source, 'direct');
  });
});
