import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Settings ownership: persistence across restart, full validation, and no partial writes.
 *
 * Each test runs against a fresh temporary DATA_DIR and a freshly imported copy of the
 * route, which is what "restart the API" means here: module state is discarded and the
 * only thing carried over is the file on disk.
 */

const { DEFAULT_FOOD_RATINGS } = await import('../../../../shared/foodTypes.js');

const UNIQUE_FAKE_KEY = `AIzaFAKE-test-key-${Date.now()}`;

// A developer .env (or a configured container) sets GEMINI_API_KEY, which makes the
// service report AI as externally configured. These tests decide that themselves.
const AI_ENV_VARS = ['GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY', 'ENABLE_GEMINI_MATCHING'];

let dataDir;
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(
    ['DATA_DIR', ...AI_ENV_VARS].map((k) => [k, process.env[k]])
  );
  for (const k of AI_ENV_VARS) delete process.env[k];

  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-settings-test-'));
  process.env.DATA_DIR = dataDir;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Start a fresh instance of the settings route, as a process restart would. */
async function startApi() {
  const mod = await import(`../routes/settings.js?restart=${Math.random()}`);
  const app = express();
  app.use(express.json());
  app.use('/api/settings', mod.settingsRouter);

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  return {
    mod,
    url: `http://127.0.0.1:${server.address().port}/api/settings`,
    stop: () =>
      new Promise((resolve) => {
        // Keep-alive sockets from fetch() would otherwise hold the event loop open and
        // the test runner would never exit.
        server.closeAllConnections?.();
        server.close(resolve);
      })
  };
}

const put = (url, body) =>
  fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

const settingsFile = () => path.join(dataDir, 'settings.json');

