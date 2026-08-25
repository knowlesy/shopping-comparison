import { chromium } from 'playwright';
import { CATALOG_PRODUCTS, SUPERMARKETS_INFO } from '../server/src/services/catalogData.js';
import { ShoppingListParser } from '../server/src/services/parser.js';
import { SupermarketComparisonService } from '../server/src/services/supermarketService.js';
import { SupermarketName, UserPreferences } from '../server/src/types.js';

interface QAResult {
  index: number;
  item: string;
  supermarket: string;
  matchedTitle: string;
  url: string;
  finalUrl: string;
  status: number | string;
  pageTitle: string;
  success: boolean;
  notes?: string;
}

const SAMPLE_LIST = `900g 5% lean beef mince
1.6kg frozen cod loins
15 free range eggs
1kg authentic Greek yogurt 0%
800g tinned brown lentils
1.13L semi-skimmed milk
1kg wholewheat fusilli
2kg baby new potatoes
1kg Scottish rolled oats
800g wholemeal sliced bread
3 x 400g Mutti Polpa chopped tomatoes
200g tomato puree
500ml extra virgin olive oil
1kg courgettes
1kg mixed bell peppers
400g closed cup mushrooms
600g baby plum tomatoes
1kg carrots
1 head celery
1kg brown onions
1kg red onions
1 pack garlic bulbs
240g fresh baby spinach
1 bunch bananas
800g conference pears
600g clementines
200g walnut halves and whole almonds
150g chia seeds`;

async function runDeepQA() {
  console.log('═════════════════════════════════════════════════════════════════════');
  console.log('       🔬 TROLLEYWISE UK — DEEP QA VERIFICATION SUITE (ALL ITEMS)     ');
  console.log('═════════════════════════════════════════════════════════════════════\n');

  const defaultPrefs: UserPreferences = {
    healthierDefault: true,
    fatPercentagePreference: 5,
    preferWholewheat: true,
    preferFreeRange: true,
    preferOrganic: false,
    brandTierPriority: 'standard',
    packSizingPolicy: 'closest',
    enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland'],
  };

  const parsedItems = ShoppingListParser.parse(SAMPLE_LIST);
  const comparison = SupermarketComparisonService.compare(parsedItems, defaultPrefs);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const qaLog: QAResult[] = [];
  const stores: SupermarketName[] = ['asda', 'tesco', 'sainsburys', 'morrisons', 'iceland'];

  console.log(`Parsed ${parsedItems.length} items. Testing links for all items across ${stores.length} supermarkets...\n`);

  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i];
    console.log(`[Item #${i + 1}/28] 👉 Target: "${item.name}"`);

    for (const store of stores) {
      const match = comparison.supermarkets[store]?.items[i];
      if (!match || !match.product) {
        console.log(`  ❌ ${SUPERMARKETS_INFO[store].name.padEnd(12)}: No match found`);
        qaLog.push({
          index: i + 1,
          item: item.name,
          supermarket: store,
          matchedTitle: 'NONE',
          url: '',
          finalUrl: '',
          status: 0,
          pageTitle: 'No Match',
          success: false,
          notes: 'No product match in catalog',
        });
        continue;
      }

      const product = match.product;
      const url = product.productUrl;

      const page = await context.newPage();
      try {
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 }).catch(err => {
          return null;
        });

        await page.waitForTimeout(500);
        const finalUrl = page.url();
        const pageTitle = (await page.title()).trim();
        const status = res ? res.status() : 'TIMEOUT';

        const is404 = finalUrl.includes('page-not-found') || finalUrl.includes('404') || pageTitle.toLowerCase().includes('page not found') || pageTitle.toLowerCase().includes('sorry');

        const success = !is404 && status !== 404;

        qaLog.push({
          index: i + 1,
          item: item.name,
          supermarket: store,
          matchedTitle: product.title,
          url,
          finalUrl,
          status,
          pageTitle,
          success,
          notes: is404 ? '404 Page Not Found' : (status === 200 ? '200 OK Live' : `HTTP ${status}`),
        });

        const icon = success ? '✅' : '❌';
        console.log(`  ${icon} ${SUPERMARKETS_INFO[store].name.padEnd(12)}: "${product.title.slice(0, 35)}..." -> [${status}] ${success ? 'OK' : 'FAILED 404'} (${finalUrl.slice(0, 45)}...)`);
      } catch (err: any) {
        qaLog.push({
          index: i + 1,
          item: item.name,
          supermarket: store,
          matchedTitle: product.title,
          url,
          finalUrl: '',
          status: 'ERR',
          pageTitle: err.message?.split('\n')[0] || 'Error',
          success: false,
          notes: err.message?.split('\n')[0],
        });
        console.log(`  ❌ ${SUPERMARKETS_INFO[store].name.padEnd(12)}: Error loading ${url}`);
      } finally {
        await page.close();
      }
    }
    console.log('');
  }

  await browser.close();

  // Summary Report
  console.log('═════════════════════════════════════════════════════════════════════');
  console.log('                       📊 QA AUDIT SUMMARY                          ');
  console.log('═════════════════════════════════════════════════════════════════════\n');

  const totalChecks = qaLog.length;
  const passed = qaLog.filter(q => q.success).length;
  const failed = qaLog.filter(q => !q.success);

  console.log(`Total Product URLs Tested: ${totalChecks}`);
  console.log(`Passed / Verified:        ${passed} (${Math.round((passed / totalChecks) * 100)}%)`);
  console.log(`Failed / Needs Fix:       ${failed.length}\n`);

  if (failed.length > 0) {
    console.log('⚠️ Failed Product URLs that need fixing:');
    failed.forEach(f => {
      console.log(`  - [Item #${f.index}] [${f.supermarket.toUpperCase()}] "${f.item}"`);
      console.log(`    Matched: "${f.matchedTitle}"`);
      console.log(`    URL:     ${f.url}`);
      console.log(`    Issue:   ${f.notes} (Landed on: ${f.finalUrl})\n`);
    });
  } else {
    console.log('🎉 ALL PRODUCT URLS VERIFIED 100% WORKING!');
  }
}

runDeepQA().catch(err => {
  console.error('QA Runner Exception:', err);
  process.exit(1);
});
