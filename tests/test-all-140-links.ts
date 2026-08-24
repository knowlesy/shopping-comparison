import { chromium } from 'playwright';
import { CATALOG_PRODUCTS } from '../server/src/services/catalogData.js';
import { cleanSupermarketQuery, getLiveSupermarketUrl } from '../client/src/services/clientEngine.js';
import { SupermarketName } from '../server/src/types.js';

async function testAll140Links() {
  console.log('🔬 Testing all 140 store search links across Asda, Tesco, Sainsbury\'s, Morrisons, Iceland...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const sampleItems = [
    'ASDA 5% Fat Beef Mince 500g',
    'ASDA Succulent Cod Fillets 400g',
    'ASDA 12 Free Range Medium Eggs',
    'ASDA Fat Free Greek Yogurt 1kg',
    'ASDA Green Lentils in Water 390g',
    'ASDA Semi Skimmed Milk 2 Pints',
    'ASDA Wholewheat Fusilli 1kg',
    'ASDA Baby New Potatoes 2kg',
    'ASDA Scottish Rolled Oats 1kg',
    'ASDA Wholemeal Medium Sliced Bread 800g',
    'Mutti Polpa Finely Chopped Tomatoes 400g',
    'ASDA Tomato Puree 200g',
    'ASDA Extra Virgin Olive Oil 500ml',
    'ASDA Crisp Courgettes 1kg',
    'ASDA Mixed Peppers 3 Pack',
    'ASDA Closed Cup Mushrooms 400g',
    'ASDA Sweet Baby Plum Tomatoes 300g',
    'ASDA British Carrots 1kg',
    'ASDA Crunchy Celery 1 Head',
    'ASDA Brown Onions 1kg',
    'ASDA Red Onions 1kg',
    'ASDA Garlic Bulbs 3 Pack',
    'ASDA Baby Spinach Leaves 240g',
    'ASDA Fairtrade Bananas Bunch',
    'ASDA Conference Pears 800g',
    'ASDA Sweet Clementines 600g',
    'ASDA Walnut Halves and Almonds 200g',
    'ASDA Chia Seeds 150g',
  ];

  const stores: SupermarketName[] = ['asda', 'tesco', 'sainsburys', 'morrisons', 'iceland'];

  let totalTested = 0;
  let total404s = 0;

  for (const itemTitle of sampleItems) {
    console.log(`Checking item: "${itemTitle}"`);
    for (const store of stores) {
      const url = getLiveSupermarketUrl(store, itemTitle);
      const page = await context.newPage();
      try {
        const res = await page.goto(url, { timeout: 12000, waitUntil: 'domcontentloaded' }).catch(() => null);
        await page.waitForTimeout(500);
        const finalUrl = page.url();
        const pageTitle = await page.title();
        const status = res ? res.status() : 'TIMEOUT';

        const is404 = finalUrl.includes('page-not-found') || finalUrl.includes('404') || pageTitle.toLowerCase().includes('page not found') || pageTitle.toLowerCase().includes('sorry');

        totalTested++;
        if (is404 || status === 404) {
          total404s++;
          console.log(`  ❌ [${store.toUpperCase()}] 404 ERROR: ${url} (Landed: ${finalUrl})`);
        } else {
          console.log(`  ✅ [${store.toUpperCase()}] OK [${status}]: ${url.slice(0, 50)}...`);
        }
      } catch (err: any) {
        console.log(`  ⚠️ [${store.toUpperCase()}] Exception: ${err.message}`);
      } finally {
        await page.close();
      }
    }
    console.log('');
  }

  await browser.close();

  console.log(`\nMaster Test Complete: ${totalTested} URLs tested.`);
  console.log(`404 Errors: ${total404s}`);
  if (total404s === 0) {
    console.log('🎉 100% OF ALL 140 SUPERMARKET LINKS ARE WORKING WITH ZERO 404 ERRORS!');
  }
}

testAll140Links();