describe('Settings persistence across a restart', () => {
  it('retains non-secret settings and keeps defaults for everything else', async () => {
    const first = await startApi();
    const saved = await put(first.url, {
      fatPercentagePreference: 20,
      preferOrganic: true,
      enabledSupermarkets: ['tesco', 'aldi'],
      directStoreAdapters: { tesco: false },
      directScrapersEnabled: false,
      aiAssistLevel: 'economy',
      aiMaxCallsPerBasket: 3,
      aiStages: { select: false },
      enableMatchLog: true
    });
    assert.equal(saved.status, 200);
    await first.stop();

    assert.ok(fs.existsSync(settingsFile()), 'settings must reach disk, not just memory');

    const second = await startApi();
    const after = await (await fetch(second.url)).json();

    // A legacy fat preference from an older client lands as a mince rating.
    assert.deepEqual(after.foodRatings.mince, { fat20: 'love' });
    assert.equal(after.fatPercentagePreference, undefined, 'legacy keys are never written back');
    assert.equal(after.preferOrganic, true);
    assert.deepEqual(after.enabledSupermarkets, ['tesco', 'aldi']);
    assert.equal(after.directStoreAdapters.tesco, false);
    assert.equal(after.directScrapersEnabled, false);
    assert.equal(after.aiAssistLevel, 'economy');
    assert.equal(after.aiMaxCallsPerBasket, 3);
    assert.equal(after.aiStages.select, false);
    assert.equal(after.enableMatchLog, true);
    // Untouched nested keys keep their default rather than disappearing.
    assert.equal(after.directStoreAdapters.asda, true);
    // Untouched top-level settings keep their default.
    assert.equal(after.foodRatings.bread.wholemeal, 'love');
    assert.equal(after.packSizingPolicy, 'closest');
    await second.stop();
  });

  it('never persists the Gemini key, and says so in the safe response', async () => {
    const first = await startApi();
    const res = await put(first.url, { geminiApiKey: UNIQUE_FAKE_KEY, aiMatchingEnabled: true });
    assert.equal(res.status, 200);

    const safe = await res.json();
    assert.equal(safe.geminiApiKey, undefined, 'the safe response must not carry the key');
    assert.equal(safe.hasGeminiKey, true);
    assert.equal(safe.geminiKeySource, 'runtime');
    assert.match(safe.geminiKeyLifetime, /restart/i, 'the restart lifetime must be stated');

    // The key is usable in memory for this process...
    assert.equal(first.mod.getUserSettings().geminiApiKey, UNIQUE_FAKE_KEY);
    // ...but it is not on disk.
    const onDisk = fs.readFileSync(settingsFile(), 'utf8');
    assert.ok(!onDisk.includes(UNIQUE_FAKE_KEY), 'the key must never be written to disk');
    assert.equal(JSON.parse(onDisk).geminiApiKey, undefined);
    await first.stop();

    // ...and it is gone after a restart, which is exactly what the UI now promises.
    const second = await startApi();
    const after = await (await fetch(second.url)).json();
    assert.equal(second.mod.getUserSettings().geminiApiKey, '');
    assert.equal(after.geminiKeySource, 'none');
    await second.stop();
  });

  it('reports an environment-configured key as persistent, and does not store it either', async () => {
    process.env.GEMINI_API_KEY = `${UNIQUE_FAKE_KEY}-from-env`;

    const api = await startApi();
    const safe = await (await fetch(api.url)).json();

    assert.equal(safe.geminiKeySource, 'environment');
    assert.equal(safe.hasGeminiKey, true);
    assert.equal(safe.aiMatchingExternallyConfigured, true);
    assert.match(safe.geminiKeyLifetime, /persists across restarts/i);
    assert.equal(safe.geminiApiKey, undefined);

    // Saving anything must not copy the environment key into the persisted file.
    const res = await put(api.url, { preferOrganic: true });
    assert.equal(res.status, 200);
    const onDisk = fs.readFileSync(settingsFile(), 'utf8');
    assert.ok(!onDisk.includes(UNIQUE_FAKE_KEY), 'an environment key must never reach disk');
    await api.stop();
  });

  it('starts cleanly when the persisted file is corrupt, keeping the valid entries', async () => {
    fs.writeFileSync(
      settingsFile(),
      JSON.stringify({
        preferOrganic: true,
        fatPercentagePreference: 'not a number',
        enabledSupermarkets: ['tesco', 'not_a_shop'],
        brandTierPriority: 'premium'
      })
    );

    const api = await startApi();
    const settings = await (await fetch(api.url)).json();

    assert.equal(settings.preferOrganic, true, 'valid persisted values are kept');
    assert.equal(settings.brandTierPriority, 'premium');
    // The invalid legacy value falls back to the old default: 5% mince, loved.
    assert.deepEqual(settings.foodRatings.mince, { lean5: 'love' }, 'an invalid value falls back to its default');
    assert.deepEqual(
      settings.enabledSupermarkets,
      ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'],
      'an invalid list falls back to the default rather than being partly trusted'
    );
    await api.stop();
  });

  it('survives an unparseable file without throwing', async () => {
    fs.writeFileSync(settingsFile(), '{ this is not json');
    const api = await startApi();
    const settings = await (await fetch(api.url)).json();
    assert.deepEqual(settings.foodRatings, DEFAULT_FOOD_RATINGS);
    assert.deepEqual(settings.diet, []);
    await api.stop();
  });
});

