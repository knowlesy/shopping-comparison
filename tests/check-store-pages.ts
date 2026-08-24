import { chromium } from 'playwright';

async function testSupermarketWebsites() {
  console.log('🔍 Testing real user navigation for Tesco, Sainsbury\'s, and Iceland...\n');

  const browser = await chromium.launch({ headless: true });
  
  // Test with standard user context
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-GB',
    extraHTTPHeaders: {
      'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    }
  });

  const testUrls = [
    {
      name: 'Tesco (Search)',
      url: 'https://www.tesco.com/groceries/en-GB/search?query=lean+beef+mince',
    },
    {
      name: 'Sainsbury\'s (Search)',
      url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/lean%20beef%20mince',
    },
    {
      name: 'Iceland (Search)',
      url: 'https://www.iceland.co.uk/search?q=lean+beef+mince',
    },
    {
      name: 'Morrisons (Search)',
      url: 'https://groceries.morrisons.com/search?entry=lean%20beef%20mince',
    },
    {
      name: 'Asda (Search)',
      url: 'https://www.asda.com/groceries/search/lean%20beef%20mince',
    }
  ];

  for (const item of testUrls) {
    const page = await context.newPage();
    try {
      console.log(`➡️  Testing ${item.name}: ${item.url}`);
      const res = await page.goto(item.url, { timeout: 15000, waitUntil: 'load' }).catch(err => {
        console.log(`   Load timeout/warning: ${err.message?.split('\n')[0]}`);
        return null;
      });

      await page.waitForTimeout(2000);
      const title = await page.title();
      const currentUrl = page.url();
      const bodySnippet = (await page.evaluate(() => document.body?.innerText?.slice(0, 300) || '')).replace(/\n+/g, ' ');

      console.log(`   Status: ${res ? res.status() : 'N/A'}`);
      console.log(`   Page Title: "${title}"`);
      console.log(`   Final URL: ${currentUrl}`);
      console.log(`   Visible text preview: ${bodySnippet.slice(0, 150)}...\n`);
    } catch (e: any) {
      console.error(`   ❌ Error testing ${item.name}:`, e.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

testSupermarketWebsites();
