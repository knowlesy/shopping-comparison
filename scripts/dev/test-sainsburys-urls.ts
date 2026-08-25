import { chromium } from 'playwright';

async function testSainsburysUrls() {
  console.log('🔬 Testing Sainsbury\'s URL formats...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const candidates = [
    'https://www.sainsburys.co.uk/gol-ui/SearchResults/beef%20mince',
    'https://www.sainsburys.co.uk/gol-ui/SearchResults?q=beef%20mince',
    'https://www.sainsburys.co.uk/gol-ui/search/beef%20mince',
    'https://www.sainsburys.co.uk/shop/gb/groceries/search?searchTerm=beef%20mince',
    'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-british-lean-beef-steak-mince-5--fat-500g',
    'https://www.sainsburys.co.uk/gol-ui/product/sainsburys-british-beef-steak-mince-5-fat-500g',
  ];

  for (const url of candidates) {
    const page = await context.newPage();
    console.log(`Testing: ${url}`);
    try {
      const res = await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(e => null);
      await page.waitForTimeout(1000);
      const title = await page.title();
      const finalUrl = page.url();
      const status = res ? res.status() : 'TIMEOUT';
      console.log(`  -> Status: ${status}`);
      console.log(`  -> Title:  "${title}"`);
      console.log(`  -> Final:  ${finalUrl}\n`);
    } catch (e: any) {
      console.log(`  -> Error: ${e.message}\n`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

testSainsburysUrls();
