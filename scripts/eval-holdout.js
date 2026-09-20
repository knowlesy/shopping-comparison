/**
 * Independent holdout evaluation with honest metric separation.
 *
 * Scores the rules matcher against two corpora and keeps them apart:
 *
 *   tests/fixtures/ai-holdout-clean.json         real scraped candidates, hand-labelled,
 *                                                never used to tune the rules
 *   tests/fixtures/matching-boundaries.synthetic.json
 *                                                hand-written boundary cases, clearly labelled
 *                                                synthetic and reported separately
 *
 * The synthetic set is never folded into the holdout score. Tuned examples are not a holdout.
 *
 * It reports, separately:
 *   returned      a product was returned (says nothing about whether it was right)
 *   correct       the returned product satisfies the label, or an expected decline was made
 *   bad pick      a product was returned but the label forbids it or names another
 *   missing data  the fixture offered no candidate that could satisfy the label
 *   declined      no product was returned
 *
 * Exits non-zero when a configured invariant fails, so a regression cannot pass quietly.
 *
 *   node scripts/eval-holdout.js
 *   node scripts/eval-holdout.js --min-correct 10     # override the ratchet
 *   node scripts/eval-holdout.js --no-ratchet
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FuzzyMatcher } from '../services/logic-api/src/services/fuzzyMatcher.js';
import { PenaltyRules } from '../services/logic-api/src/services/penaltyRules.js';
import { KeywordExtractor } from '../services/logic-api/src/services/keywordExtractor.js';
import { getUserSettings } from '../services/logic-api/src/routes/settings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOLDOUT = path.join(ROOT, 'tests/fixtures/ai-holdout-clean.json');
const SYNTHETIC = path.join(ROOT, 'tests/fixtures/matching-boundaries.synthetic.json');

// The holdout is small and independent; this is where it stands, not an aspiration.
const DEFAULT_MIN_CORRECT = 10;

const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
};

/** Could any candidate in this fixture have satisfied the label at all? */
function shelfCanSatisfy(f) {
  if (f.expectNoMatch) return false;
  const acceptable = new Set([f.expectedPick, ...(f.acceptablePicks || [])].filter(Boolean));
  return f.candidates.some((c) => acceptable.has(c.id));
}

function classify(f, pick) {
  if (f.expectNoMatch) {
    return pick === null
      ? { bucket: 'correct', why: 'declined as labelled' }
      : { bucket: 'badPick', why: 'returned a product where the label expects none' };
  }
  const canSatisfy = shelfCanSatisfy(f);
  if (pick === null) {
    return canSatisfy
      ? { bucket: 'missedOpportunity', why: 'declined although a labelled product was present' }
      : { bucket: 'missingData', why: 'no candidate could satisfy the label' };
  }
  if ((f.mustNotPick || []).includes(pick.id)) {
    return { bucket: 'badPick', why: `forbidden candidate: ${pick.title}` };
  }
  const acceptable = new Set([f.expectedPick, ...(f.acceptablePicks || [])].filter(Boolean));
  if (!acceptable.has(pick.id)) {
    return canSatisfy
      ? { bucket: 'badPick', why: `wrong product: ${pick.title}` }
      : { bucket: 'missingData', why: 'no candidate could satisfy the label' };
  }
  if (f.minTotalQuantity && Number(pick.totalQuantity) < f.minTotalQuantity) {
    return { bucket: 'badPick', why: `quantity ${pick.totalQuantity} below required ${f.minTotalQuantity}` };
  }
  if (f.maxPacksNeeded && Number(pick.packsNeeded) > f.maxPacksNeeded) {
    return { bucket: 'badPick', why: `${pick.packsNeeded} packs above allowed ${f.maxPacksNeeded}` };
  }
  return { bucket: 'correct', why: '' };
}

function resolve(f) {
  const prefs = { ...getUserSettings(), ...(f.preferences || {}) };
  const m = FuzzyMatcher.matchProduct(f.item?.supermarket || 'tesco', f.item, f.candidates, prefs);
  return m.product ? { id: m.product.id, title: m.product.title, packsNeeded: m.packsNeeded, totalQuantity: m.totalQuantity } : null;
}

function runHoldout() {
  const fixtures = JSON.parse(fs.readFileSync(HOLDOUT, 'utf8'));
  const counts = { returned: 0, correct: 0, badPick: 0, missingData: 0, missedOpportunity: 0, declined: 0 };
  const failures = [];

  for (const f of fixtures) {
    const pick = resolve(f);
    if (pick) counts.returned += 1; else counts.declined += 1;
    const { bucket, why } = classify(f, pick);
    counts[bucket] += 1;
    if (bucket !== 'correct') failures.push(`${f.id} ${f.query} — ${why}`);
  }

  console.log(`\nINDEPENDENT HOLDOUT  (${path.relative(ROOT, HOLDOUT)}, real scraped candidates)`);
  console.log(`  cases            ${fixtures.length}`);
  console.log(`  returned         ${counts.returned}   (a product came back; not a correctness figure)`);
  console.log(`  declined         ${counts.declined}`);
  console.log(`  correct          ${counts.correct}`);
  console.log(`  bad picks        ${counts.badPick}`);
  console.log(`  missed chances   ${counts.missedOpportunity}   (declined although the label was on the shelf)`);
  console.log(`  missing data     ${counts.missingData}   (the fixture could not satisfy the label)`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  return { total: fixtures.length, counts, failures };
}

function runSynthetic() {
  if (!fs.existsSync(SYNTHETIC)) return { total: 0, failures: [] };
  const set = JSON.parse(fs.readFileSync(SYNTHETIC, 'utf8'));
  const failures = [];

  for (const c of set.cases) {
    const prefs = getUserSettings();
    const keywords = KeywordExtractor.extractKeywords(c.item);
    const { eligible, reason } = PenaltyRules.checkEligibility(c.candidate, c.item, keywords, prefs);
    const want = c.expect === 'accept';
    if (eligible !== want) {
      failures.push(`${c.id} [${c.rule}] expected ${c.expect} but eligibility was ${eligible}${reason ? ` (${reason})` : ''}`);
    }
  }

  console.log(`\nSYNTHETIC BOUNDARY CASES  (${path.relative(ROOT, SYNTHETIC)}, hand-written — NOT a holdout)`);
  console.log(`  cases            ${set.cases.length}`);
  console.log(`  passing          ${set.cases.length - failures.length}`);
  for (const failure of failures) console.log(`  FAIL ${failure}`);
  return { total: set.cases.length, failures };
}

const holdout = runHoldout();
const synthetic = runSynthetic();

const invariantFailures = [];
if (!process.argv.includes('--no-ratchet')) {
  const minCorrect = Number(argValue('--min-correct') ?? DEFAULT_MIN_CORRECT);
  if (holdout.counts.correct < minCorrect) {
    invariantFailures.push(`holdout correct ${holdout.counts.correct} < required ${minCorrect}`);
  }
  if (holdout.counts.badPick > 0) {
    invariantFailures.push(`holdout bad picks ${holdout.counts.badPick} > allowed 0`);
  }
  if (synthetic.failures.length > 0) {
    invariantFailures.push(`${synthetic.failures.length} synthetic boundary case(s) failed`);
  }
}

console.log('\nINVARIANTS');
if (invariantFailures.length === 0) {
  console.log('  OK');
} else {
  for (const failure of invariantFailures) console.log(`  FAILED ${failure}`);
  process.exitCode = 1;
}
