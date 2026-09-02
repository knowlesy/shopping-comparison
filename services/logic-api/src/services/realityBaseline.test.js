import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IngredientParser } from './ingredientParser.js';
import { FuzzyMatcher } from './fuzzyMatcher.js';
import { BasketCalculator } from './basketCalculator.js';
import { isContaminated } from './contaminationRules.js';
import { getUserSettings } from '../routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../..');

const BASELINE_PATH = path.join(ROOT_DIR, 'tests/fixtures/reality-baseline.json');
const FIXTURES_PATH = path.join(ROOT_DIR, 'tests/fixtures/reality-fixtures.json');
const SAMPLE_PATH = path.join(ROOT_DIR, 'tests/fixtures/reality-sample.json');
const REAL_LIST_PATH = path.join(ROOT_DIR, 'tests/fixtures/real-list.json');

const REAL_SENTINELS = [
  'Maris Piper potatoes 1.8 kg',
  'Tomato puree 1 tube',
  'Reduced-salt stock cubes 3 (adults only, never for infant)',
  'Cherry/salad tomatoes 900 g'
];

function isSuspectMatch(item, product) {
  if (!product || !item) return false;
  const itemText = (item.name || item.baseItem || '').toLowerCase();
  const prodTitle = (product.title || '').toLowerCase();

  if (isContaminated(itemText, prodTitle)) return true;
  if (/hummus/i.test(itemText) && /chips|crisps/i.test(prodTitle)) return true;
  if (/apple/i.test(itemText) && /spinach/i.test(prodTitle)) return true;
  if (/walnut/i.test(itemText) && /puree|paste/i.test(prodTitle)) return true;
  if (/peanut butter/i.test(itemText) && /egg/i.test(prodTitle)) return true;
  if (/butter bean/i.test(itemText) && /milk|butter\b(?! bean)/i.test(prodTitle)) return true;
  if (/dark chocolate/i.test(itemText) && !/chocolate|cocoa/i.test(prodTitle)) return true;
  if (/stock cubes/i.test(itemText) && !/stock|cube|pot|broth|bouillon/i.test(prodTitle)) return true;

  return false;
}

describe('Step 13: Reality Baseline Offline Ratchet Suite', () => {
  it('should load reality-baseline.json and verify format invariants', () => {
    assert.ok(fs.existsSync(BASELINE_PATH), 'reality-baseline.json must exist');
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

    assert.equal(typeof baseline.measuredAt, 'string');
    assert.equal(baseline.sidecarUsed, true);
    assert.ok(Array.isArray(baseline.storesLive) && baseline.storesLive.length >= 3);
    assert.equal(baseline.totals.itemsParsed, 58);
    assert.equal(typeof baseline.totals.matchedCount, 'number');
    assert.equal(typeof baseline.totals.noMatchCount, 'number');
    assert.equal(baseline.totals.matchedCount + baseline.totals.noMatchCount, 58);

    assert.ok(baseline.bySource.direct > 0, 'Direct tier matches must be greater than 0');
    assert.equal(baseline.comparisonToCatalogOnly.catalogOnlyNoMatch, 28);
    assert.equal(typeof baseline.comparisonToCatalogOnly.directNoMatch, 'number');
    assert.equal(typeof (baseline.totals.suspectMatches ?? baseline.suspectMatches), 'number');
    assert.ok(Array.isArray(baseline.suspectItems));
  });

  it('should replay recorded reality fixtures offline and ratchet match counts', () => {
    const fixturePath = fs.existsSync(FIXTURES_PATH) ? FIXTURES_PATH : SAMPLE_PATH;
    assert.ok(fs.existsSync(fixturePath), 'reality-fixtures.json or reality-sample.json must exist');
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    assert.ok(fs.existsSync(REAL_LIST_PATH), 'real-list.json must exist');
    const REAL_52_LINES = JSON.parse(fs.readFileSync(REAL_LIST_PATH, 'utf8'));
    assert.equal(REAL_52_LINES.length, 52);

    for (const s of REAL_SENTINELS) {
      assert.ok(REAL_52_LINES.includes(s), `real-list.json missing verbatim sentinel: ${s}`);
    }

    const parsedItems = IngredientParser.parseList(REAL_52_LINES);
    assert.equal(parsedItems.length, 58);

    const preferences = getUserSettings();
    const stores = baseline.storesLive;
    const storeMatchesMap = {};
    for (const store of stores) {
      storeMatchesMap[store] = [];
    }

    let directCount = 0;
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const candidates = fixtures.items[i]?.products || [];
      let itemResolvedDirect = false;

      for (const store of stores) {
        const match = FuzzyMatcher.matchProduct(store, item, candidates, preferences);
        storeMatchesMap[store].push(match);

        if (match && match.product && match.product.source === 'direct') {
          itemResolvedDirect = true;
        }
      }

      if (itemResolvedDirect) {
        directCount++;
      }
    }

    const comparison = BasketCalculator.computeComparison(parsedItems, storeMatchesMap, stores);
    assert.ok(comparison && comparison.supermarkets, 'Comparison calculation must succeed');

    let matchedCount = 0;
    let noMatchCount = 0;

    for (let i = 0; i < parsedItems.length; i++) {
      let matched = false;
      for (const store of stores) {
        const m = storeMatchesMap[store][i];
        if (m && m.product) {
          matched = true;
          break;
        }
      }
      if (matched) matchedCount++;
      else noMatchCount++;
    }

    let suspectMatches = 0;
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      for (const store of stores) {
        const m = storeMatchesMap[store][i];
        if (m && m.product && isSuspectMatch(item, m.product)) {
          suspectMatches++;
        }
      }
    }

    // Ratchet assertions: match rate must never degrade, suspect matches must not increase
    assert.ok(
      noMatchCount <= baseline.totals.noMatchCount,
      `noMatchCount regressed! Got ${noMatchCount}, baseline allows at most ${baseline.totals.noMatchCount}`
    );
    assert.ok(
      matchedCount >= baseline.totals.matchedCount,
      `matchedCount regressed! Got ${matchedCount}, baseline requires at least ${baseline.totals.matchedCount}`
    );
    assert.ok(
      directCount >= baseline.bySource.direct,
      `direct resolution count regressed! Got ${directCount}, baseline requires at least ${baseline.bySource.direct}`
    );
    assert.ok(
      suspectMatches <= (baseline.totals.suspectMatches ?? baseline.suspectMatches ?? 0),
      `suspectMatches increased! Got ${suspectMatches}, baseline allows at most ${baseline.totals.suspectMatches}`
    );
  });
});
