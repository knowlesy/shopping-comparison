/**
 * Per-Store Matching and Correctness Evaluator (Step 35 & 36)
 *
 * Evaluates candidate picks for every reachable supermarket (Tesco, Sainsbury's,
 * Morrisons, Asda, Iceland) against tests/fixtures/item-constraints.json.
 *
 * Constraints serve strictly as the marking scheme (grading the exam).
 * Input items passed to matchProduct are parsed directly via
 * IngredientParser.parseList exactly as production does.
 *
 * Reports per store:
 *  - Correctness: % of picks satisfying item constraints (validity, not preference)
 *  - Match Rate: % of items where a product was returned
 *  - Honest No-Match: items where the retailer shelf genuinely lacked a satisfying product
 *  - False Matches: items where an invalid product was picked when shelf lacked valid options
 *  - Bad Picks: items where an invalid product was picked despite valid options on shelf
 *
 * Usage:
 *   node scripts/eval-stores.js
 *   npm run eval:stores
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FuzzyMatcher } from '../services/logic-api/src/services/fuzzyMatcher.js';
import { IngredientParser } from '../services/logic-api/src/services/ingredientParser.js';
import { KeywordExtractor } from '../services/logic-api/src/services/keywordExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SHOPPED = ['tesco', 'sainsburys', 'morrisons', 'asda', 'iceland'];

function readJson(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

/** Check if product satisfies the item constraints (the marking scheme) */
function evaluateProductAgainstConstraint(constraint, product, matchResult = null) {
  if (!product) return { satisfies: false, reason: 'No product returned' };

  const title = String(product.title || '').toLowerCase();
  const brand = String(product.brand || '').toLowerCase();
  const titleText = `${brand} ${title}`.toLowerCase();
  const dept = String(product.departmentName || product.superDepartmentName || '').toLowerCase();
  const aisle = String(product.aisleName || '').toLowerCase();
  const isFrozenStr = product.isFrozen ? 'frozen' : '';
  const fullText = `${brand} ${title} ${dept} ${aisle} ${isFrozenStr}`.toLowerCase();

  // 1. Must match all required keywords/qualifiers using KeywordExtractor.wordMatches
  for (const term of constraint.mustMatch || []) {
    const t = term.toLowerCase().trim();
    if (t === '5%' || t === '0%' || t === '85%') {
      const num = t.replace('%', '');
      const hasPct = new RegExp('\\b' + num + '%|\\b' + num + '\\s*%').test(fullText);
      if (!hasPct) return { satisfies: false, reason: `missing ${t} spec in product title` };
    } else {
      const words = t.replace(/[-_]/g, ' ').split(/\s+/).filter(Boolean);
      const allPresent = words.every((w) => {
        if (w === 'fusilli' && /fusiili/i.test(fullText)) return true;
        if ((w === 'reduced' || w === 'salt') && /low\s*salt/i.test(fullText)) return true;
        return KeywordExtractor.wordMatches(w, fullText);
      });
      if (!allPresent) {
        return { satisfies: false, reason: `missing required qualifier "${term}"` };
      }
    }
  }

  // 2. Must not match forbidden terms (strict word boundary matching against product title)
  for (const term of constraint.mustNotMatch || []) {
    const t = term.toLowerCase().trim();
    if (t === 'skimmed milk' && /semi[- ]skimmed/i.test(titleText)) {
      continue;
    }
    if (new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(titleText)) {
      return { satisfies: false, reason: `matches forbidden term "${term}"` };
    }
  }

  // 3. Fat percentage explicit validation
  if (constraint.fatPercentage !== undefined) {
    const targetPct = String(constraint.fatPercentage);
    const hasTarget = new RegExp('\\b' + targetPct + '%|\\b' + targetPct + '\\s*%').test(fullText);
    if (!hasTarget) {
      const otherMatch = fullText.match(/(\d+)\s*%/);
      if (otherMatch && otherMatch[1] !== targetPct) {
        return { satisfies: false, reason: `wrong fat percentage (${otherMatch[1]}% vs ${targetPct}%)` };
      }
    }
  }

  return { satisfies: true };
}

/** Check if ANY product on shelf satisfies the constraint */
function shelfHasValidOption(constraint, candidates) {
  for (const cand of candidates) {
    const res = evaluateProductAgainstConstraint(constraint, cand);
    if (res.satisfies) return true;
  }
  return false;
}

