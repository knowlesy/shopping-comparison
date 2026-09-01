import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IngredientParser } from './ingredientParser.js';
import { FuzzyMatcher } from './fuzzyMatcher.js';
import { BasketCalculator } from './basketCalculator.js';
import { getUserSettings } from '../routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../..');

const BASELINE_PATH = path.join(ROOT_DIR, 'tests/fixtures/reality-baseline.json');
const FIXTURES_PATH = path.join(ROOT_DIR, 'tests/fixtures/reality-fixtures.json');

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
  });

  it('should replay recorded reality fixtures offline and ratchet match counts', () => {
    assert.ok(fs.existsSync(FIXTURES_PATH), 'reality-fixtures.json must exist');
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));

    const REAL_52_LINES = [
      'Beef mince 5% 1.9 kg',
      'Walnuts 200 g',
      'Large eggs 17',
      'Semi-skimmed milk 4 pints',
      'Tinned sardines in olive oil 2 x 120 g',
      'Little gem lettuce 2-pack',
      'Celery 1 head',
      'Garlic 1 bulb',
      'Tomato paste 1 tube',
      'Potatoes 1.8kg',
      'Bananas 10',
      'Apples 250 g',
      'Hummus 200 g',
      'Sultanas 500 g',
      'Lasagne sheets 500 g',
      'Red peppers 4',
      'Red wine vinegar',
      'Frozen peas 1 kg',
      'Butter beans in water 2 x 400 g',
      'Smooth peanut butter 300 g',
      'Plums or pears 600 g',
      'Oregano, thyme, rosemary, basil, parsley, sage, mint',
      'Olive oil',
      'Carrots 1 kg',
      'Onions 1 kg',
      'Broccoli 500 g',
      'Cucumber 1',
      'Oranges 6',
      'Chicken breast fillets 1 kg',
      'Salmon fillets 4',
      'Frozen cod fillets 1.5 kg',
      'Greek yogurt 0% 1 kg',
      'Cheddar cheese 400 g',
      'Wholewheat fusilli 1 kg',
      'Basmati rice 1 kg',
      'Porridge oats 1 kg',
      'Red lentils 500 g',
      'Chia seeds 200 g',
      'Wholemeal bread 1 loaf',
      'Plain flour 1.5 kg',
      'Dark chocolate (adults only, 85%) 200 g',
      'Baby food pouches (infant) 4',
      'Chopped tomatoes 4 x 400 g',
      'Kidney beans 400 g',
      'Chickpeas 400 g',
      'Spinach 250 g',
      'Mushrooms 300 g',
      'Courgettes 500 g',
      'Lemons 4',
      'Vegetable stock cubes 8',
      'Fairy washing up liquid 433 ml',
      'Kitchen roll 2 pack'
    ];

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

    // Ratchet assertions: match rate must never degrade
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
  });
});
