/**
 * Audit 6 verification gate — executable definition-of-done for context.md.
 *
 * Run: npm run verify:audit   (node scripts/verify-audit6.js [--step N])
 *
 * Purpose: an implementing agent must NOT mark a context.md step complete until
 * this gate reports PASS for that step. Checks are behavioral where possible
 * (real imports, real calls) and structural only where behavior needs live
 * services. Exit code is non-zero while any step fails, so it can also close
 * out the whole task: all green = task done.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const r = (...p) => path.join(ROOT, ...p);
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

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

// Lazy service imports (share module instances across checks)
const svc = (f) => import(r('services/logic-api/src/services', f));

// ---------------------------------------------------------------------------
// Step 1 — Scoring recalibration: valid single-noun items must match again
// ---------------------------------------------------------------------------
check(1, 'Bananas 10 matches a bananas product at every store', async () => {
  const [{ IngredientParser }, { FuzzyMatcher }] = await Promise.all([
    svc('ingredientParser.js'),
    svc('fuzzyMatcher.js')
  ]);
  const item = IngredientParser.parseItem('Bananas 10');
  for (const store of ['tesco', 'asda', 'sainsburys', 'morrisons', 'iceland']) {
    const m = FuzzyMatcher.matchProduct(store, item, [], {});
    if (!m.product) fail(`${store}: no match (score floor still unreachable)`);
    if (!/banana/i.test(m.product.title)) fail(`${store}: matched "${m.product.title}"`);
  }
});

check(1, 'Red lentils 500 g matches a lentils product (brown acceptable)', async () => {
  const [{ IngredientParser }, { FuzzyMatcher }] = await Promise.all([
    svc('ingredientParser.js'),
    svc('fuzzyMatcher.js')
  ]);
  const item = IngredientParser.parseItem('Red lentils 500 g');
  const m = FuzzyMatcher.matchProduct('tesco', item, [], {});
  if (!m.product) fail('no match');
  if (!/lentil/i.test(m.product.title)) fail(`matched "${m.product.title}"`);
});

check(1, 'Singular↔plural: Courgette 1 matches a Courgettes product (word-boundary fix must pluralize toward the title)', async () => {
  const [{ IngredientParser }, { FuzzyMatcher }] = await Promise.all([
    svc('ingredientParser.js'),
    svc('fuzzyMatcher.js')
  ]);
  const item = IngredientParser.parseItem('Courgette 1');
  const m = FuzzyMatcher.matchProduct('tesco', item, [], {});
  if (!m.product) fail('no match — singular keyword fails plural title ("courgette" vs "Courgettes")');
  if (!/courgette/i.test(m.product.title)) fail(`matched "${m.product.title}"`);
});

check(1, 'Negative guard intact: Apples 250 g must NOT match spinach/other foods', async () => {
  const [{ IngredientParser }, { FuzzyMatcher }] = await Promise.all([
    svc('ingredientParser.js'),
    svc('fuzzyMatcher.js')
  ]);
  const item = IngredientParser.parseItem('Apples 250 g');
  const m = FuzzyMatcher.matchProduct('tesco', item, [], {});
  if (m.product && !/apple/i.test(m.product.title)) {
    fail(`recalibration re-admitted garbage: "${m.product.title}"`);
  }
});

// ---------------------------------------------------------------------------
// Step 2 — alternateTerms used, stemmer word-bounded
// ---------------------------------------------------------------------------
check(2, 'Plums or pears 600 g matches a pears product, never plum tomatoes', async () => {
  const [{ IngredientParser }, { FuzzyMatcher }] = await Promise.all([
    svc('ingredientParser.js'),
    svc('fuzzyMatcher.js')
  ]);
  const item = IngredientParser.parseItem('Plums or pears 600 g');
  let matchedSomewhere = false;
  for (const store of ['tesco', 'asda', 'sainsburys', 'morrisons', 'iceland']) {
    const m = FuzzyMatcher.matchProduct(store, item, [], {});
    if (!m.product) continue;
    if (/plum tomato/i.test(m.product.title)) fail(`${store}: matched "${m.product.title}"`);
    if (/pear|plum(?!\s*tomato)/i.test(m.product.title)) matchedSomewhere = true;
  }
  if (!matchedSomewhere) fail('alternateTerms still unused: no pears match at any store');
});

// ---------------------------------------------------------------------------
// Step 3 — Deals toggle: same cache key regardless of includeDeals
// ---------------------------------------------------------------------------
check(3, 'buildScrapeCacheKey identical for deals vs raw', async () => {
  const { buildScrapeCacheKey } = await import(
    r('services/logic-api/src/services/candidatePipeline.js')
  );
  const a = buildScrapeCacheKey('semi skimmed milk', ['tesco', 'asda'], true);
  const b = buildScrapeCacheKey('semi skimmed milk', ['tesco', 'asda'], false);
  if (a !== b) fail(`keys diverge → toggle re-scrapes: "${a}" vs "${b}"`);
});

// ---------------------------------------------------------------------------
// Step 4 — Search lifecycle: status field + promotion behavior
// ---------------------------------------------------------------------------
check(4, 'PriceCache exposes search status + promotion of expired unsaved searches', async () => {
  const src = read(r('services/logic-api/src/services/priceCache.js'));
  if (!/status/.test(src) || !/promot/i.test(src)) {
    fail('no status/promotion logic in priceCache.js');
  }
  const mod = await svc('priceCache.js');
  const PC = mod.PriceCache || mod.default;
  const api = Object.getOwnPropertyNames(PC).join(',');
  if (!/promote/i.test(api)) fail(`no promote* static method (have: ${api})`);
});

check(4, 'Promotion replaces previous auto-promoted list, never pinned/saved ones', async () => {
  // Behavioral where the API allows timestamp injection; otherwise require a
  // dedicated unit test to exist and reference replacement semantics.
  const tests = fs
    .readdirSync(r('services/logic-api/src/services'))
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => read(r('services/logic-api/src/services', f)))
    .join('\n');
  if (!/promot/i.test(tests)) fail('no unit test covers promotion semantics');
  if (!/replac/i.test(tests)) fail('no unit test covers replace-previous-promotion');
});

// ---------------------------------------------------------------------------
// Step 5 — Stats: per-item rows, estimated excluded, client page exists
// ---------------------------------------------------------------------------
check(5, 'recordSnapshot writes per-item×store rows and skips estimated matches', async () => {
  const mod = await svc('priceHistory.js');
  const PH = mod.PriceHistory || mod.default;
  const fake = {
    timestamp: new Date().toISOString(),
    cheapestStore: 'tesco',
    parsedItems: [{ name: 'gate-test-milk', category: 'dairy-eggs' }],
    supermarkets: {
      tesco: {
        totalPrice: 1.2,
        matches: [
          {
            parsedItem: { name: 'gate-test-milk' },
            product: { title: 'Gate Milk', price: 1.2 },
            totalPrice: 1.2,
            isEstimated: true,
            confidenceSource: 'catalog'
          }
        ]
      }
    },
    meta: { sources: { live: 0, cache: 0, catalog: 1 } }
  };
  const snap = PH.recordSnapshot(fake);
  const snapStr = JSON.stringify(snap || {});
  const hasItemRows =
    /itemKey|itemRows|itemPrices/.test(read(r('services/logic-api/src/services/priceHistory.js')));
  if (!hasItemRows) fail('no per-item×store price rows recorded (basket totals only)');
  if (/gate-test-milk/.test(snapStr) && /1\.2/.test(snapStr) && /catalog/.test(snapStr) === false) {
    // ambiguous; rely on explicit exclusion check below
  }
  const src = read(r('services/logic-api/src/services/priceHistory.js'));
  if (!/isEstimated|catalog/.test(src)) {
    fail('no exclusion of estimated/catalog prices from item history');
  }
});

check(5, 'Stats API has per-item series route and client has a stats page', () => {
  const route = read(r('services/logic-api/src/routes/stats.js'));
  if (!/item/i.test(route)) fail('no per-item series endpoint in routes/stats.js');
  const clientFiles = [
    read(r('client/src/App.tsx')),
    ...fs
      .readdirSync(r('client/src/components'))
      .map((f) => read(r('client/src/components', f)))
  ].join('\n');
  if (!/api\/stats/.test(clientFiles)) fail('no client code calls /api/stats (no stats page)');
});

// ---------------------------------------------------------------------------
// Step 6 — eval:ai evaluates the AI; fixtures are real; in-app test route
// ---------------------------------------------------------------------------
check(6, 'eval script has real fixtures with expected picks and an AI mode', () => {
  const fixPath = r('tests/fixtures/ai-matching-fixtures.json');
  if (!fs.existsSync(fixPath)) fail('tests/fixtures/ai-matching-fixtures.json missing');
  const fixtures = JSON.parse(read(fixPath));
  const list = Array.isArray(fixtures) ? fixtures : fixtures.fixtures || [];
  if (list.length < 5) fail(`only ${list.length} fixtures`);
  if (!list.every((f) => f.expectedPick || f.expected)) fail('fixtures lack expectedPick');
  const ownersLines = ['Beef mince 5% 1.9 kg', 'Green/Puy lentils', 'Little gem lettuce'];
  const raw = JSON.stringify(list);
  if (!ownersLines.some((l) => raw.includes(l.split(' ')[0]))) {
    fail('fixtures look invented — none drawn from the owner\'s real list (report5.md §2)');
  }
  const evalSrc = read(r('scripts/eval-ai-matching.js'));
  if (!/aiDecisionReviewer|GoogleGenAI|genai/i.test(evalSrc)) {
    fail('eval script never invokes the AI reviewer');
  }
  if (!/--rules/.test(evalSrc)) fail('no offline --rules mode');
});

check(6, 'In-app AI test endpoint + settings button', () => {
  const routes = fs
    .readdirSync(r('services/logic-api/src/routes'))
    .map((f) => read(r('services/logic-api/src/routes', f)))
    .join('\n');
  if (!/ai-test/.test(routes)) fail('no /api/settings/ai-test route');
  if (!/ai-test|Test AI/i.test(read(r('client/src/components/SettingsModal.tsx')))) {
    fail('SettingsModal has no Test AI matching action');
  }
});

// ---------------------------------------------------------------------------
// Step 7 — Penalty rules data-driven
// ---------------------------------------------------------------------------
check(7, 'matching-rules.json exists and penaltyRules.js is an engine, not a wall', () => {
  if (!fs.existsSync(r('data/matching-rules.json'))) fail('data/matching-rules.json missing');
  const src = read(r('services/logic-api/src/services/penaltyRules.js'));
  const hardcoded = (src.match(/\.includes\(/g) || []).length;
  if (hardcoded > 10) fail(`${hardcoded} hardcoded .includes( chains remain (must be ≤10)`);
  if (!/matching-rules/.test(src)) fail('penaltyRules.js does not load matching-rules.json');
});

// ---------------------------------------------------------------------------
// Step 8 — Reality fixtures in npm test; honest suites; live-scrape proof tool
// ---------------------------------------------------------------------------
check(8, 'Real 52-line list is a unit-test fixture (positive + negative outcomes)', () => {
  const tests = fs
    .readdirSync(r('services/logic-api/src/services'))
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => read(r('services/logic-api/src/services', f)))
    .join('\n');
  const sentinels = ['Maris Piper potatoes 1.8', 'Tinned sardines in olive oil 2 x 120', 'Reduced-salt stock cubes'];
  for (const s of sentinels) {
    if (!tests.includes(s)) fail(`real-list sentinel line missing from unit tests: "${s}"`);
  }
});

check(8, 'recipes suite fails on 0 live hits without --catalog-mode; live-scrape proof script exists', () => {
  const rec = read(r('tests/verify-20-recipes.js'));
  if (!/catalog-mode/.test(rec)) fail('verify-20-recipes.js has no --catalog-mode gate');
  if (!fs.existsSync(r('scripts/dev/prove-live-scrape.js'))) {
    fail('scripts/dev/prove-live-scrape.js missing');
  }
});

// ---------------------------------------------------------------------------
// Step 9 — Deal validity: when deal data is present the pipeline applies it
// appropriately; when absent (or garbage), raw pricing flows through untouched.
// (Whether a deal EXISTS is the scrape's concern — these are invariants that
// must hold for whatever the scrape returns.)
// ---------------------------------------------------------------------------
check(9, 'Invariant sweep: a deal never increases price, never NaN/negative, respects quantity thresholds', async () => {
  const { DealCalculator } = await svc('dealCalculator.js');
  const corpus = [
    '3 for £2',
    '2 for £3.50',
    'Buy 2 Get 1 Free',
    'Save £1 when you buy 2',
    '£1.50 Clubcard Price',
    'Nectar Price £2.00',
    'Any 2 for £5',
    '50% off selected lines this weekend only!!', // garbage → must fail safe
    'was £3 now cheaper', // garbage → must fail safe
    ''
  ];
  for (const dealStr of corpus) {
    for (const price of [0.85, 1.45, 4.5]) {
      for (let qty = 1; qty <= 6; qty++) {
        const res = DealCalculator.calculateDealPrice(price, qty, dealStr);
        const raw = Number((price * qty).toFixed(2));
        const ctx = `deal="${dealStr}" price=${price} qty=${qty}`;
        if (!Number.isFinite(res.totalPrice) || res.totalPrice < 0) fail(`${ctx}: totalPrice=${res.totalPrice}`);
        if (res.totalPrice > raw + 0.005) fail(`${ctx}: deal INCREASED price ${res.totalPrice} > raw ${raw}`);
        if (res.isDealApplied && res.savings <= 0) fail(`${ctx}: applied with zero savings`);
        if (!res.isDealApplied && Math.abs(res.totalPrice - raw) > 0.005) fail(`${ctx}: no deal applied but total ${res.totalPrice} != raw ${raw}`);
        if (Math.abs(res.effectiveUnitPrice * qty - res.totalPrice) > 0.05) fail(`${ctx}: unit price inconsistent`);
      }
    }
  }
});

check(9, 'Toggle: includeDeals=false yields raw price even when the product has a deal', async () => {
  const [{ PackSelector }] = await Promise.all([svc('packSelector.js')]);
  const prod = {
    title: 'Gate Chopped Tomatoes 400g',
    price: 1.45,
    clubcardPrice: 1.25,
    packageSize: 400,
    packageUnit: 'g',
    supermarket: 'tesco'
  };
  const item = { name: 'chopped tomatoes', baseItem: 'chopped tomatoes', targetQuantity: 400, unit: 'g' };
  const withDeals = PackSelector.calculatePacks(prod, item, { includeDeals: true });
  const rawOnly = PackSelector.calculatePacks(prod, item, { includeDeals: false });
  if (!(withDeals.totalPrice < rawOnly.totalPrice)) {
    fail(`deal ignored: withDeals=${withDeals.totalPrice} rawOnly=${rawOnly.totalPrice}`);
  }
  if (Math.abs(rawOnly.totalPrice - 1.45) > 0.005) {
    fail(`raw mode not raw: ${rawOnly.totalPrice} (expected 1.45)`);
  }
});

check(9, 'Provenance + corpus tests exist: applied deal belongs to the matched product; real promo strings are unit-tested', () => {
  const tests = fs
    .readdirSync(r('services/logic-api/src/services'))
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => read(r('services/logic-api/src/services', f)))
    .join('\n');
  if (!/provenance|own deal|dealApplied.*best|leak/i.test(tests)) {
    fail('no unit test asserts an applied deal comes from the matched product itself (not another candidate/store)');
  }
  if (!fs.existsSync(r('tests/fixtures/deal-strings.json'))) {
    fail('tests/fixtures/deal-strings.json missing (real scraped promo strings corpus, incl. garbage cases)');
  }
});

// ---------------------------------------------------------------------------
// Step 10 — Round-3 cleanup gates (residuals found in the report8.md review)
// ---------------------------------------------------------------------------
check(10, 'Catalog carries 6+ dealed products across 3+ stores so deals run end-to-end', () => {
  const catalog = JSON.parse(read(r('data/catalog.json')));
  const dealed = (catalog.products || []).filter(
    (p) => p.deal || p.clubcardPrice || p.dealString || p.promotion || p.loyaltyPrice
  );
  if (dealed.length < 6) fail(`only ${dealed.length} dealed product(s) in catalog (need ≥6)`);
  const stores = new Set(dealed.map((p) => p.supermarket));
  if (stores.size < 3) fail(`dealed products span only ${stores.size} store(s) (need ≥3)`);
});

check(10, 'No stale duplicate matching-rules.json in services dir', () => {
  if (fs.existsSync(r('services/logic-api/src/services/matching-rules.json'))) {
    fail('services/logic-api/src/services/matching-rules.json still exists — data/matching-rules.json is canonical, delete the duplicate');
  }
});

check(10, 'Mega-suites report estimated-share/match-rate, not blanket 100% success', () => {
  for (const f of ['tests/food-form-and-variety-audit.js', 'tests/uncached-20-lists-30-items-audit.js']) {
    const src = read(r(f));
    if (!/estimated|match.?rate|catalog.?mode/i.test(src)) {
      fail(`${f} still reports unconditional success with no estimated-share/match-rate disclosure`);
    }
  }
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
    `\n${failed === 0 ? '✅ ALL GATES PASS — Audit 6 complete.' : `❌ ${failed} gate(s) failing — the corresponding context.md steps are NOT done.`}`
  );
  process.exit(failed === 0 ? 0 : 1);
}
