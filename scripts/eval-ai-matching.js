/**
 * AI Intent Helper & Candidate Matcher Evaluation Harness
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AiDecisionReviewer } from '../services/logic-api/src/services/aiDecisionReviewer.js';
import { FuzzyMatcher } from '../services/logic-api/src/services/fuzzyMatcher.js';
import { KeywordExtractor } from '../services/logic-api/src/services/keywordExtractor.js';
import { PenaltyRules } from '../services/logic-api/src/services/penaltyRules.js';
import { QueryStrategist } from '../services/logic-api/src/services/queryStrategist.js';
import { VariantOptimizer } from '../services/logic-api/src/services/variantOptimizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runAiEval() {
  const isRulesMode = process.argv.includes('--rules');

  console.log('===============================================================================');
  console.log(`   AI INTENT & MATCHING EVALUATION HARNESS (${isRulesMode ? 'OFFLINE --RULES MODE' : 'LIVE AI REVIEWER MODE'})`);
  console.log('===============================================================================\n');

  const fixturesPath = path.resolve(__dirname, '../tests/fixtures/ai-matching-fixtures.json');
  if (!fs.existsSync(fixturesPath)) {
    throw new Error(`Fixtures file not found at: ${fixturesPath}`);
  }

  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  console.log(`Loaded ${fixtures.length} ambiguous test fixtures from owner's real-world shopping list.\n`);

  let correctPicks = 0;
  const results = [];

  for (const fixture of fixtures) {
    const { id, query, item, candidates, expectedPick, expected, lookupStrategy } = fixture;
    const targetExpected = expectedPick || expected;
    let chosenId = null;
    let reasoning = '';

    // Evaluate QueryStrategist lookup terms for the item
    const lookupPlan = await QueryStrategist.plan(item, {
      supermarket: candidates[0]?.supermarket || 'tesco',
      aiMatchingEnabled: !isRulesMode
    });

    if (lookupStrategy === 'variant_optimizer') {
      const optResult = VariantOptimizer.optimize(candidates, item, { packSizingPolicy: 'cover' });
      chosenId = optResult?.lines[0]?.product?.id || null;
      reasoning = `Selected via VariantOptimizer (${optResult?.explanation || ''}) [lookup queries: ${lookupPlan.queries.join(', ')}]`;
    } else if (isRulesMode) {
      // Score fixture candidate set directly using deterministic PenaltyRules
      const keywords = KeywordExtractor.extractKeywords(item);
      let best = null;
      let highestScore = -Infinity;
      for (const prod of candidates) {
        const { score } = PenaltyRules.scoreCandidate(prod, item, keywords, { brandTierPriority: 'standard' });
        if (score > highestScore) {
          highestScore = score;
          best = prod;
        }
      }
      chosenId = best?.id || null;
      reasoning = `Matched via local rules score: ${highestScore}`;
    } else {
      // Evaluate candidates using AiDecisionReviewer (or fallback)
      const scoredCandidates = candidates.map((prod) => ({
        product: prod,
        score: 50,
        packs: 1,
        totalPrice: prod.price
      }));

      const reviewed = await AiDecisionReviewer.reviewCandidates(
        query,
        item,
        scoredCandidates,
        { aiMatchingEnabled: true }
      );
      chosenId = reviewed?.product?.id || reviewed?.id || null;
      reasoning = reviewed?.aiReasoning || 'AI decision reviewer';
    }

    const isMatch = chosenId === targetExpected;
    if (isMatch) correctPicks++;

    console.log(`Fixture [${id}] "${query}":`);
    console.log(`  - Expected Pick: ${targetExpected}`);
    console.log(`  - Result Pick:   ${chosenId}`);
    console.log(`  - Status:        ${isMatch ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  - Reasoning:     ${reasoning}\n`);

    results.push({
      id,
      query,
      expected: targetExpected,
      chosen: chosenId,
      status: isMatch ? 'pass' : 'fail',
      reasoning
    });
  }

  const accuracy = Number(((correctPicks / fixtures.length) * 100).toFixed(1));
  console.log('-------------------------------------------------------------------------------');
  console.log(`Final Accuracy: ${correctPicks}/${fixtures.length} (${accuracy}%)`);
  console.log('-------------------------------------------------------------------------------\n');

  const reportDir = path.resolve(__dirname, '../test-results');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, 'ai-eval-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        mode: isRulesMode ? 'rules' : 'ai',
        totalFixtures: fixtures.length,
        correctPicks,
        accuracy,
        results
      },
      null,
      2
    ),
    'utf8'
  );
}

runAiEval().catch((err) => {
  console.error('AI eval harness error:', err);
  process.exit(1);
});
