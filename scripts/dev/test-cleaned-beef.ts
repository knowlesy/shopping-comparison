import { chromium } from 'playwright';

function cleanQuery(text: string): string {
  return text
    .replace(/\(.*?\)/g, '')
    .replace(/%/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function testCleanedBeefLinks() {
  console.log('🧪 Testing Cleaned URLs for Beef Mince across all 5 supermarkets...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const testList = [
    {
      store: 'Asda (Direct)',
      url: 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-mince-500g/5391423',
    },
    {
      store: 'Asda (Search)',
      url: `https://www.asda.com/groceries/search/${encodeURIComponent(cleanQuery('ASDA 5% Fat Beef Mince 500g'))}`,
    },
    {
      store: 'Tesco (Clean Search)',
      url: `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(cleanQuery('Tesco Lean British Beef Steak Mince 5% Fat 500g')).replace(/%20/g, '+')}`,
    },
    {
      store: 'Sainsbury\'s (Clean Search)',
      url: `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(cleanQuery('Sainsburys British Lean Beef Steak Mince 5% Fat 500g'))}`,
    },
    {
      store: 'Morrisons (Clean Search)',
      url: `https://groceries.morrisons.com/search?entry=${encodeURIComponent(cleanQuery('Morrisons British Lean Beef Steak Mince 5% Fat 500g'))}`,
    },
    {
      store: 'Iceland (Clean Search)',
      url: `https://www.iceland.co.uk/search?q=${encodeURIComponent(cleanQuery('Iceland Lean Beef Steak Mince 5% Fat 500g')).replace(/%20/g, '+')}`,
    },
  ];

  for (const item of testList) {
    const page = await context.newPage();
    console.log(`Checking ${item.store}...`);
    console.log(`  URL: ${item.url}`);
    try {
      const res = await page.goto(item.url, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
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

testCleanedBeefLinks();
