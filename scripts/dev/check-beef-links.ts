import { chromium } from 'playwright';

async function testBeefLinks() {
  console.log('🔍 Testing the 5 Beef Mince links across Tesco, Asda, Sainsbury\'s, Morrisons, Iceland...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const urls = [
    { store: 'Tesco', url: 'https://www.tesco.com/groceries/en-GB/products/256569106' },
    { store: 'Tesco (750g)', url: 'https://www.tesco.com/groceries/en-GB/products/294025178' },
    { store: 'Asda', url: 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-mince-500g/5391423' },
    { store: 'Asda (1kg)', url: 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-steak-mince-1kg/5591998' },
    { store: 'Sainsbury\'s', url: 'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-british-lean-beef-steak-mince-5-fat-500g' },
    { store: 'Morrisons', url: 'https://groceries.morrisons.com/products/morrisons-lean-beef-mince-5-fat-500g-211475011' },
    { store: 'Iceland', url: 'https://www.iceland.co.uk/p/iceland-lean-beef-steak-mince-400g/65753.html' },
    { store: 'Iceland (1kg)', url: 'https://www.iceland.co.uk/p/iceland-lean-beef-steak-mince-5-fat-1kg/87626.html' },
  ];

  for (const item of urls) {
    const page = await context.newPage();
    console.log(`Testing ${item.store}: ${item.url}`);
    try {
      const res = await page.goto(item.url, { timeout: 15000, waitUntil: 'load' }).catch(e => null);
      await page.waitForTimeout(2000);
      const title = await page.title();
      const finalUrl = page.url();
      const status = res ? res.status() : 'TIMEOUT';

      console.log(`  -> Status: ${status}`);
      console.log(`  -> Title:  "${title}"`);
      console.log(`  -> Final:  ${finalUrl}`);

      const is404 = finalUrl.includes('page-not-found') || finalUrl.includes('404') || title.toLowerCase().includes('page not found') || title.toLowerCase().includes('sorry') || title.toLowerCase().includes('error');
      console.log(`  -> Working: ${!is404 && status !== 404 ? '✅ YES' : '❌ NO 404'}\n`);
    } catch (e: any) {
      console.error(`  -> Error: ${e.message}\n`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

testBeefLinks();
