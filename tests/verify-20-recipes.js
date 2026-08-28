import fs from 'fs';
import path from 'path';
import { IngredientParser } from '../services/logic-api/src/services/ingredientParser.js';
import { FuzzyMatcher } from '../services/logic-api/src/services/fuzzyMatcher.js';
import { BasketCalculator } from '../services/logic-api/src/services/basketCalculator.js';
import { isContaminated, CONTAMINATION_RULES } from '../services/logic-api/src/services/contaminationRules.js';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.resolve('test-results');
const REPORT_PATH = path.join(ARTIFACT_DIR, 'recipes-verification-report.json');

const SUPERMARKETS = ['asda', 'tesco', 'sainsburys', 'morrisons', 'iceland', 'aldi', 'lidl'];
const datasetPath = 'tests/dataset-20-recipes.json';
const recipes = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

const preferences = {
  healthierDefault: true,
  fatPercentagePreference: 5,
  preferWholewheat: true,
  preferFreeRange: true,
  preferOrganic: false,
  brandTierPriority: 'standard',
  packSizingPolicy: 'closest',
  enabledSupermarkets: SUPERMARKETS
};

async function runRecipesVerification() {
  const isCatalogMode = process.argv.includes('--catalog-mode');
  const isLiveMode = process.argv.includes('--live-mode');

  if (isCatalogMode) {
    console.log('===============================================================================');
    console.log('   ⚠️ RUNNING IN CATALOG/ESTIMATED BENCHMARK MODE (--catalog-mode)            ');
    console.log('   Offline evaluation using estimated benchmark catalog data.                  ');
    console.log('===============================================================================\n');
  } else {
    console.log('===============================================================================');
    console.log('   20 UNIQUE RECIPE LISTS VERIFICATION & CONTAMINATION AUDIT SUITE             ');
    console.log(`   [Test Mode: ${isLiveMode ? 'Live Aggregator Mode' : 'Standard Mode (Requires Live API)'}]`);
    console.log('===============================================================================\n');
  }

  const report = {
    totalRecipes: recipes.length,
    totalIngredients: 0,
    totalStoreEvaluations: 0,
    passedRecipes: 0,
    failedRecipes: 0,
    contaminationViolations: [],
    pricingAnomalies: [],
    apiVerification: { totalHits: 0, passedHits: 0, failedHits: 0, errors: [] },
    recipeDetails: []
  };

  let totalItemsCount = 0;

  for (let rIdx = 0; rIdx < recipes.length; rIdx++) {
    const recipe = recipes[rIdx];
    const parsedItems = IngredientParser.parseList(recipe.items);
    totalItemsCount += parsedItems.length;

    const recipeResult = {
      index: rIdx + 1,
      id: recipe.id,
      title: recipe.title,
      cuisine: recipe.cuisine,
      servings: recipe.servings,
      itemCount: parsedItems.length,
      storeStats: {},
      cheapestStore: null,
      cheapestTotal: 0,
      splitCombinedTotal: 0,
      splitSavings: 0,
      anomalies: []
    };

    const storeMatchesMap = {};
    for (const store of SUPERMARKETS) {
      storeMatchesMap[store] = [];
      let foundCount = 0;

      for (const item of parsedItems) {
        report.totalStoreEvaluations++;
        const match = FuzzyMatcher.matchProduct(store, item, [], preferences);
        storeMatchesMap[store].push(match);

        if (match.product) {
          foundCount++;

          // 1. Contamination Check
          const prodTitle = match.product.title;
          const queryText = item.rawText || item.name;

          if (isContaminated(queryText, prodTitle)) {
            const violation = {
              recipe: recipe.title,
              item: queryText,
              store,
              matchedProduct: prodTitle,
              reason: 'Contamination rule tripped'
            };
            report.contaminationViolations.push(violation);
            recipeResult.anomalies.push(`[Contamination] ${store.toUpperCase()}: "${queryText}" matched contaminated item "${prodTitle}"`);
          }

          // Also check alternatives
          if (match.alternatives && match.alternatives.length > 0) {
            for (const alt of match.alternatives) {
              if (isContaminated(queryText, alt.title)) {
                report.contaminationViolations.push({
                  recipe: recipe.title,
                  item: queryText,
                  store,
                  matchedProduct: alt.title,
                  reason: 'Contamination in alternatives'
                });
                recipeResult.anomalies.push(`[Alt Contamination] ${store.toUpperCase()}: "${queryText}" alternative "${alt.title}" is contaminated`);
              }
            }
          }

          // 2. Price Sanity Check
          if (match.totalPrice <= 0 || isNaN(match.totalPrice) || match.packsNeeded <= 0) {
            const anomaly = {
              recipe: recipe.title,
              item: queryText,
              store,
              totalPrice: match.totalPrice,
              packsNeeded: match.packsNeeded
            };
            report.pricingAnomalies.push(anomaly);
            recipeResult.anomalies.push(`[Price Anomaly] ${store.toUpperCase()}: Invalid price £${match.totalPrice} or packs ${match.packsNeeded}`);
          }
        }
      }

      recipeResult.storeStats[store] = {
        found: foundCount,
        coverage: Math.round((foundCount / parsedItems.length) * 100)
      };
    }

    // Basket Calculation Verification
    const comparison = BasketCalculator.computeComparison(parsedItems, storeMatchesMap, SUPERMARKETS);
    recipeResult.cheapestStore = comparison.cheapestStore;
    recipeResult.cheapestTotal = comparison.supermarkets[comparison.cheapestStore]?.totalPrice || 0;
    recipeResult.splitCombinedTotal = comparison.splitOptimization?.combinedTotal || 0;
    recipeResult.splitSavings = comparison.splitOptimization?.savingsVsSingleBest || 0;

    // Live API Endpoint Verification
    try {
      const apiResponse = await fetch('http://localhost:3001/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: recipe.items.map(name => ({ name })),
          preferences
        })
      });

      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        report.apiVerification.totalHits++;
        if (apiData.supermarkets && Object.keys(apiData.supermarkets).length > 0 && apiData.cheapestStore) {
          report.apiVerification.passedHits++;
        } else {
          report.apiVerification.failedHits++;
          report.apiVerification.errors.push(`Recipe "${recipe.title}" API response missing supermarkets or cheapestStore.`);
        }
      } else {
        report.apiVerification.totalHits++;
        report.apiVerification.failedHits++;
        report.apiVerification.errors.push(`Recipe "${recipe.title}" API HTTP status ${apiResponse.status}`);
      }
    } catch (apiErr) {
      report.apiVerification.totalHits++;
      report.apiVerification.failedHits++;
      report.apiVerification.errors.push(`Recipe "${recipe.title}" API request error: ${apiErr.message}`);
    }

    if (recipeResult.anomalies.length === 0) {
      report.passedRecipes++;
      console.log(`  ✓ [Recipe ${rIdx + 1}/20] "${recipe.title}" (${parsedItems.length} items, ${recipe.cuisine}): PASSED — Cheapest: ${comparison.cheapestStore.toUpperCase()} (£${recipeResult.cheapestTotal.toFixed(2)}), Split saves £${recipeResult.splitSavings.toFixed(2)}`);
    } else {
      report.failedRecipes++;
      console.log(`  ✗ [Recipe ${rIdx + 1}/20] "${recipe.title}": FAILED (${recipeResult.anomalies.length} anomalies)`);
      for (const a of recipeResult.anomalies) {
        console.log(`     -> ${a}`);
      }
    }

    report.recipeDetails.push(recipeResult);
  }

  report.totalIngredients = totalItemsCount;

  console.log('\n===============================================================================');
  console.log('                       RECIPE VERIFICATION SUMMARY REPORT                      ');
  console.log('===============================================================================');
  console.log(`Total Unique Recipes Tested:      ${report.totalRecipes}`);
  console.log(`Total Ingredients Evaluated:      ${report.totalIngredients}`);
  console.log(`Total Supermarket Evaluations:    ${report.totalStoreEvaluations}`);
  console.log(`Recipes Passed (0 Anomalies):     ${report.passedRecipes} / ${report.totalRecipes} (${Math.round((report.passedRecipes / report.totalRecipes) * 100)}%)`);
  console.log(`Contamination Violations:         ${report.contaminationViolations.length}`);
  console.log(`Pricing Anomalies:                ${report.pricingAnomalies.length}`);
  console.log(`Live API Hits Verified:           ${report.apiVerification.passedHits} / ${report.apiVerification.totalHits}`);
  console.log('===============================================================================\n');

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Full JSON report saved to: ${REPORT_PATH}\n`);

  if (report.failedRecipes > 0 || report.contaminationViolations.length > 0 || report.pricingAnomalies.length > 0) {
    console.error('❌ Recipe verification detected issues that need fixing.');
    process.exit(1);
  } else if (!isCatalogMode && report.apiVerification.passedHits === 0) {
    console.error('❌ FAIL: Live API hits = 0 and --catalog-mode was not specified. Run with --catalog-mode for offline estimated benchmark runs.');
    process.exit(1);
  } else {
    console.log('✅ ALL 20 UNIQUE RECIPES PASSED WITH ZERO ANOMALIES & ZERO CONTAMINATION!');
    process.exit(0);
  }
}

runRecipesVerification().catch(err => {
  console.error('Fatal recipe verification runner error:', err);
  process.exit(1);
});