describe('Settings validation', () => {
  const invalid = [
    ['fatPercentagePreference', 'twenty', /finite number/],
    // JSON has no Infinity: it arrives as null, which must be rejected just the same.
    ['fatPercentagePreference', Number.POSITIVE_INFINITY, /finite number/],
    ['fatPercentagePreference', -1, /between 0 and 100/],
    ['fatPercentagePreference', 101, /between 0 and 100/],
    ['healthierDefault', 'yes', /boolean/],
    ['brandTierPriority', 'deluxe', /one of/],
    ['packSizingPolicy', 42, /one of/],
    ['cutMatchingStrategy', 'whatever', /one of/],
    ['aiAssistLevel', 'nonsense', /one of/],
    ['aiMaxCallsPerBasket', -5, /between 0 and 500/],
    ['aiMaxCallsPerBasket', 2.5, /whole number/],
    ['enabledSupermarkets', ['not_a_shop'], /unknown supermarket/],
    ['enabledSupermarkets', [], /at least one/],
    ['enabledSupermarkets', 'tesco', /array/],
    ['directStoreAdapters', { unknown_shop: true }, /Unknown store in directStoreAdapters/],
    ['directStoreAdapters', { asda: 'false' }, /boolean/],
    ['aiStages', { teleport: true }, /Unknown stage in aiStages/],
    ['enableMatchLog', 'true', /boolean/],
    ['foodRatings', [], /must be an object/],
    ['foodRatings', { cake: { sponge: 'love' } }, /unknown category: cake/],
    ['foodRatings', { bread: { rye: 'love' } }, /unknown type: rye/],
    ['foodRatings', { bread: { white: 'ok' } }, /"love" or "never"/],
    ['diet', 'vegan', /array/],
    ['diet', ['keto'], /unknown diet: keto/],
    ['diet', ['vegan', 'vegan'], /repeat/]
  ];

  for (const [field, value, expected] of invalid) {
    it(`rejects ${field} = ${JSON.stringify(value)}`, async () => {
      const api = await startApi();
      const res = await put(api.url, { [field]: value });
      assert.equal(res.status, 400, `${field} must be rejected`);
      const body = await res.json();
      assert.match(body.error, expected);
      assert.equal(body.field, field);
      await api.stop();
    });
  }

  it('applies nothing when any field in the request is invalid', async () => {
    const api = await startApi();
    const before = await (await fetch(api.url)).json();

    const res = await put(api.url, {
      preferOrganic: true,
      foodRatings: { bread: { white: 'never' } },
      aiAssistLevel: 'nonsense'
    });
    assert.equal(res.status, 400);

    const after = await (await fetch(api.url)).json();
    assert.equal(after.preferOrganic, before.preferOrganic, 'no partial write');
    assert.deepEqual(after.foodRatings, before.foodRatings, 'no partial write');
    assert.ok(!fs.existsSync(settingsFile()), 'a rejected request must not touch disk');
    await api.stop();
  });

  it('ignores unknown keys instead of rejecting the whole request', async () => {
    const api = await startApi();
    const res = await put(api.url, { preferOrganic: true, somethingFromAnOlderClient: 'x' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.preferOrganic, true);
    assert.equal(body.somethingFromAnOlderClient, undefined);
    await api.stop();
  });

  it('reports a failed write as a failure rather than a successful save', async () => {
    const api = await startApi();

    // Make the data directory unwritable so the atomic write cannot complete.
    fs.chmodSync(dataDir, 0o500);
    try {
      const res = await put(api.url, { preferOrganic: true });
      assert.equal(res.status, 500, 'an unpersisted change must not return 200');
      const body = await res.json();
      assert.equal(body.persisted, false);
      assert.match(body.error, /not saved/i);

      // In-memory state is untouched, so a later read does not report the lost value.
      assert.equal(api.mod.getUserSettings().preferOrganic, false);
    } finally {
      fs.chmodSync(dataDir, 0o700);
      await api.stop();
    }
  });

  it('agrees with the comparison route about valid supermarket names', async () => {
    const { KNOWN_SUPERMARKETS } = await import('./supermarkets.js');
    const api = await startApi();

    const res = await put(api.url, { enabledSupermarkets: [...KNOWN_SUPERMARKETS] });
    assert.equal(res.status, 200, 'every name the comparison route accepts must be settable');
    await api.stop();
  });
});

describe('Legacy food settings conversion', () => {
  const LEGACY_KEYS = ['preferWholewheat', 'preferFreeRange', 'fatPercentagePreference'];

  it('reads the old flat keys from a file that has no food ratings', async () => {
    fs.writeFileSync(
      settingsFile(),
      JSON.stringify({
        healthierDefault: true,
        preferWholewheat: false,
        preferFreeRange: true,
        fatPercentagePreference: 12,
        preferOrganic: true
      })
    );

    const api = await startApi();
    try {
      const settings = await (await fetch(api.url)).json();
      assert.deepEqual(settings.foodRatings, {
        eggs: { free_range: 'love' },
        chicken: { free_range: 'love' },
        mince: { lean10: 'love' }
      });
      // preferOrganic stays a separate toggle.
      assert.equal(settings.preferOrganic, true);
      for (const key of LEGACY_KEYS) assert.equal(settings[key], undefined, `${key} is not served`);
    } finally {
      await api.stop();
    }
  });

  it('writes only the new keys on the next save', async () => {
    fs.writeFileSync(
      settingsFile(),
      JSON.stringify({ preferWholewheat: true, preferFreeRange: false, fatPercentagePreference: 20 })
    );

    const api = await startApi();
    try {
      const res = await put(api.url, { includeDeals: false });
      assert.equal(res.status, 200);
    } finally {
      await api.stop();
    }

    const onDisk = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    for (const key of LEGACY_KEYS) assert.equal(onDisk[key], undefined, `${key} must not be written`);
    assert.deepEqual(onDisk.foodRatings, { bread: { wholemeal: 'love' }, mince: { fat20: 'love' } });
  });

  it('drops the mince rating when the old healthier default was off, as the old rule did', async () => {
    fs.writeFileSync(
      settingsFile(),
      JSON.stringify({ healthierDefault: false, preferWholewheat: false, preferFreeRange: false, fatPercentagePreference: 5 })
    );
    const api = await startApi();
    try {
      const settings = await (await fetch(api.url)).json();
      assert.deepEqual(settings.foodRatings, {});
    } finally {
      await api.stop();
    }
  });

  it('prefers food ratings over legacy keys when a file has both', async () => {
    fs.writeFileSync(
      settingsFile(),
      JSON.stringify({ preferWholewheat: true, foodRatings: { bread: { white: 'never' } } })
    );
    const api = await startApi();
    try {
      const settings = await (await fetch(api.url)).json();
      assert.deepEqual(settings.foodRatings, { bread: { white: 'never' } });
    } finally {
      await api.stop();
    }
  });

  it('folds a legacy key from an older client into the current ratings', async () => {
    const api = await startApi();
    try {
      await put(api.url, { foodRatings: { bread: { white: 'never' }, eggs: { free_range: 'love' } } });
      const res = await put(api.url, { preferFreeRange: false, preferWholewheat: true });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.foodRatings, { bread: { white: 'never', wholemeal: 'love' } });
      assert.equal(body.preferFreeRange, undefined);
    } finally {
      await api.stop();
    }
  });

  it('lets explicit food ratings win over legacy keys in the same request', async () => {
    const api = await startApi();
    try {
      const res = await put(api.url, { preferWholewheat: true, foodRatings: { milk: { semi: 'love' } } });
      assert.equal(res.status, 200);
      assert.deepEqual((await res.json()).foodRatings, { milk: { semi: 'love' } });
    } finally {
      await api.stop();
    }
  });

  it('round-trips a diet and a cleared rating', async () => {
    const api = await startApi();
    try {
      const res = await put(api.url, { diet: ['vegetarian', 'gluten_free'], foodRatings: {} });
      assert.equal(res.status, 200);
    } finally {
      await api.stop();
    }
    const again = await startApi();
    try {
      const settings = await (await fetch(again.url)).json();
      assert.deepEqual(settings.diet, ['vegetarian', 'gluten_free']);
      assert.deepEqual(settings.foodRatings, {}, 'an empty object means every type is OK, not "use defaults"');
    } finally {
      await again.stop();
    }
  });
});
