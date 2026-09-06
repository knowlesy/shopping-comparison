/**
 * Real-corpus matching evaluation.
 *
 * Scores the matcher against tests/fixtures/ai-matching-fixtures.real.json —
 * real scraped Tesco candidates from the owner's actual 52-line list, with
 * hand-labelled ground truth (see groundTruthNote on each fixture).
 *
 *   node scripts/eval-real.js            # rules only, no AI, no key needed
 *   node scripts/eval-real.js --ai       # adds the AI path (needs GEMINI_API_KEY)
 *   node scripts/eval-real.js --ai --runs 3
 *
 * Reports overall / train / holdout, and for AI runs the two numbers that
 * matter: uplift (rules wrong -> AI right) and regressions (rules right ->
 * AI wrong).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FuzzyMatcher } from '../services/logic-api/src/services/fuzzyMatcher.js';
import { KeywordExtractor } from '../services/logic-api/src/services/keywordExtractor.js';
import { PenaltyRules } from '../services/logic-api/src/services/penaltyRules.js';
import { AiDecisionReviewer } from '../services/logic-api/src/services/aiDecisionReviewer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests/fixtures/ai-matching-fixtures.real.json');

const useAi = process.argv.includes('--ai');
const runs = (() => {
  const i = process.argv.indexOf('--runs');
  return i > -1 ? Math.max(1, Number(process.argv[i + 1]) || 1) : 1;
})();

/** Judge one resolved pick against a fixture's ground truth. */
function judge(f, productId, packsNeeded, totalQuantity) {
  if (f.expectNoMatch) {
    return productId === null
      ? { ok: true, why: '' }
      : { ok: false, why: 'should have been no match' };
  }
  if (productId === null) return { ok: false, why: 'returned no match' };
  if (f.mustNotPick.includes(productId)) return { ok: false, why: 'forbidden candidate' };
  if (productId !== f.expectedPick && !f.acceptablePicks.includes(productId)) {
    return { ok: false, why: 'wrong product' };
  }
  if (f.minTotalQuantity && Number(totalQuantity) < f.minTotalQuantity) {
    return { ok: false, why: `only ${totalQuantity} vs min ${f.minTotalQuantity}` };
  }
  if (f.maxPacksNeeded && Number(packsNeeded) > f.maxPacksNeeded) {
    return { ok: false, why: `${packsNeeded} packs vs max ${f.maxPacksNeeded}` };
  }
  return { ok: true, why: '' };
}

function rulesResolve(f) {
  const m = FuzzyMatcher.matchProduct('tesco', f.item, f.candidates, {});
  return {
    id: m.product?.id || null,
    title: (m.product?.title || 'NO MATCH').trim(),
    packs: m.packsNeeded,
    qty: m.totalQuantity,
    price: m.totalPrice
  };
}

async function aiResolve(f) {
  const keywords = KeywordExtractor.extractKeywords(f.item);
  const scored = f.candidates
    .map((prod) => {
      const { score, packs, totalPrice } = PenaltyRules.scoreCandidate(prod, f.item, keywords, {
        brandTierPriority: 'standard'
      });
      return { product: prod, score, packs, totalPrice: totalPrice || prod.price };
    })
    .sort((a, b) => b.score - a.score || a.totalPrice - b.totalPrice);

  const reviewed = await AiDecisionReviewer.reviewCandidates(f.query, f.item, scored, {
    aiMatchingEnabled: true,
    aiAssistLevel: 'balanced',
    supermarket: 'tesco',
    aiCallsContext: { callsUsed: 0 }
  });
  const prod = reviewed?.product || null;
  return {
    id: prod?.id || null,
    title: (prod?.title || 'NO MATCH').trim(),
    packs: reviewed?.packs,
    qty: reviewed?.totalQty,
    price: reviewed?.totalPrice,
    reasoning: reviewed?.aiReasoning || ''
  };
}

const fixtures = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
const tally = (rows) => `${rows.filter((r) => r.ok).length}/${rows.length}`;

console.log('='.repeat(79));
console.log(`  REAL-CORPUS MATCHING EVAL  (${fixtures.length} fixtures, real Tesco scrape)`);
console.log(`  mode: ${useAi ? `rules + AI, ${runs} run(s)` : 'rules only'}`);
console.log('='.repeat(79));

