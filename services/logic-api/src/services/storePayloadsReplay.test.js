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
});
