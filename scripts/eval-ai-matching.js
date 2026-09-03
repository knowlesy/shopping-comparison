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

import { AiPolicy } from '../services/logic-api/src/services/aiPolicy.js';

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
  let rulesCorrectPicks = 0;
  let aiFiredCount = 0;
  let aiChangedOutcomeCount = 0;
  let aiChangedCorrectlyCount = 0;
  let aiChangedIncorrectlyCount = 0;
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

    // Compute deterministic baseline score using PenaltyRules
    const keywords = KeywordExtractor.extractKeywords(item);
    const scoredRules = candidates.map((prod) => {
      const { score, packs, totalPrice } = PenaltyRules.scoreCandidate(prod, item, keywords, { brandTierPriority: 'standard' });
      return { product: prod, score, packs, totalPrice: totalPrice || prod.price };
    });
    scoredRules.sort((a, b) => b.score - a.score || a.totalPrice - b.totalPrice);

    const rulesPick = scoredRules[0]?.product || null;
    const rulesPickId = rulesPick?.id || null;
    const topScore = scoredRules[0]?.score ?? 0;
    const secondScore = scoredRules[1]?.score ?? 0;

    if (rulesPickId === targetExpected) {
      rulesCorrectPicks++;
    }

    const policyDecision = AiPolicy.shouldFire({
      stage: 'select',
      aiAssistLevel: isRulesMode ? 'off' : 'balanced',
      topScore,
      secondScore,
      hasNoResult: candidates.length === 0 || topScore === 0
    });

    let aiFired = false;

    if (lookupStrategy === 'variant_optimizer') {
      const optResult = VariantOptimizer.optimize(candidates, item, { packSizingPolicy: 'cover' });
      chosenId = optResult?.lines[0]?.product?.id || null;
      reasoning = `Selected via VariantOptimizer (${optResult?.explanation || ''}) [lookup queries: ${lookupPlan.queries.join(', ')}]`;
    } else if (isRulesMode || !policyDecision.fire) {
      chosenId = rulesPickId;
      reasoning = `Matched via local rules score: ${topScore} (AI policy: ${policyDecision.reason})`;
    } else {
      aiFired = true;
      aiFiredCount++;

      const reviewed = await AiDecisionReviewer.reviewCandidates(
        query,
        item,
        scoredRules,
        { aiMatchingEnabled: true, aiAssistLevel: 'balanced' }
      );
      chosenId = reviewed?.product?.id || reviewed?.id || null;
      reasoning = reviewed?.aiReasoning || `AI reviewed (policy reason: ${policyDecision.reason})`;

      if (chosenId !== rulesPickId) {
        aiChangedOutcomeCount++;
        if (chosenId === targetExpected) {
          aiChangedCorrectlyCount++;
        } else {
          aiChangedIncorrectlyCount++;
        }
      }
    }

    const isMatch = chosenId === targetExpected;
    if (isMatch) correctPicks++;

    console.log(`Fixture [${id}] "${query}":`);
    console.log(`  - Expected Pick: ${targetExpected}`);
    console.log(`  - Rules Pick:    ${rulesPickId} (score: ${topScore})`);
    console.log(`  - Final Pick:    ${chosenId} (AI fired: ${aiFired ? 'YES' : 'NO'})`);
    console.log(`  - Status:        ${isMatch ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  - Reasoning:     ${reasoning}\n`);

    results.push({
      id,
      query,
      expected: targetExpected,
      rulesPick: rulesPickId,
      chosen: chosenId,
      aiFired,
      policyReason: policyDecision.reason,
      status: isMatch ? 'pass' : 'fail',
      reasoning
    });
  }

  const accuracy = Number(((correctPicks / fixtures.length) * 100).toFixed(1));
  const rulesAccuracy = Number(((rulesCorrectPicks / fixtures.length) * 100).toFixed(1));
  const fireRate = Number(((aiFiredCount / fixtures.length) * 100).toFixed(1));
  const impactRate = aiFiredCount > 0 ? Number(((aiChangedOutcomeCount / aiFiredCount) * 100).toFixed(1)) : 0;
  const precision = aiChangedOutcomeCount > 0 ? Number(((aiChangedCorrectlyCount / aiChangedOutcomeCount) * 100).toFixed(1)) : 100;

  console.log('-------------------------------------------------------------------------------');
  console.log(`Final Accuracy:           ${correctPicks}/${fixtures.length} (${accuracy}%)`);
  console.log(`Deterministic Baseline:   ${rulesCorrectPicks}/${fixtures.length} (${rulesAccuracy}%)`);
  console.log(`AI Policy Evaluation:`);
  console.log(`  - AI Fire Rate:         ${aiFiredCount}/${fixtures.length} (${fireRate}%)`);
  console.log(`  - Changed Outcomes:     ${aiChangedOutcomeCount}/${aiFiredCount || 1} (${impactRate}%)`);
  console.log(`  - Correct Changes:      ${aiChangedCorrectlyCount}/${aiChangedOutcomeCount || 1} (${precision}%)`);
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
        rulesAccuracy,
        policyMetrics: {
          aiFiredCount,
          aiFireRate: `${fireRate}%`,
          aiChangedOutcomeCount,
          aiOutcomeImpactRate: `${impactRate}%`,
          aiChangedCorrectlyCount,
          aiChangedIncorrectlyCount,
          aiPolicyPrecision: `${precision}%`
        },
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
