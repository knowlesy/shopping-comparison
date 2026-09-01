/**
 * INFV (Individual Native Fetch & Verification) gate — executable definition-of-done
 * for docs/research/infv-context.md (direct per-store supermarket adapters).
 *
 * Run: npm run verify:infv   (node scripts/verify-infv.js [--step N])
 *
 * Same contract as scripts/verify-audit6.js: an implementing agent must NOT mark a
 * step complete until its gate passes. Checks are behavioral where the code is Node
 * and reachable offline; structural (file/contract presence) where behavior requires
 * the Python sidecar or live network. Exit non-zero while any gate fails.
 *
 * NEVER edit this file to make a gate pass. Disputes go in GATE-DISPUTES.md.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const r = (...p) => path.join(ROOT, ...p);
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const readAll = (dir, ext = '') => {
  const d = r(dir);
  if (!fs.existsSync(d)) return '';
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(ext))
    .map((f) => read(path.join(d, f)))
    .join('\n');
};

const onlyStep = (() => {
  const i = process.argv.indexOf('--step');
  return i > -1 ? Number(process.argv[i + 1]) : null;
})();

const results = [];
const pending = [];
function check(step, name, fn) {
  if (onlyStep !== null && step !== onlyStep) return;
  pending.push(
    Promise.resolve()
      .then(fn)
      .then((detail) => results.push({ step, name, ok: true, detail: detail || '' }))
      .catch((err) => results.push({ step, name, ok: false, detail: err.message }))
  );
}
const fail = (msg) => {
  throw new Error(msg);
};
const svc = (f) => import(r('services/logic-api/src/services', f));

const DIRECT_STORES = ['tesco', 'sainsburys', 'asda', 'morrisons', 'iceland'];

// ---------------------------------------------------------------------------
// Step 1 — Confidence re-tiering: direct 0.90, aggregator 0.60, catalog 0.40
// ---------------------------------------------------------------------------
check(1, 'formatConfidence supports a "direct" source with a store-named label', async () => {
  const { formatConfidence } = await svc('confidence.js');
  const out = formatConfidence(0.9, 'direct');
  if (out.confidenceSource !== 'direct') fail(`confidenceSource=${out.confidenceSource}`);
  if (!/90%/.test(out.confidence)) fail(`label lacks 90%: "${out.confidence}"`);
  if (/aggregator/i.test(out.confidence)) fail(`direct label says "aggregator": "${out.confidence}"`);
});

check(1, 'Aggregator (trolley) confidence lowered to 0.60, catalog stays 0.40', () => {
  const dom = read(r('services/logic-api/src/services/domParser.js'));
  if (/formatConfidence\(\s*0\.8\s*,\s*['"]aggregator/.test(dom)) {
    fail('domParser still emits 0.8 for aggregator — trolley must be 0.60');
  }
  if (!/formatConfidence\(\s*0\.6\s*,\s*['"]aggregator/.test(dom)) {
    fail('domParser does not emit 0.60 for aggregator matches');
  }
  const fm = read(r('services/logic-api/src/services/fuzzyMatcher.js'));
  if (!/formatConfidence\(\s*0\.4\s*,\s*['"]catalog/.test(fm)) {
    fail('catalog confidence is no longer 0.40 in fuzzyMatcher');
  }
});

check(1, 'DEFAULT_CONFIDENCE map is single-sourced (no magic numbers scattered)', async () => {
  const mod = await svc('confidence.js');
  const map = mod.CONFIDENCE_BY_SOURCE || mod.DEFAULT_CONFIDENCE;
  if (!map) fail('confidence.js exports no CONFIDENCE_BY_SOURCE/DEFAULT_CONFIDENCE map');
  if (map.direct !== 0.9) fail(`direct=${map.direct}, expected 0.9`);
  if (map.aggregator !== 0.6) fail(`aggregator=${map.aggregator}, expected 0.6`);
  if (map.catalog !== 0.4) fail(`catalog=${map.catalog}, expected 0.4`);
});

check(1, 'Client renders a distinct badge for direct-sourced matches', () => {
  const ui = readAll('client/src/components', '.tsx');
  if (!/'direct'|"direct"/.test(ui)) fail('no client component branches on confidenceSource "direct"');
});

// ---------------------------------------------------------------------------
// Step 2 — Settings: master + per-store direct adapter toggles
// ---------------------------------------------------------------------------
check(2, 'Settings defaults expose directScrapersEnabled + per-store directStoreAdapters', async () => {
  const mod = await import(r('services/logic-api/src/routes/settings.js'));
  const s = mod.getSafeUserSettings ? mod.getSafeUserSettings() : mod.getUserSettings();
  if (typeof s.directScrapersEnabled !== 'boolean') fail('directScrapersEnabled missing from settings');
  if (!s.directStoreAdapters || typeof s.directStoreAdapters !== 'object') {
    fail('directStoreAdapters map missing from settings');
  }
  for (const store of DIRECT_STORES) {
    if (typeof s.directStoreAdapters[store] !== 'boolean') {
      fail(`directStoreAdapters.${store} missing`);
    }
  }
});

check(2, 'Both keys are in the PUT allowlist and survive a round-trip', () => {
  const src = read(r('services/logic-api/src/routes/settings.js'));
  if (!/'directScrapersEnabled'/.test(src)) fail('directScrapersEnabled not in PUT allowlist');
  if (!/'directStoreAdapters'/.test(src)) fail('directStoreAdapters not in PUT allowlist');
});

check(2, 'SettingsModal has a direct-scraper section with per-store toggles', () => {
  const modal = read(r('client/src/components/SettingsModal.tsx'));
  if (!/directScrapersEnabled/.test(modal)) fail('SettingsModal has no directScrapersEnabled control');
  if (!/directStoreAdapters/.test(modal)) fail('SettingsModal has no per-store directStoreAdapters toggles');
});

// ---------------------------------------------------------------------------
// Step 3 — Python sidecar skeleton (store-fetcher)
// ---------------------------------------------------------------------------
check(3, 'services/store-fetcher exists with FastAPI server, pinned deps, Dockerfile', () => {
  const base = 'services/store-fetcher';
  for (const f of ['server.py', 'requirements.txt', 'Dockerfile']) {
    if (!fs.existsSync(r(base, f))) fail(`${base}/${f} missing`);
  }
  const reqs = read(r(base, 'requirements.txt'));
  for (const dep of ['curl_cffi', 'camoufox', 'fastapi']) {
    if (!new RegExp(dep.replace('_', '[_-]'), 'i').test(reqs)) fail(`requirements.txt lacks ${dep}`);
  }
  if (!/[=~>]=\s*\d/.test(reqs)) fail('requirements.txt has no pinned versions');
});

check(3, 'Sidecar enforces the shared-secret token and exposes /health + /search', () => {
  const src = read(r('services/store-fetcher/server.py'));
  if (!/health/.test(src)) fail('no /health endpoint');
  if (!/search/.test(src)) fail('no /search endpoint');
  if (!/FETCHER_TOKEN|SCRAPE_TOKEN/.test(src)) fail('no shared-secret token check');
  if (!/compare_digest|constant.?time/i.test(src)) fail('token comparison is not timing-safe');
});

check(3, 'Sidecar wired into docker-compose and k3s, never published to the host', () => {
  const compose = read(r('docker-compose.yml'));
  if (!/store-fetcher/.test(compose)) fail('store-fetcher not in docker-compose.yml');
  const svcBlock = compose.split(/^\s{2}\S+:/m).find((b) => /store-fetcher|STORE_FETCHER/.test(b)) || '';
  if (/^\s*ports:/m.test(svcBlock)) fail('store-fetcher publishes ports to the host — keep it internal-only');
  const k3s = readAll('deploy/k3s', '.yaml');
  if (!/store-fetcher/.test(k3s)) fail('no k3s manifest references store-fetcher');
});

// ---------------------------------------------------------------------------
// Step 4 — Node client + direct tier in the candidate pipeline
// ---------------------------------------------------------------------------
check(4, 'storeFetcherClient exists and is used by candidatePipeline ahead of trolley', () => {
  if (!fs.existsSync(r('services/logic-api/src/services/storeFetcherClient.js'))) {
    fail('services/logic-api/src/services/storeFetcherClient.js missing');
  }
  const pipe = read(r('services/logic-api/src/services/candidatePipeline.js'));
  if (!/StoreFetcherClient|storeFetcherClient/.test(pipe)) fail('candidatePipeline does not use the direct client');
  const directIdx = pipe.search(/StoreFetcherClient|storeFetcherClient/);
  const trolleyIdx = pipe.search(/trolley\.co\.uk/);
  if (trolleyIdx > -1 && directIdx > trolleyIdx) fail('trolley is attempted before the direct tier');
});

check(4, 'Pipeline reports a direct source and degrades gracefully when the sidecar is down', async () => {
  const pipe = read(r('services/logic-api/src/services/candidatePipeline.js'));
  if (!/['"]direct['"]/.test(pipe)) fail("pipeline never yields source 'direct'");
  const { getOrFetchCandidatesWithSource } = await import(
    r('services/logic-api/src/services/candidatePipeline.js')
  );
  // Sidecar is not running during the gate: must fall back, not throw.
  const res = await getOrFetchCandidatesWithSource('semi skimmed milk', {
    enabledStores: ['tesco'],
    timeoutMs: 2000,
    preferences: { directScrapersEnabled: true, directStoreAdapters: { tesco: true } }
  });
  if (!res || !res.source) fail('pipeline returned no source');
  if (res.source === 'direct') fail('claims direct source with no sidecar running');
});

check(4, 'Compare meta counts direct alongside live/cache/catalog', () => {
  const compare = read(r('services/logic-api/src/routes/compare.js'));
  if (!/direct/.test(compare)) fail('routes/compare.js does not track a direct source count');
});

// ---------------------------------------------------------------------------
// Step 5 — Adapter contract, normalizer, and the record/replay lab
// ---------------------------------------------------------------------------
check(5, 'Adapter base contract defines search/normalize and a declared capability set', () => {
  const base = read(r('services/store-fetcher/adapters/base.py'));
  if (!base) fail('services/store-fetcher/adapters/base.py missing');
  for (const sym of ['search', 'normalize', 'capabilities']) {
    if (!new RegExp(`def\\s+${sym}|${sym}\\s*[:=]`).test(base)) fail(`base adapter lacks "${sym}"`);
  }
});

check(5, 'Unified product schema is single-sourced and version-stamped', () => {
  const schema = read(r('services/store-fetcher/schema.py')) || read(r('data/store-product-schema.json'));
  if (!schema) fail('no unified product schema (services/store-fetcher/schema.py or data/store-product-schema.json)');
  for (const field of ['price', 'unitPrice', 'packageSize', 'supermarket', 'title']) {
    if (!new RegExp(field, 'i').test(schema)) fail(`schema lacks "${field}"`);
  }
  if (!/schemaVersion|SCHEMA_VERSION/i.test(schema)) fail('schema is not version-stamped');
});

check(5, 'Lab CLI exists, is manual-only, and records fixtures', () => {
  const labDir = r('scripts/scraper-lab');
  if (!fs.existsSync(labDir)) fail('scripts/scraper-lab/ missing');
  const lab = readAll('scripts/scraper-lab', '.js');
  if (!/record/i.test(lab)) fail('lab has no fixture recording mode');
  const pkg = JSON.parse(read(r('package.json')));
  const scripts = pkg.scripts || {};
  if (!Object.keys(scripts).some((k) => k.startsWith('lab:'))) fail('no lab:* npm scripts');
  const ci = readAll('.github/workflows', '.yml') + readAll('.github/workflows', '.yaml');
  if (/scraper-lab|lab:probe|lab:record/.test(ci)) fail('lab is wired into CI — it must stay manual/offline-safe');
});

check(5, 'Recorded payload fixtures replay offline inside npm test', () => {
  if (!fs.existsSync(r('tests/fixtures/store-payloads'))) fail('tests/fixtures/store-payloads/ missing');
  const tests = readAll('services/logic-api/src/services', '.test.js');
  if (!/store-payloads/.test(tests)) fail('no unit test replays recorded store payloads');
});

check(5, 'lab:record stamps machine-checkable provenance onto every fixture', () => {
  const lab = readAll('scripts/scraper-lab', '.js');
  if (!/_provenance|provenance/i.test(lab)) fail('lab does not write a provenance block');
  for (const field of ['recordedAt', 'requestUrl', 'httpStatus']) {
    if (!new RegExp(field, 'i').test(lab)) fail(`lab provenance lacks "${field}"`);
  }
  if (!/scrub|redact|sanitiz/i.test(lab)) fail('lab does not scrub cookies/tokens before saving');
});

check(5, 'Lab maintains an honest per-store reachability report', () => {
  const lab = readAll('scripts/scraper-lab', '.js');
  if (!/_reachability|reachability/i.test(lab)) {
    fail('lab does not write tests/fixtures/store-payloads/_reachability.json');
  }
});

// Shared provenance validator for adapter fixtures (Steps 6 & 7).
// A fixture that never came from a real request cannot satisfy this without
// deliberate fabrication — which is an explicit task failure, not a shortcut.
function assertRealFixture(store) {
  const dir = r('tests/fixtures/store-payloads');
  if (!fs.existsSync(dir)) fail('tests/fixtures/store-payloads/ missing');
  const files = fs.readdirSync(dir).filter((f) => new RegExp(store, 'i').test(f) && f.endsWith('.json'));
  if (files.length === 0) fail(`no recorded payload fixture for ${store}`);

  let anyValid = false;
  const problems = [];
  for (const f of files) {
    let parsed;
    try {
      parsed = JSON.parse(read(path.join(dir, f)));
    } catch {
      problems.push(`${f}: not valid JSON`);
      continue;
    }
    const prov = parsed._provenance || parsed.provenance;
    if (!prov) {
      problems.push(`${f}: no _provenance block`);
      continue;
    }
    if (!prov.recordedAt || Number.isNaN(Date.parse(prov.recordedAt))) {
      problems.push(`${f}: _provenance.recordedAt missing/unparseable`);
      continue;
    }
    if (!prov.requestUrl || !/^https?:\/\//.test(prov.requestUrl)) {
      problems.push(`${f}: _provenance.requestUrl is not a real URL`);
      continue;
    }
    if (prov.httpStatus !== 200) {
      problems.push(`${f}: _provenance.httpStatus=${prov.httpStatus} (a recorded success must be 200)`);
      continue;
    }
    const payload = JSON.stringify(parsed.payload ?? parsed.body ?? parsed);
    if (payload.length < 2000) {
      problems.push(`${f}: payload is ${payload.length} bytes — too small to be a real search response`);
      continue;
    }
    if (/cookie|set-cookie|authorization|bearer /i.test(payload)) {
      problems.push(`${f}: payload still contains session/auth material — scrub before committing`);
      continue;
    }
    anyValid = true;
  }
  if (!anyValid) fail(`no fixture for ${store} carries valid provenance:\n          ${problems.join('\n          ')}`);
}

function assertReachabilityDeclared(store) {
  const file = r('tests/fixtures/store-payloads/_reachability.json');
  if (!fs.existsSync(file)) fail('tests/fixtures/store-payloads/_reachability.json missing');
  let report;
  try {
    report = JSON.parse(read(file));
  } catch {
    fail('_reachability.json is not valid JSON');
  }
  const entry = (report.stores || report)[store];
  if (!entry) fail(`_reachability.json has no entry for ${store}`);
  const status = entry.status || entry.state;
  if (!['reachable', 'unreachable', 'unsupported'].includes(status)) {
    fail(`${store}: status "${status}" is not one of reachable/unreachable/unsupported`);
  }
  if (!entry.checkedAt || Number.isNaN(Date.parse(entry.checkedAt))) {
    fail(`${store}: checkedAt missing/unparseable`);
  }
  if (status !== 'reachable' && !entry.evidence && !entry.reason) {
    fail(`${store}: declared "${status}" with no evidence/reason — an honest negative still needs proof`);
  }
  // A store may only be written off as unreachable if it was tested with the client
  // this project actually ships: TLS-impersonating curl_cffi via the sidecar. A 403
  // against plain node/undici fetch proves nothing except that plain fetch is blocked —
  // which research.md states as a given, and is the entire reason the sidecar exists.
  // "Reachable" must mean "structured product data was extracted", not "the server
  // returned 200". Retailer HTML search pages return 200 for consent walls, challenge
  // interstitials and empty shells — none of which are usable.
  if (status === 'reachable') {
    if (typeof entry.productsFound !== 'number') {
      fail(`${store}: declared reachable without a numeric "productsFound" — HTTP 200 alone does not prove usable data (consent/challenge pages also return 200)`);
    }
    if (entry.productsFound <= 0) {
      fail(`${store}: declared reachable but productsFound=${entry.productsFound} — that is not reachable, it is a 200 with no products`);
    }
  }
  if (status === 'unreachable') {
    const client = String(entry.client || entry.via || '');
    if (!client) {
      fail(`${store}: declared unreachable with no "client" field — record which HTTP client was used`);
    }
    if (/^(node|undici|fetch|axios|got|plain)/i.test(client) || !/impersonat|curl_cffi|camoufox|sidecar|store-fetcher/i.test(client)) {
      fail(`${store}: declared unreachable using client "${client}" — a non-impersonating client cannot establish this. Re-probe through the sidecar (curl_cffi impersonation) before writing the store off.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Step 6 — Tesco reference adapter
// ---------------------------------------------------------------------------
check(6, 'Tesco adapter implements the contract against the documented GraphQL gateway', () => {
  const src = read(r('services/store-fetcher/adapters/tesco.py'));
  if (!src) fail('services/store-fetcher/adapters/tesco.py missing');
  if (!/xapi\.tesco\.com|graphql/i.test(src)) fail('tesco adapter does not target the documented gateway');
  if (!/x-apikey/i.test(src)) fail('tesco adapter does not send the public x-apikey header');
  if (!/impersonate|curl_cffi/.test(src)) fail('tesco adapter does not use TLS impersonation');
});

check(6, 'Tesco normalization is proven offline against a recorded payload', () => {
  const rf = r('tests/fixtures/store-payloads/_reachability.json');
  if (fs.existsSync(rf)) {
    const report = JSON.parse(read(rf));
    const entry = (report.stores || report).tesco || {};
    if ((entry.status || entry.state) !== 'reachable') {
      return `tesco declared ${entry.status || 'unknown'} — no normalization test required`;
    }
  }
  const files = [
    ...fs.readdirSync(r('services/logic-api/src/services')).filter((f) => f.endsWith('.test.js'))
      .map((f) => read(r('services/logic-api/src/services', f))),
    ...(fs.existsSync(r('tests')) ? fs.readdirSync(r('tests')).filter((f) => f.endsWith('.js'))
      .map((f) => read(r('tests', f))) : [])
  ];
  const hit = files.find((src) => /store-payloads/.test(src) && /tesco/i.test(src) && /normaliz/i.test(src));
  if (!hit) fail('no offline test loads a tesco store-payload fixture and asserts normalization');
});

check(6, 'Tesco fixture carries real provenance and Tesco reachability is declared', () => {
  assertReachabilityDeclared('tesco');
  const report = JSON.parse(read(r('tests/fixtures/store-payloads/_reachability.json')));
  const entry = (report.stores || report).tesco;
  const status = entry.status || entry.state;
  // Only a store proven reachable owes a fixture. A store honestly declared
  // unreachable (with an impersonating client, per assertReachabilityDeclared)
  // must NOT have one invented for it.
  if (status !== 'reachable') return `tesco declared ${status} — no fixture required`;
  assertRealFixture('tesco');
  return '';
});

// ---------------------------------------------------------------------------
// Step 7 — Remaining adapters
// ---------------------------------------------------------------------------
check(7, 'Adapters exist for Sainsbury’s, Asda, Morrisons, Iceland with recorded fixtures', () => {
  const missing = [];
  for (const store of ['sainsburys', 'asda', 'morrisons', 'iceland']) {
    if (!fs.existsSync(r('services/store-fetcher/adapters', `${store}.py`))) missing.push(`${store}.py`);
  }
  if (missing.length) fail(`missing adapters: ${missing.join(', ')}`);
  const notes = [];
  for (const store of ['sainsburys', 'asda', 'morrisons', 'iceland']) {
    assertReachabilityDeclared(store);
    const report = JSON.parse(read(r('tests/fixtures/store-payloads/_reachability.json')));
    const entry = (report.stores || report)[store];
    const status = entry.status || entry.state;
    // A store honestly declared unreachable needs no fixture — but it must be
    // declared with evidence, which assertReachabilityDeclared already enforced.
    if (status === 'reachable') assertRealFixture(store);
    else notes.push(`${store}=${status}`);
  }
  return notes.length ? `declared non-reachable: ${notes.join(', ')}` : '';
});

check(7, 'Aldi/Lidl are explicitly declared unavailable for direct fetch, not silently missing', () => {
  const registry =
    read(r('services/store-fetcher/adapters/__init__.py')) +
    read(r('services/store-fetcher/registry.py')) +
    read(r('data/store-adapters.json'));
  if (!/aldi/i.test(registry) || !/lidl/i.test(registry)) {
    fail('aldi/lidl not declared in the adapter registry (must be present and marked unsupported)');
  }
  if (!/unsupported|no_online_grocery|unavailable|estimated/i.test(registry)) {
    fail('aldi/lidl are not marked with an explicit unsupported/estimated reason');
  }
});

// ---------------------------------------------------------------------------
// Step 8 — Politeness engine: throttling, backoff, circuit breaker, caps
// ---------------------------------------------------------------------------
check(8, 'Rate limiter implements randomized inter-request delay and jittered backoff', () => {
  const src =
    read(r('services/store-fetcher/politeness.py')) + read(r('services/store-fetcher/rate_limiter.py'));
  if (!src) fail('no politeness/rate_limiter module in services/store-fetcher/');
  if (!/gauss|normalvariate|jitter/i.test(src)) fail('no randomized (Gaussian/jittered) delay');
  if (!/429/.test(src)) fail('429 handling absent');
  if (!/retry.?after/i.test(src)) fail('Retry-After header is not honoured');
  if (!/2\s*\*\*|pow\(2|exponential/i.test(src)) fail('no exponential backoff');
});

check(8, 'Per-store circuit breaker and a hard daily request cap exist', () => {
  const src =
    read(r('services/store-fetcher/politeness.py')) +
    read(r('services/store-fetcher/rate_limiter.py')) +
    read(r('services/store-fetcher/server.py'));
  if (!/circuit|breaker/i.test(src)) fail('no circuit breaker');
  if (!/daily|per_day|DAILY_CAP|MAX_REQUESTS/i.test(src)) fail('no daily request cap');
});

check(8, 'Proxy layer is a configurable interface, unset by default (home residential)', () => {
  const src = readAll('services/store-fetcher', '.py');
  if (!/proxy/i.test(src)) fail('no proxy interface in the sidecar');
  const compose = read(r('docker-compose.yml'));
  if (!/PROXY/i.test(compose)) fail('no PROXY_* env wiring in docker-compose.yml');
  if (/PROXY_URL\s*=\s*https?:\/\//i.test(compose)) fail('a proxy is hardcoded — it must default to unset');
});

check(8, 'Tier 3 managed unblocker is opt-in and disabled by default', () => {
  const src = readAll('services/store-fetcher', '.py');
  if (!/tier.?3|unblocker|managed/i.test(src)) fail('no Tier 3 escalation path defined');
  if (!/false|disabled|off|None/i.test(src)) fail('Tier 3 has no explicit disabled-by-default state');
});

// ---------------------------------------------------------------------------
// Step 9 — Size-variant fan-out and the cheapest-route optimizer (the 900g problem)
// ---------------------------------------------------------------------------
check(9, 'Variant optimizer picks the cheapest route to a target across pack sizes', async () => {
  const mod = await svc('variantOptimizer.js').catch(() => null);
  if (!mod) fail('services/logic-api/src/services/variantOptimizer.js missing');
  const optimize = mod.VariantOptimizer?.optimize || mod.optimize;
  if (!optimize) fail('no VariantOptimizer.optimize export');

  // 900g mince: 1kg @ £6.00 vs 2x500g @ £2.60 each (£5.20) vs 750g @ £5.00
  const variants = [
    { id: 'a', title: 'Beef Mince 250g', packageSize: 250, packageUnit: 'g', price: 1.6 },
    { id: 'b', title: 'Beef Mince 500g', packageSize: 500, packageUnit: 'g', price: 2.6 },
    { id: 'c', title: 'Beef Mince 750g', packageSize: 750, packageUnit: 'g', price: 5.0 },
    { id: 'd', title: 'Beef Mince 1kg', packageSize: 1, packageUnit: 'kg', price: 6.0 }
  ];
  const item = { name: 'beef mince', targetQuantity: 900, unit: 'g' };

  const cover = optimize(variants, item, { packSizingPolicy: 'cover', includeDeals: false });
  if (!cover || !cover.totalQuantity) fail('optimizer returned no result for policy "cover"');
  if (cover.totalQuantity < 900) fail(`policy "cover" under-delivered: ${cover.totalQuantity}g`);
  if (cover.totalPrice > 5.2 + 0.001) {
    fail(`policy "cover" not cheapest: £${cover.totalPrice} (2x500g = £5.20 covers 900g)`);
  }
  const closest = optimize(variants, item, { packSizingPolicy: 'closest', includeDeals: false });
  if (!closest || !closest.totalQuantity) fail('optimizer returned no result for policy "closest"');
});

check(9, 'Optimizer factors deals into the cheapest route, and raw mode ignores them', async () => {
  const mod = await svc('variantOptimizer.js').catch(() => null);
  if (!mod) fail('variantOptimizer.js missing');
  const optimize = mod.VariantOptimizer?.optimize || mod.optimize;
  const variants = [
    { id: 'b', title: 'Beef Mince 500g', packageSize: 500, packageUnit: 'g', price: 3.5, deal: '2 for £5' },
    { id: 'd', title: 'Beef Mince 1kg', packageSize: 1, packageUnit: 'kg', price: 6.0 }
  ];
  const item = { name: 'beef mince', targetQuantity: 900, unit: 'g' };
  const withDeals = optimize(variants, item, { packSizingPolicy: 'cover', includeDeals: true });
  const rawOnly = optimize(variants, item, { packSizingPolicy: 'cover', includeDeals: false });
  if (!(withDeals.totalPrice < rawOnly.totalPrice)) {
    fail(`deal ignored: withDeals=£${withDeals.totalPrice} rawOnly=£${rawOnly.totalPrice}`);
  }
  if (Math.abs(withDeals.totalPrice - 5.0) > 0.005) {
    fail(`expected the 2-for-£5 route (£5.00), got £${withDeals.totalPrice}`);
  }
});

check(9, 'Mixed pack sizes are opt-in, and the chosen route is explained to the user', async () => {
  const mod = await svc('variantOptimizer.js').catch(() => null);
  if (!mod) fail('variantOptimizer.js missing');
  const optimize = mod.VariantOptimizer?.optimize || mod.optimize;
  const variants = [
    { id: 'a', title: 'Mince 250g', packageSize: 250, packageUnit: 'g', price: 1.0 },
    { id: 'b', title: 'Mince 500g', packageSize: 500, packageUnit: 'g', price: 2.4 }
  ];
  const item = { name: 'mince', targetQuantity: 750, unit: 'g' };
  const single = optimize(variants, item, { packSizingPolicy: 'cover', allowMixedPackSizes: false });
  if (!single || !Array.isArray(single.lines)) fail('result has no explanatory "lines" breakdown');
  if (single.lines.length !== 1) fail(`mixed sizes used while allowMixedPackSizes=false (${single.lines.length} lines)`);
  const mixed = optimize(variants, item, { packSizingPolicy: 'cover', allowMixedPackSizes: true });
  if (!mixed || !mixed.lines) fail('mixed mode returned no lines');
  if (!(mixed.totalPrice <= single.totalPrice)) fail('mixed mode is not at least as cheap as single-variant');
});

check(9, 'variantOptimizer is actually WIRED INTO the runtime matching path, not dead code', async () => {
  // A module that only its own tests import is not a feature. Require a real
  // runtime importer, then prove the matcher's output carries the optimizer's route.
  const runtimeDir = r('services/logic-api/src');
  const importers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js') && e.name !== 'variantOptimizer.js') {
        if (/variantOptimizer/.test(read(p))) importers.push(path.relative(runtimeDir, p));
      }
    }
  };
  walk(runtimeDir);
  if (importers.length === 0) {
    fail('nothing in services/logic-api/src imports variantOptimizer.js — the 900g optimizer never runs in the app');
  }

  const { FuzzyMatcher } = await svc('fuzzyMatcher.js');
  const variants = [
    { id: 'v500', supermarket: 'tesco', title: 'Tesco Beef Mince 500g', category: 'meat', packageSize: 500, packageUnit: 'g', packageDisplay: '500g', price: 2.6, unitPrice: 5.2 },
    { id: 'v1k', supermarket: 'tesco', title: 'Tesco Beef Mince 1kg', category: 'meat', packageSize: 1, packageUnit: 'kg', packageDisplay: '1kg', price: 6.0, unitPrice: 6.0 }
  ];
  const item = { name: 'beef mince', baseItem: 'beef mince', category: 'meat', targetQuantity: 900, unit: 'g' };
  const m = FuzzyMatcher.matchProduct('tesco', item, variants, { packSizingPolicy: 'cover', includeDeals: false });
  if (!m || !m.product) fail('matcher returned no match for a multi-variant candidate set');
  const hasRoute = Array.isArray(m.lines) || Array.isArray(m.variantRoute) || typeof m.routeExplanation === 'string' || typeof m.explanation === 'string';
  if (!hasRoute) {
    fail(`match result carries no optimizer route (lines/explanation) — matcher is not using variantOptimizer (importers found: ${importers.join(', ')})`);
  }
  return `wired via: ${importers.join(', ')}`;
});

check(9, 'Fan-out asks the adapter for size variants, and the setting is user-facing', async () => {
  const pipe = read(r('services/logic-api/src/services/candidatePipeline.js'));
  if (!/variant/i.test(pipe)) fail('pipeline does not request/collect size variants');
  const mod = await import(r('services/logic-api/src/routes/settings.js'));
  const s = mod.getSafeUserSettings();
  if (typeof s.allowMixedPackSizes !== 'boolean') fail('allowMixedPackSizes missing from settings');
  const modal = read(r('client/src/components/SettingsModal.tsx'));
  if (!/allowMixedPackSizes/.test(modal)) fail('SettingsModal has no allowMixedPackSizes control');
});

// ---------------------------------------------------------------------------
// Step 10 — AI lookup orchestration + extended eval
// ---------------------------------------------------------------------------
check(10, 'A query strategist proposes store-specific search terms and is AI-optional', async () => {
  const mod = await svc('queryStrategist.js').catch(() => null);
  if (!mod) fail('services/logic-api/src/services/queryStrategist.js missing');
  const Strat = mod.QueryStrategist || mod.default;
  if (!Strat) fail('no QueryStrategist export');
  const item = { name: 'beef mince', baseItem: 'beef mince', targetQuantity: 900, unit: 'g', fatPercentage: 5 };
  const plan = await (Strat.plan || Strat.buildPlan)(item, { supermarket: 'tesco', aiMatchingEnabled: false });
  if (!plan) fail('strategist returned nothing with AI disabled');
  const terms = plan.queries || plan.terms || plan;
  if (!Array.isArray(terms) || terms.length === 0) fail('strategist produced no query terms offline');
});

check(10, 'queryStrategist is WIRED INTO the runtime lookup path, not only the eval script', () => {
  const runtimeDir = r('services/logic-api/src');
  const importers = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js') && e.name !== 'queryStrategist.js') {
        if (/queryStrategist/.test(read(p))) importers.push(path.relative(runtimeDir, p));
      }
    }
  };
  walk(runtimeDir);
  if (importers.length === 0) {
    fail('nothing in services/logic-api/src imports queryStrategist.js — it runs only in the eval harness, never for a real lookup');
  }
  return `wired via: ${importers.join(', ')}`;
});

check(10, 'AI lookup selection is evaluated by the existing harness with direct-tier fixtures', () => {
  const evalSrc = read(r('scripts/eval-ai-matching.js'));
  if (!/queryStrategist|QueryStrategist|lookup/i.test(evalSrc)) {
    fail('eval harness does not cover lookup/query-strategy selection');
  }
  const fixtures = read(r('tests/fixtures/ai-matching-fixtures.json'));
  if (!/direct|variant|lookup/i.test(fixtures)) fail('no direct-tier/variant fixtures in the AI eval set');
});

// ---------------------------------------------------------------------------
// Step 11 — Authenticated sessions & basket creation: DESIGN ONLY
// ---------------------------------------------------------------------------
check(11, 'Tracked design doc covers auth sessions and basket creation without implementing them', () => {
  const doc = read(r('docs/scraping-architecture.md'));
  if (!doc) fail('docs/scraping-architecture.md missing');
  for (const topic of ['session', 'basket', 'credential', 'revoke|logout|rotation']) {
    if (!new RegExp(topic, 'i').test(doc)) fail(`design doc does not cover: ${topic}`);
  }
  const py = readAll('services/store-fetcher', '.py');
  if (/password|passwd/i.test(py) && !/#|"""/.test(py)) {
    fail('sidecar appears to handle credentials — auth is design-only in this phase');
  }
});

check(11, 'No plaintext credentials anywhere in the repo tree', () => {
  const suspects = [
    ...readAll('services/store-fetcher', '.py').split('\n'),
    ...read(r('docker-compose.yml')).split('\n')
  ];
  const hit = suspects.find((l) =>
    /(password|passwd|secret)\s*[:=]\s*['"][^'"$\s{}]{6,}['"]/i.test(l) && !/example|placeholder|changeme|\$\{/i.test(l)
  );
  if (hit) fail(`possible hardcoded credential: ${hit.trim().slice(0, 80)}`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
await Promise.allSettled(pending);
{
  results.sort((a, b) => a.step - b.step);
  let failed = 0;
  let lastStep = null;
  for (const res of results) {
    if (res.step !== lastStep) {
      console.log(`\n— Step ${res.step} —`);
      lastStep = res.step;
    }
    const mark = res.ok ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${mark}  ${res.name}${res.ok ? '' : `\n          ↳ ${res.detail}`}`);
    if (!res.ok) failed++;
  }
  console.log(
    `\n${failed === 0 ? '✅ ALL GATES PASS — direct store adapters complete.' : `❌ ${failed} gate(s) failing — the corresponding infv-context.md steps are NOT done.`}`
  );
  process.exit(failed === 0 ? 0 : 1);
}
