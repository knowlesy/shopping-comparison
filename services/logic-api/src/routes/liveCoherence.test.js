import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserSettings } from './settings.js';
import { CATALOG_PRODUCTS } from '../services/catalogData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../..');

const REGISTRY_PATH = path.join(ROOT_DIR, 'services/store-fetcher/registry.py');
const REACHABILITY_PATH = path.join(ROOT_DIR, 'tests/fixtures/store-payloads/_reachability.json');

describe('Live Coherence: Stores agreement across registry, reachability, settings and catalog', () => {
  it('should ensure stores enabled by default agree across registry.py, _reachability.json and settings', () => {
    assert.ok(fs.existsSync(REGISTRY_PATH), 'registry.py must exist');
    assert.ok(fs.existsSync(REACHABILITY_PATH), '_reachability.json must exist');

    const registrySrc = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const reachability = JSON.parse(fs.readFileSync(REACHABILITY_PATH, 'utf8'));
    const defaultSettings = getUserSettings();

    const enabledSupermarkets = defaultSettings.enabledSupermarkets || [];
    const directStoreAdapters = defaultSettings.directStoreAdapters || {};

    const discrepancies = [];

    for (const store of enabledSupermarkets) {
      const isDirectAdapterDeclared = directStoreAdapters[store] === true;

      const storePattern = new RegExp(`["']${store}["']\\s*:\\s*\\{([^}]+)\\}`, 'i');
      const match = registrySrc.match(storePattern);
      const registryBlock = match ? match[1] : '';

      const isSupportedInRegistry = /["']supported["']\s*:\s*True/.test(registryBlock);
      const reachabilityEntry = reachability.stores?.[store];
      const isReachableInArtifact = reachabilityEntry?.status === 'reachable';

      if (isDirectAdapterDeclared) {
        if (!isSupportedInRegistry) {
          discrepancies.push(
            `Store "${store}" is enabled for direct scraping in settings, but marked supported: False in registry.py`
          );
        }
        if (!isReachableInArtifact) {
          discrepancies.push(
            `Store "${store}" is enabled for direct scraping in settings, but marked "${reachabilityEntry?.status || 'missing'}" in _reachability.json`
          );
        }
      } else {
        if (isSupportedInRegistry) {
          discrepancies.push(
            `Store "${store}" has no direct adapter in settings, but is marked supported: True in registry.py`
          );
        }
        const catalogRows = CATALOG_PRODUCTS.filter((p) => p.supermarket === store);
        assert.ok(catalogRows.length > 0, `Store "${store}" must have catalog benchmark data`);
        for (const p of catalogRows) {
          if (p.confidence !== 'estimated' || p.confidenceSource !== 'catalog') {
            discrepancies.push(
              `Catalog product ${p.id} for estimated store "${store}" lacks confidence: 'estimated' / confidenceSource: 'catalog'`
            );
            break;
          }
        }
      }
    }

    if (discrepancies.length > 0) {
      assert.fail(`Live coherence check failed:\n- ${discrepancies.join('\n- ')}`);
    }
  });

  it('should verify all reachable stores in _reachability.json are marked supported: True in registry.py', () => {
    const registrySrc = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const reachability = JSON.parse(fs.readFileSync(REACHABILITY_PATH, 'utf8'));

    for (const [store, entry] of Object.entries(reachability.stores || {})) {
      if (entry.status === 'reachable') {
        const storePattern = new RegExp(`["']${store}["']\\s*:\\s*\\{([^}]+)\\}`, 'i');
        const match = registrySrc.match(storePattern);
        assert.ok(match, `Store "${store}" declared reachable must exist in registry.py`);
        const block = match[1];
        assert.ok(
          /["']supported["']\s*:\s*True/.test(block),
          `Store "${store}" is reachable (${entry.productsFound} products) but registry.py marks it supported: False`
        );
      }
    }
  });
});
