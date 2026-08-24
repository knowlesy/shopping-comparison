import { chromium } from 'playwright';

async function testKeywordVsFullTitle() {
  console.log('🔬 Testing Search Query Effectiveness: Short Keyword vs Long Brand Title...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const queries = [
    { store: 'Asda (Direct)', url: 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-mince-500g/5391423' },
    { store: 'Tesco (Clean Keyword)', url: 'https://www.tesco.com/groceries/en-GB/search?query=lean+beef+mince' },
    { store: 'Sainsbury\'s (Clean Keyword)', url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/lean%20beef%20mince' },
    { store: 'Morrisons (Clean Keyword)', url: 'https://groceries.morrisons.com/search?entry=lean%20beef%20mince' },
    { store: 'Iceland (Clean Keyword)', url: 'https://www.iceland.co.uk/search?q=lean+beef+mince' },
  ];

  for (const q of queries) {
    const page = await context.newPage();
    console.log(`Testing ${q.store}: ${q.url}`);
    try {
      const res = await page.goto(q.url, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => null);
      await page.waitForTimeout(1000);
      const title = await page.title();
      const finalUrl = page.url();
      const status = res ? res.status() : 'TIMEOUT';
      console.log(`  -> Status: ${status}, Title: "${title}", FinalUrl: ${finalUrl}\n`);
    } catch (e: any) {
      console.log(`  -> Error: ${e.message}\n`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

testKeywordVsFullTitle();
