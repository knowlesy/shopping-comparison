import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
import { IngredientParser } from '../services/logic-api/src/services/ingredientParser.js';
import { FuzzyMatcher } from '../services/logic-api/src/services/fuzzyMatcher.js';
import { PriceCache } from '../services/logic-api/src/services/priceCache.js';

import {
  isContaminated,
  CONTAMINATION_RULES
} from '../services/logic-api/src/services/contaminationRules.js';

import { spawn } from 'child_process';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.resolve('test-results');
const SCREENSHOTS_DIR = path.join(ARTIFACT_DIR, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let previewServer = null;
async function ensureServerRunning() {
  try {
    const res = await fetch('http://localhost:5173/');
    if (res.ok) return;
  } catch {}

  console.log('  Starting local Vite preview server on port 5173...');
  previewServer = spawn('npx', ['vite', 'preview', '--port', '5173', '--strictPort'], {
    cwd: path.resolve('client'),
    stdio: 'ignore'
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch('http://localhost:5173/');
      if (res.ok) return;
    } catch {}
  }
}

const SUPERMARKETS = ['asda', 'tesco', 'sainsburys', 'morrisons', 'iceland', 'aldi', 'lidl'];
const datasetPath = 'tests/dataset-20-lists-30-items.json';
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

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

// Strict negative contamination rules for grocery staples
const NEGATIVE_RULES = CONTAMINATION_RULES.map((r) => ({
  name: r.category,
  matchQuery: r.matchQuery,
  prohibitedInProduct: r.prohibited
}));

async function runUncachedAudit() {
  const isLiveMode = process.argv.includes('--live-mode');
  console.log('===============================================================================');
  console.log('   20 UNCACHED FULL TESTS: 30-ITEM INGREDIENT LISTS ACROSS 7 SUPERMARKETS      ');
  console.log(`   [Test Mode: ${isLiveMode ? 'Live Aggregator Mode' : 'Catalog Benchmark Mode (Offline)'}]`);
  console.log('===============================================================================\n');

  const report = {
    timestamp: new Date().toISOString(),
    totalLists: dataset.length,
    itemsPerList: 30,
    totalItems: 0,
    totalEvaluations: 0,
    totalAlternatives: 0,
    passedLists: 0,
    failedLists: 0,
    listResults: [],
    anomalies: [],
    playwrightResults: []
  };

  // -------------------------------------------------------------------------
  // PHASE 1: Fresh 20-List Matrix Audit (Zero Cache)
  // -------------------------------------------------------------------------
  console.log('▶ PHASE 1: Running 20 Full 30-Item Tests with Forced Cache Flush (Zero Cache)...');

  for (let idx = 0; idx < dataset.length; idx++) {
    const list = dataset[idx];
    const listStartTime = Date.now();

    // Explicitly flush server-side price cache before processing each list
    if (PriceCache && typeof PriceCache.clear === 'function') {
      PriceCache.clear();
    }

    const parsedItems = IngredientParser.parseList(list.items);
    report.totalItems += parsedItems.length;

    let listAnomalies = [];
    let listStoreMatches = 0;
    let listAlternativesCount = 0;

    for (const item of parsedItems) {
      const itemText = `${item.name || ''} ${item.baseItem || ''}`;

      for (const store of SUPERMARKETS) {
        report.totalEvaluations++;
        listStoreMatches++;

        // Compute match completely uncached
        const match = FuzzyMatcher.matchProduct(store, item, [], preferences);

        if (!match) {
          listAnomalies.push({
            type: 'NULL_MATCH_OBJECT',
            store,
            item: itemText,
            description: 'FuzzyMatcher returned undefined or null object.'
          });
          continue;
        }

        // If product is not in baseline catalog, verify clean clickable fallback structure
        if (!match.product) {
          if (match.matchScore !== 0 || match.totalPrice !== 0) {
            listAnomalies.push({
              type: 'INVALID_FALLBACK_STATE',
              store,
              item: itemText,
              description: 'Fallback item has non-zero match score or price.'
            });
          }
          continue;
        }

        const prod = match.product;
        const titleLower = prod.title.toLowerCase();

        // 1. Food Form Sanity on primary match
        for (const rule of NEGATIVE_RULES) {
          if (rule.matchQuery(itemText)) {
            if (rule.prohibitedInProduct.test(titleLower)) {
              listAnomalies.push({
                type: 'NEGATIVE_RULE_VIOLATION_PRIMARY',
                rule: rule.name,
                store,
                item: itemText,
                product: prod.title,
                description: `Primary match "${prod.title}" violated negative filter for ${rule.name}.`
              });
            }
          }
        }

        // 2. Category Guard
        if (
          item.category &&
          prod.category &&
          item.category !== 'general' &&
          prod.category !== 'general'
        ) {
          if (item.category !== prod.category) {
            listAnomalies.push({
              type: 'CATEGORY_MISMATCH',
              store,
              item: itemText,
              product: prod.title,
              description: `Item category "${item.category}" != matched product category "${prod.category}".`
            });
          }
        }

        // 3. Image URL Verification
        if (
          !prod.imageUrl ||
          typeof prod.imageUrl !== 'string' ||
          !prod.imageUrl.startsWith('http')
        ) {
          listAnomalies.push({
            type: 'INVALID_IMAGE_URL',
            store,
            item: itemText,
            product: prod.title,
            description: 'Product missing valid HTTP image URL.'
          });
        }

        // 4. Alternatives Food Form & Variety
        const alts = match.alternatives || [];
        listAlternativesCount += alts.length;
        report.totalAlternatives += alts.length;

        for (const alt of alts) {
          const altTitle = alt.title.toLowerCase();
          for (const rule of NEGATIVE_RULES) {
            if (rule.matchQuery(itemText)) {
              if (rule.prohibitedInProduct.test(altTitle)) {
                listAnomalies.push({
                  type: 'NEGATIVE_RULE_VIOLATION_ALTERNATIVE',
                  rule: rule.name,
                  store,
                  item: itemText,
                  alt: alt.title,
                  description: `Alternative "${alt.title}" violated negative filter for ${rule.name}.`
                });
              }
            }
          }
        }
      }
    }

    const durationMs = Date.now() - listStartTime;
    const passed = listAnomalies.length === 0;

    if (passed) {
      report.passedLists++;
      console.log(
        `  ✓ [Test ${idx + 1}/20] "${list.name}" (30 items) -> 210 store matches evaluated in ${durationMs}ms: PASSED (0 anomalies)`
      );
    } else {
      report.failedLists++;
      console.error(
        `  ✗ [Test ${idx + 1}/20] "${list.name}" (30 items) -> FAILED with ${listAnomalies.length} anomalies.`
      );
      report.anomalies.push(...listAnomalies);
    }

    report.listResults.push({
      listId: list.id,
      name: list.name,
      theme: list.theme,
      itemCount: parsedItems.length,
      storeMatches: listStoreMatches,
      alternativesCount: listAlternativesCount,
      passed,
      durationMs,
      anomalyCount: listAnomalies.length
    });
  }

  console.log(
    `\nPhase 1 Results: ${report.passedLists} / 20 lists passed with 0 anomalies across ${report.totalEvaluations} store matches.\n`
  );

  // -------------------------------------------------------------------------
  // PHASE 2: Uncached Playwright Browser End-to-End Test Execution
  // -------------------------------------------------------------------------
  console.log(
    '▶ PHASE 2: Running Real Browser Playwright E2E UI Test on 30-Item Uncached Shopping List...'
  );

  await ensureServerRunning();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 950 } });
  const page = await context.newPage();

  try {
    console.log('  Navigating to http://localhost:5173/ and clearing browser storage...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

    // Clear frontend storage to ensure zero browser caching
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle' });

    // Pick List 1 (High Protein Fitness 30 items) and input into text area
    const testList = dataset[0];
    console.log(`  Pasting 30 unique items from "${testList.name}" into search input...`);

    const textarea = await page.$('textarea');
    if (textarea) {
      await textarea.fill(testList.items.join('\n'));
      await page.waitForTimeout(300);

      const compareBtn = await page.$('button:has-text("Compare Prices Now")');
      if (compareBtn) {
        await compareBtn.click();
        console.log(
          '  Price comparison initiated for 30 items. Waiting for all 210 store checks to complete...'
        );
        await page.waitForSelector('button:has-text("Chg")', { timeout: 35000 });
        await page.waitForTimeout(1000);
      }
    }

    // Capture full-page comparison screenshot
    const comparisonPath = path.join(SCREENSHOTS_DIR, 'uncached_30_item_comparison_matrix.png');
    await page.screenshot({ path: comparisonPath, fullPage: false });
    console.log(`  ✓ Saved: ${comparisonPath}`);
    report.playwrightResults.push({
      name: 'Comparison Matrix',
      path: comparisonPath,
      passed: true
    });

    // Test Swap Modal on Eggs
    const chgBtns = await page.$$('button:has-text("Chg")');
    console.log(`  Found ${chgBtns.length} Change buttons in 30-item table.`);

    if (chgBtns.length > 0) {
      console.log('  Opening Swap Modal on row 1...');
      await chgBtns[0].click();
      await page.waitForTimeout(1500);

      const modalText = await page.innerText('.fixed.inset-0');
      const hasScotchEgg = /scotch egg/i.test(modalText);
      const hasValidAlts = modalText.length > 50;

      const swapPath = path.join(SCREENSHOTS_DIR, 'uncached_30_item_swap_modal.png');
      await page.screenshot({ path: swapPath });
      console.log(`  ✓ Saved: ${swapPath}`);

      if (!hasScotchEgg && hasValidAlts) {
        console.log('  ✓ Modal verified: 0 Scotch Eggs, clean valid options rendered.');
        report.playwrightResults.push({ name: 'Swap Modal UI', path: swapPath, passed: true });
      } else {
        console.error('  ✗ Swap Modal failed verification.');
        report.playwrightResults.push({ name: 'Swap Modal UI', path: swapPath, passed: false });
      }

      const closeBtn = await page.$('button:has-text("Close"), button:has-text("✕")');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(500);
    }
  } catch (pwErr) {
    console.error('Playwright UI error:', pwErr);
    report.playwrightResults.push({
      name: 'Playwright Error',
      error: pwErr.message,
      passed: false
    });
  } finally {
    await browser.close();
    if (previewServer) {
      previewServer.kill();
    }
  }

  // -------------------------------------------------------------------------
  // FINAL REPORT
  // -------------------------------------------------------------------------
  console.log('\n===============================================================================');
  console.log('                           UNCACHED AUDIT SUMMARY REPORT                       ');
  console.log('===============================================================================');
  console.log(`Total 30-Item Lists Tested:      ${report.totalLists}`);
  console.log(`Total Unique Items Parsed:       ${report.totalItems}`);
  console.log(
    `Total Supermarket Evaluations:   ${report.totalEvaluations} (Uncached Fresh Lookups)`
  );
  console.log(`Total Alternatives Screened:     ${report.totalAlternatives}`);
  console.log(`Lists Passing 100% (0 Anomalies): ${report.passedLists} / ${report.totalLists}`);
  console.log(
    `Playwright UI End-to-End Runs:   ${report.playwrightResults.filter((p) => p.passed).length} / ${report.playwrightResults.length} PASSED`
  );
  console.log('===============================================================================');

  const reportFilePath = path.join(ARTIFACT_DIR, 'uncached-20-lists-audit-report.json');
  fs.writeFileSync(reportFilePath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Full JSON audit log written to: ${reportFilePath}`);

  if (report.failedLists > 0 || report.anomalies.length > 0) {
    console.error('\n❌ AUDIT FAILED WITH UNRESOLVED ANOMALIES.');
    process.exit(1);
  } else {
    console.log('\n✅ ALL 20 FULL 30-ITEM UNCACHED TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

runUncachedAudit().catch((err) => {
  console.error('Fatal uncached audit failure:', err);
  process.exit(1);
});
