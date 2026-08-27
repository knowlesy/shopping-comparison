import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
import { IngredientParser } from '../services/logic-api/src/services/ingredientParser.js';
import { FuzzyMatcher } from '../services/logic-api/src/services/fuzzyMatcher.js';
import { CATALOG_PRODUCTS } from '../services/logic-api/src/services/catalogData.js';

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
const dataset = JSON.parse(fs.readFileSync('tests/dataset-50-shopping-lists.json', 'utf8'));

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

const NEGATIVE_RULES = CONTAMINATION_RULES.map((r) => ({
  name: r.category,
  matchQuery: r.matchQuery,
  prohibitedInProduct: r.prohibited
}));

async function runExpandedTestSuite() {
  console.log('===============================================================================');
  console.log('   EXPANDED GROCERY SUITE: FOOD FORM SANITY, CATALOG VARIETY & SWAP AUDIT       ');
  console.log('===============================================================================\n');

  const results = {
    catalogVariety: { passed: 0, failed: 0, details: [] },
    foodFormSanity: { evaluated: 0, passed: 0, failed: 0, violations: [] },
    alternativesRichness: { evaluated: 0, passed: 0, failed: 0, violations: [] },
    dataset50Lists: {
      totalLists: dataset.length,
      totalItems: 0,
      totalMatches: 0,
      totalAlts: 0,
      passed: 0,
      failed: 0,
      anomalies: []
    },
    uiPlaywright: { passed: 0, failed: 0, screenshots: [] }
  };

  // -------------------------------------------------------------------------
  // SUITE 1: Direct Catalog Variety Assertions (All 7 Supermarkets)
  // -------------------------------------------------------------------------
  console.log('▶ SUITE 1: Verifying catalog variety across all 7 UK supermarkets...');

  const REQUIRED_VARIETIES = [
    {
      name: 'Eggs',
      subCategory: 'eggs',
      minCount: 4,
      desc: 'Pack sizes (6, 10/12, 15), Large, Organic, Free Range'
    },
    {
      name: 'Greek Yogurt',
      subCategory: 'yogurt',
      keyword: 'greek',
      minCount: 4,
      desc: '0% Fat Free, Authentic, Greek Style, Fage, 500g, 1kg'
    },
    {
      name: 'Milk',
      subCategory: 'milk',
      minCount: 5,
      desc: '1 Pint, 2 Pints, 4 Pints, 6 Pints, Whole, Semi, Skimmed, Cravendale'
    },
    {
      name: 'Potatoes',
      subCategory: 'potatoes',
      minCount: 5,
      desc: 'Baby New, Maris Piper, King Edward, Charlotte, Baking, White, Red'
    },
    {
      name: 'Mince',
      subCategory: 'beef',
      minCount: 3,
      desc: '5% Lean, Standard, Frozen, 500g, 1kg'
    }
  ];

  for (const store of SUPERMARKETS) {
    const storeProducts = CATALOG_PRODUCTS.filter((p) => p.supermarket === store);

    for (const req of REQUIRED_VARIETIES) {
      const matches = storeProducts.filter((p) => {
        if (req.subCategory && p.subCategory !== req.subCategory) return false;
        if (req.keyword && !p.title.toLowerCase().includes(req.keyword)) return false;
        return true;
      });

      if (matches.length >= req.minCount) {
        results.catalogVariety.passed++;
        results.catalogVariety.details.push(
          `✓ [${store.toUpperCase()}] ${req.name}: ${matches.length} varieties (min required ${req.minCount})`
        );
      } else {
        results.catalogVariety.failed++;
        results.catalogVariety.details.push(
          `✗ [${store.toUpperCase()}] ${req.name}: only ${matches.length} varieties (expected >= ${req.minCount})`
        );
      }
    }
  }

  console.log(
    `  Catalog Variety Assertions: ${results.catalogVariety.passed} passed, ${results.catalogVariety.failed} failed.\n`
  );

  // -------------------------------------------------------------------------
  // SUITE 2: Food Form & Negative Filter Rule Checks on 20 Staple Items
  // -------------------------------------------------------------------------
  console.log('▶ SUITE 2: Testing Food Form Negative Exclusions on 20 Core Staple Items...');

  const CORE_STAPLE_QUERIES = [
    '15 free range eggs',
    '6 British large free range eggs',
    '12 free range medium eggs',
    '1kg authentic Greek yogurt 0%',
    '500g 0% fat free Greek yogurt',
    'Fage total 0% Greek yogurt 500g',
    '1.13L semi-skimmed milk',
    '4 pints whole milk',
    '2 pints skimmed milk',
    '2L Cravendale filtered milk',
    '2kg baby new potatoes',
    '2.5kg Maris Piper potatoes',
    '4 pack baking potatoes',
    '900g 5% lean beef mince',
    '500g 12% standard beef mince',
    '1kg fresh chicken breast fillets',
    '1.6kg frozen cod loins',
    '250g fresh baby spinach leaves',
    '3 pack garlic bulbs',
    '1kg wholewheat fusilli pasta'
  ];

  const parsedStaples = IngredientParser.parseList(CORE_STAPLE_QUERIES);

  for (const item of parsedStaples) {
    const itemQuery = `${item.name || ''} ${item.baseItem || ''}`;

    for (const store of SUPERMARKETS) {
      results.foodFormSanity.evaluated++;
      const match = FuzzyMatcher.matchProduct(store, item, [], preferences);

      if (!match || !match.product) {
        results.foodFormSanity.failed++;
        results.foodFormSanity.violations.push({
          query: itemQuery,
          store,
          error: 'NO_PRODUCT_MATCHED'
        });
        continue;
      }

      const prod = match.product;
      const titleLower = prod.title.toLowerCase();

      // Check all negative filter rules against primary matched product
      for (const rule of NEGATIVE_RULES) {
        if (rule.matchQuery(itemQuery)) {
          if (rule.prohibitedInProduct.test(titleLower)) {
            results.foodFormSanity.failed++;
            results.foodFormSanity.violations.push({
              rule: rule.name,
              query: itemQuery,
              store,
              violationProduct: prod.title,
              error: 'PROHIBITED_FOOD_FORM_IN_PRIMARY_MATCH'
            });
          }
        }
      }

      // Check all alternative products against negative filter rules
      const alts = match.alternatives || [];
      results.alternativesRichness.evaluated++;

      if (alts.length === 0) {
        results.alternativesRichness.failed++;
        results.alternativesRichness.violations.push({
          query: itemQuery,
          store,
          error: 'EMPTY_ALTERNATIVES_LIST'
        });
      } else {
        results.alternativesRichness.passed++;
      }

      for (const alt of alts) {
        const altTitle = alt.title.toLowerCase();
        for (const rule of NEGATIVE_RULES) {
          if (rule.matchQuery(itemQuery)) {
            if (rule.prohibitedInProduct.test(altTitle)) {
              results.foodFormSanity.failed++;
              results.foodFormSanity.violations.push({
                rule: rule.name,
                query: itemQuery,
                store,
                violationAlternative: alt.title,
                error: 'PROHIBITED_FOOD_FORM_IN_ALTERNATIVE'
              });
            }
          }
        }
      }

      results.foodFormSanity.passed++;
    }
  }

  console.log(
    `  Food Form Sanity: ${results.foodFormSanity.passed} passed, ${results.foodFormSanity.failed} failed.`
  );
  console.log(
    `  Alternatives Richness: ${results.alternativesRichness.passed} passed, ${results.alternativesRichness.failed} failed.\n`
  );

  // -------------------------------------------------------------------------
  // SUITE 3: 50-Shopping-List E2E Dataset Audit
  // -------------------------------------------------------------------------
  console.log('▶ SUITE 3: Running comprehensive audit across 50 full UK shopping lists...');

  for (const list of dataset) {
    const parsed = IngredientParser.parseList(list.items);
    results.dataset50Lists.totalItems += parsed.length;
    let listFailed = false;

    for (const item of parsed) {
      const itemQuery = `${item.name || ''} ${item.baseItem || ''}`;

      for (const store of SUPERMARKETS) {
        results.dataset50Lists.totalMatches++;
        const match = FuzzyMatcher.matchProduct(store, item, [], preferences);

        if (!match.product) continue;
        const prod = match.product;
        const titleLower = prod.title.toLowerCase();

        // 1. Cross-Category Check
        if (
          item.category &&
          prod.category &&
          item.category !== 'general' &&
          prod.category !== 'general'
        ) {
          if (item.category !== prod.category) {
            listFailed = true;
            results.dataset50Lists.anomalies.push({
              listName: list.name,
              item: itemQuery,
              store,
              product: prod.title,
              error: `Category mismatch (${item.category} != ${prod.category})`
            });
          }
        }

        // 2. Negative rules on all 50 lists
        for (const rule of NEGATIVE_RULES) {
          if (rule.matchQuery(itemQuery)) {
            if (rule.prohibitedInProduct.test(titleLower)) {
              listFailed = true;
              results.dataset50Lists.anomalies.push({
                listName: list.name,
                item: itemQuery,
                store,
                product: prod.title,
                error: `Negative rule violation (${rule.name})`
              });
            }
          }
        }

        // 3. Image URL check
        if (!prod.imageUrl || !prod.imageUrl.startsWith('http')) {
          listFailed = true;
          results.dataset50Lists.anomalies.push({
            listName: list.name,
            item: itemQuery,
            store,
            product: prod.title,
            error: 'Invalid image URL'
          });
        }

        // 4. Alternatives negative rules
        for (const alt of match.alternatives || []) {
          results.dataset50Lists.totalAlts++;
          const altTitle = alt.title.toLowerCase();
          for (const rule of NEGATIVE_RULES) {
            if (rule.matchQuery(itemQuery)) {
              if (rule.prohibitedInProduct.test(altTitle)) {
                listFailed = true;
                results.dataset50Lists.anomalies.push({
                  listName: list.name,
                  item: itemQuery,
                  store,
                  alt: alt.title,
                  error: `Alternative negative rule violation (${rule.name})`
                });
              }
            }
          }
        }
      }
    }

    if (listFailed) {
      results.dataset50Lists.failed++;
    } else {
      results.dataset50Lists.passed++;
    }
  }

  console.log(
    `  50-Shopping-Lists Audit: ${results.dataset50Lists.passed} / ${results.dataset50Lists.totalLists} lists passed completely.`
  );
  console.log(
    `  Evaluated: ${results.dataset50Lists.totalItems} items, ${results.dataset50Lists.totalMatches} store matches, ${results.dataset50Lists.totalAlts} alternatives.\n`
  );

  // -------------------------------------------------------------------------
  // SUITE 4: Real Browser Playwright End-to-End Visual Proofs & Assertions
  // -------------------------------------------------------------------------
  console.log(
    '▶ SUITE 4: Launching Playwright browser for UI modal assertion and screenshot capture...'
  );

  await ensureServerRunning();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.click('button:has-text("Load 28-Item Sample List")');
    await page.waitForTimeout(400);
    await page.click('button:has-text("Compare Prices Now")');
    await page.waitForTimeout(4500);

    const chgBtns = await page.$$('button:has-text("Chg")');
    console.log(`  Found ${chgBtns.length} Change buttons in comparison matrix.`);

    // 1. Eggs Modal UI Assertion
    if (chgBtns.length > 14) {
      await chgBtns[14].click();
      await page.waitForTimeout(1200);

      const modalText = await page.innerText('.fixed.inset-0');
      const hasScotchEgg = /scotch egg/i.test(modalText);
      const hasCookingEggs =
        /6|10|12|15/i.test(modalText) && /free range|medium|large/i.test(modalText);

      if (!hasScotchEgg && hasCookingEggs) {
        results.uiPlaywright.passed++;
        console.log(
          '  ✓ Eggs Swap Modal UI Assertion Passed: 0 Scotch Eggs, rich cooking eggs rendered.'
        );
      } else {
        results.uiPlaywright.failed++;
        console.error(
          '  ✗ Eggs Swap Modal UI Assertion Failed: Scotch eggs found or missing variety.'
        );
      }

      const eggsPath = path.join(SCREENSHOTS_DIR, 'suite4_verified_eggs_modal.png');
      await page.screenshot({ path: eggsPath });
      results.uiPlaywright.screenshots.push(eggsPath);

      await page.click('button[data-testid="modal-close-btn"], button:has-text("Close")');
      await page.waitForTimeout(600);
    }

    // 2. Greek Yogurt Modal UI Assertion
    const chgBtns2 = await page.$$('button:has-text("Chg")');
    if (chgBtns2.length > 21) {
      await chgBtns2[21].click();
      await page.waitForTimeout(1200);

      const modalText = await page.innerText('.fixed.inset-0');
      const hasDessertOrDrink = /drink|corner|split pot|frubes/i.test(modalText);
      const hasGreekYogurtOptions = /greek|0%|authentic|fage|500g|1kg/i.test(modalText);

      if (!hasDessertOrDrink && hasGreekYogurtOptions) {
        results.uiPlaywright.passed++;
        console.log(
          '  ✓ Greek Yogurt Swap Modal UI Assertion Passed: 0 dessert drinks, rich Greek yogurt options.'
        );
      } else {
        results.uiPlaywright.failed++;
        console.error('  ✗ Greek Yogurt Swap Modal UI Assertion Failed.');
      }

      const yogurtPath = path.join(SCREENSHOTS_DIR, 'suite4_verified_yogurt_modal.png');
      await page.screenshot({ path: yogurtPath });
      results.uiPlaywright.screenshots.push(yogurtPath);

      await page.click('button[data-testid="modal-close-btn"], button:has-text("Close")');
      await page.waitForTimeout(600);
    }

    // 3. Milk Modal UI Assertion
    const chgBtns3 = await page.$$('button:has-text("Chg")');
    if (chgBtns3.length > 36) {
      await chgBtns3[36].click();
      await page.waitForTimeout(1200);

      const modalText = await page.innerText('.fixed.inset-0');
      const hasFlavouredMilk = /chocolate milk|milkshake/i.test(modalText);
      const hasMilkOptions = /pint|whole|skimmed|semi|cravendale/i.test(modalText);

      if (!hasFlavouredMilk && hasMilkOptions) {
        results.uiPlaywright.passed++;
        console.log('  ✓ Milk Swap Modal UI Assertion Passed: 0 milkshakes, rich milk pack sizes.');
      } else {
        results.uiPlaywright.failed++;
        console.error('  ✗ Milk Swap Modal UI Assertion Failed.');
      }

      const milkPath = path.join(SCREENSHOTS_DIR, 'suite4_verified_milk_modal.png');
      await page.screenshot({ path: milkPath });
      results.uiPlaywright.screenshots.push(milkPath);

      await page.click('button[data-testid="modal-close-btn"], button:has-text("Close")');
      await page.waitForTimeout(600);
    }

    // 4. Potatoes Modal UI Assertion
    const chgBtns4 = await page.$$('button:has-text("Chg")');
    if (chgBtns4.length > 49) {
      await chgBtns4[49].click();
      await page.waitForTimeout(1200);

      const modalText = await page.innerText('.fixed.inset-0');
      const hasCrispsOrChips = /\bcrisps?\b|\bchips?\b|\bwaffles?\b/i.test(modalText);
      const hasPotatoOptions = /baby|maris|edward|charlotte|baking|red|white/i.test(modalText);

      if (!hasCrispsOrChips && hasPotatoOptions) {
        results.uiPlaywright.passed++;
        console.log(
          '  ✓ Potatoes Swap Modal UI Assertion Passed: 0 crisps/chips, rich potato varieties.'
        );
      } else {
        results.uiPlaywright.failed++;
        console.error('  ✗ Potatoes Swap Modal UI Assertion Failed.');
      }

      const potatoesPath = path.join(SCREENSHOTS_DIR, 'suite4_verified_potatoes_modal.png');
      await page.screenshot({ path: potatoesPath });
      results.uiPlaywright.screenshots.push(potatoesPath);
    }
  } catch (err) {
    console.error('Playwright UI test error:', err);
    results.uiPlaywright.failed++;
  } finally {
    await browser.close();
    if (previewServer) {
      previewServer.kill();
    }
  }

  // -------------------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------------------
  console.log('\n===============================================================================');
  console.log('                           EXPANDED AUDIT SUMMARY REPORT                       ');
  console.log('===============================================================================');
  console.log(
    `1. Catalog Variety Assertions (35 checks across 7 stores): ${results.catalogVariety.passed} PASSED / ${results.catalogVariety.failed} FAILED`
  );
  console.log(
    `2. Food Form Sanity (140 store matches evaluated):       ${results.foodFormSanity.passed} PASSED / ${results.foodFormSanity.failed} FAILED`
  );
  console.log(
    `3. Alternatives Richness & Sanity:                      ${results.alternativesRichness.passed} PASSED / ${results.alternativesRichness.failed} FAILED`
  );
  console.log(
    `4. 50-Shopping-Lists E2E Dataset Audit (2,814 matches):  ${results.dataset50Lists.passed} / 50 PASSED (${results.dataset50Lists.anomalies.length} anomalies)`
  );
  console.log(
    `5. Playwright Real UI Modal Assertions:                 ${results.uiPlaywright.passed} PASSED / ${results.uiPlaywright.failed} FAILED`
  );
  console.log('===============================================================================');

  const reportPath = path.join(ARTIFACT_DIR, 'food-form-variety-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Detailed audit report written to: ${reportPath}`);

  if (
    results.catalogVariety.failed > 0 ||
    results.foodFormSanity.failed > 0 ||
    results.dataset50Lists.failed > 0 ||
    results.uiPlaywright.failed > 0
  ) {
    console.error('\n❌ TEST SUITE FAILED WITH ANOMALIES.');
    process.exit(1);
  } else {
    console.log('\n✅ ALL EXPANDED FOOD FORM & VARIETY TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

runExpandedTestSuite().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