const rulesRows = [];
for (const f of fixtures) {
  const r = rulesResolve(f);
  const v = judge(f, r.id, r.packs, r.qty);
  rulesRows.push({ id: f.id, split: f.split, ok: v.ok, why: v.why, pick: r });
}

for (const row of rulesRows) {
  const f = fixtures.find((x) => x.id === row.id);
  console.log(`\n${row.ok ? 'PASS' : 'FAIL'} [${row.split}] ${f.query}`);
  console.log(`   expect : ${f.expectNoMatch ? 'NO MATCH' : f.expectedTitle}`);
  console.log(`   rules  : ${row.pick.title} (${row.pick.packs} packs, GBP ${row.pick.price})${row.why ? ' — ' + row.why : ''}`);
}

const rTrain = rulesRows.filter((r) => r.split === 'train');
const rHold = rulesRows.filter((r) => r.split === 'holdout');
console.log('\n' + '-'.repeat(79));
console.log(`RULES BASELINE   overall ${tally(rulesRows)}   train ${tally(rTrain)}   holdout ${tally(rHold)}`);

if (!useAi) {
  console.log('-'.repeat(79));
  console.log('Run with --ai to score the AI path (needs GEMINI_API_KEY in .env).');
  process.exit(0);
}

const hasKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '').trim().length > 5;
if (!hasKey) {
  console.error('\nGEMINI_API_KEY is not set — add it to .env before using --ai.');
  process.exit(1);
}

const perFixture = new Map(fixtures.map((f) => [f.id, []]));
for (let run = 1; run <= runs; run++) {
  process.stdout.write(`\nAI run ${run}/${runs} `);
  for (const f of fixtures) {
    let res;
    try {
      res = await aiResolve(f);
    } catch (err) {
      res = { id: null, title: `ERROR: ${err.message}`, reasoning: '' };
    }
    const v = judge(f, res.id, res.packs, res.qty);
    perFixture.get(f.id).push({ ok: v.ok, why: v.why, res });
    process.stdout.write(v.ok ? '.' : 'x');
  }
}
console.log('\n');

let uplift = 0;
let regress = 0;
const aiRows = [];
for (const f of fixtures) {
  const attempts = perFixture.get(f.id);
  const okCount = attempts.filter((a) => a.ok).length;
  const majorityOk = okCount * 2 > attempts.length;
  const rulesOk = rulesRows.find((r) => r.id === f.id).ok;
  const stable = new Set(attempts.map((a) => a.res.id)).size === 1;
  aiRows.push({ id: f.id, split: f.split, ok: majorityOk, stable });
  if (!rulesOk && majorityOk) uplift++;
  if (rulesOk && !majorityOk) regress++;

  const last = attempts[attempts.length - 1];
  console.log(`${majorityOk ? 'PASS' : 'FAIL'} [${f.split}] ${f.query}  (${okCount}/${attempts.length} runs ok${stable ? '' : ', UNSTABLE'})`);
  console.log(`   expect : ${f.expectNoMatch ? 'NO MATCH' : f.expectedTitle}`);
  console.log(`   ai     : ${last.res.title}${last.why ? ' — ' + last.why : ''}`);
  if (last.res.reasoning) console.log(`   why    : ${String(last.res.reasoning).slice(0, 160)}`);
}

const aTrain = aiRows.filter((r) => r.split === 'train');
const aHold = aiRows.filter((r) => r.split === 'holdout');
const unstable = aiRows.filter((r) => !r.stable).length;

console.log('\n' + '-'.repeat(79));
console.log(`RULES BASELINE   overall ${tally(rulesRows)}   train ${tally(rTrain)}   holdout ${tally(rHold)}`);
console.log(`WITH AI          overall ${tally(aiRows)}   train ${tally(aTrain)}   holdout ${tally(aHold)}`);
console.log(`UPLIFT           ${uplift} fixture(s) rules got wrong that AI got right`);
console.log(`REGRESSIONS      ${regress} fixture(s) rules got right that AI got wrong`);
if (runs > 1) console.log(`STABILITY        ${aiRows.length - unstable}/${aiRows.length} fixtures returned the same pick every run`);
console.log('-'.repeat(79));
console.log('Holdout is the honest number: those fixtures are not for tuning against.');