async function runStoreEvaluation() {
  const constraintsList = readJson('tests/fixtures/item-constraints.json');
  if (!constraintsList || !Array.isArray(constraintsList)) {
    console.error('Missing or invalid tests/fixtures/item-constraints.json');
    process.exit(1);
  }

  const reachability = readJson('tests/fixtures/store-payloads/_reachability.json') || {};
  const reachableStores = SHOPPED.filter(
    (s) => reachability.stores?.[s]?.status === 'reachable'
  );

  const corpus =
    readJson('tests/fixtures/reality-fixtures.json') ||
    readJson('tests/fixtures/reality-sample.json') ||
    {};

  // Parse items with production IngredientParser — exactly as the live app does
  const listLines = readJson('tests/fixtures/real-list.json') || [];
  const parsedItems = IngredientParser.parseList(listLines);

  if (parsedItems.length === 0) {
    console.error('No items parsed from real-list.json');
    process.exit(1);
  }

  console.log('='.repeat(88));
  console.log('  PER-STORE MATCHING & CORRECTNESS EVALUATION (Step 36)');
  console.log(`  Evaluating ${reachableStores.length} reachable stores across ${parsedItems.length} parsed items`);
  console.log('='.repeat(88));

  const storeStats = {};

  for (const store of reachableStores) {
    let totalItems = 0;
    let matchedItems = 0;
    let correctItems = 0;
    let honestNoMatches = 0;
    let falseMatches = 0; // Picked invalid product when shelf had nothing valid
    let badPicks = 0;     // Picked invalid product when valid product existed on shelf

    const itemDetails = [];

    for (const parsedItem of parsedItems) {
      const rawText = String(parsedItem.rawText || '').trim().toLowerCase();
      let constraint = constraintsList.find(
        (c) => String(c.rawText || '').trim().toLowerCase() === rawText
      );

      if (!constraint) {
        // Fallback for individual split items (e.g. single herbs)
        constraint = {
          rawText: parsedItem.rawText,
          baseItem: parsedItem.name,
          mustMatch: [parsedItem.name.toLowerCase()],
          mustNotMatch: []
        };
      }

      totalItems++;

      const corpusItem = (corpus.items || []).find(
        (it) => String(it.rawText || it.query || it.name).trim().toLowerCase() === rawText
      );

      const candidates = (corpusItem?.products || []).filter(
        (p) => (p.supermarket || p.store) === store
      );

      const shelfCanSatisfy = shelfHasValidOption(constraint, candidates);

      // Pass the real parsed item directly into matchProduct — no constraint driving
      const matchResult = FuzzyMatcher.matchProduct(
        store,
        parsedItem,
        candidates,
        {}
      );

      const pickedProduct = matchResult.product || null;
      const isMatched = pickedProduct !== null;

      if (isMatched) {
        matchedItems++;
        const evalRes = evaluateProductAgainstConstraint(
          constraint,
          pickedProduct,
          matchResult
        );

        if (evalRes.satisfies) {
          correctItems++;
          itemDetails.push({ rawText: parsedItem.rawText, status: 'PASS', pick: pickedProduct.title });
        } else {
          if (!shelfCanSatisfy) {
            falseMatches++;
            itemDetails.push({
              rawText: parsedItem.rawText,
              status: 'FALSE_MATCH',
              pick: pickedProduct.title,
              why: evalRes.reason,
              shelf: 'No valid option on shelf'
            });
          } else {
            badPicks++;
            itemDetails.push({
              rawText: parsedItem.rawText,
              status: 'BAD_PICK',
              pick: pickedProduct.title,
              why: evalRes.reason
            });
          }
        }
      } else {
        if (!shelfCanSatisfy) {
          honestNoMatches++;
          correctItems++; // An honest decline when shelf lacks valid item is correct behaviour!
          itemDetails.push({
            rawText: parsedItem.rawText,
            status: 'HONEST_DECLINE',
            pick: 'NO MATCH',
            shelf: 'Shelf lacks valid option'
          });
        } else {
          itemDetails.push({
            rawText: parsedItem.rawText,
            status: 'MISSED_OPPORTUNITY',
            pick: 'NO MATCH',
            why: 'Valid option existed on shelf but matcher declined'
          });
        }
      }
    }

    const matchRatePct = totalItems > 0 ? ((matchedItems / totalItems) * 100).toFixed(1) : '0.0';
    const correctnessPct = totalItems > 0 ? ((correctItems / totalItems) * 100).toFixed(1) : '0.0';
    const missedOpportunities = itemDetails.filter((d) => d.status === 'MISSED_OPPORTUNITY').length;

    storeStats[store] = {
      totalItems,
      matchedItems,
      correctItems,
      honestNoMatches,
      falseMatches,
      badPicks,
      missedOpportunities,
      matchRatePct,
      correctnessPct,
      itemDetails
    };
  }

  // Render Table
  console.log(
    'Store'.padEnd(14) +
    'Items'.padStart(8) +
    'Match Rate'.padStart(16) +
    'Correctness'.padStart(16) +
    'Honest No-Match'.padStart(18) +
    'False Matches'.padStart(16) +
    'Bad Picks'.padStart(12) +
    'Missed'.padStart(9)
  );
  console.log('-'.repeat(109));

  for (const store of reachableStores) {
    const s = storeStats[store];
    console.log(
      store.padEnd(14) +
      `${s.totalItems}`.padStart(8) +
      `${s.matchedItems}/${s.totalItems} (${s.matchRatePct}%)`.padStart(16) +
      `${s.correctItems}/${s.totalItems} (${s.correctnessPct}%)`.padStart(16) +
      `${s.honestNoMatches}`.padStart(18) +
      `${s.falseMatches}`.padStart(16) +
      `${s.badPicks}`.padStart(12) +
      `${s.missedOpportunities}`.padStart(9)
    );
  }

  console.log('-'.repeat(109));
  console.log('\nKey Takeaways:');
  for (const store of reachableStores) {
    const s = storeStats[store];
    console.log(`- ${store.toUpperCase()}: ${s.correctnessPct}% correctness vs ${s.matchRatePct}% match rate (${s.honestNoMatches} honest no-matches, ${s.falseMatches} false matches, ${s.badPicks} bad picks, ${s.missedOpportunities} missed)`);
  }
  console.log('='.repeat(109));

  return storeStats;
}

/**
 * Ratchet check. This is not a demand for 100% — it is a record of where each store stands today,
 * so a change that silently makes matching worse fails instead of printing a slightly worse table.
 * Improving a number is expected; the baseline file is then updated deliberately, in its own commit.
 */
function checkRatchet(storeStats) {
  const baseline = readJson('tests/fixtures/store-eval-ratchet.json');
  if (!baseline) {
    console.log('\nNo tests/fixtures/store-eval-ratchet.json: ratchet not enforced.');
    return { failures: [], improvements: [] };
  }

  const failures = [];
  const improvements = [];

  for (const [store, limits] of Object.entries(baseline.stores || {})) {
    const s = storeStats[store];
    if (!s) {
      failures.push(`${store}: expected in this evaluation but was not scored`);
      continue;
    }
    const checks = [
      ['correctItems', s.correctItems, limits.minCorrectItems, 'min'],
      ['falseMatches', s.falseMatches, limits.maxFalseMatches, 'max'],
      ['badPicks', s.badPicks, limits.maxBadPicks, 'max'],
      ['missedOpportunities', s.missedOpportunities, limits.maxMissedOpportunities, 'max']
    ];
    for (const [name, actual, limit, direction] of checks) {
      if (limit === undefined || limit === null) continue;
      if (direction === 'min' && actual < limit) {
        failures.push(`${store}.${name}: ${actual} < required ${limit}`);
      } else if (direction === 'max' && actual > limit) {
        failures.push(`${store}.${name}: ${actual} > allowed ${limit}`);
      } else if (direction === 'min' && actual > limit) {
        improvements.push(`${store}.${name}: ${actual} (baseline ${limit})`);
      } else if (direction === 'max' && actual < limit) {
        improvements.push(`${store}.${name}: ${actual} (baseline ${limit})`);
      }
    }
  }

  console.log('\nRatchet vs tests/fixtures/store-eval-ratchet.json');
  if (improvements.length > 0) {
    console.log(`  improved (update the baseline deliberately): ${improvements.join(', ')}`);
  }
  if (failures.length === 0) {
    console.log('  OK: no store regressed.');
  } else {
    for (const failure of failures) console.log(`  REGRESSION ${failure}`);
  }
  return { failures, improvements };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runStoreEvaluation()
    .then((storeStats) => {
      if (process.argv.includes('--no-ratchet')) return;
      const { failures } = checkRatchet(storeStats);
      if (failures.length > 0) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { runStoreEvaluation, checkRatchet };
