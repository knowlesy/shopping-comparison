import { chromium } from 'playwright';

async function testWithStealth() {
  console.log('🛡️ Testing supermarket pages with automation flags disabled...\n');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  });

  // Remove navigator.webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  const urls = [
    { store: 'Asda', url: 'https://www.asda.com/groceries/search/beef%20mince' },
    { store: 'Morrisons', url: 'https://groceries.morrisons.com/search?entry=beef%20mince' },
    { store: 'Tesco', url: 'https://www.tesco.com/groceries/en-GB/search?query=beef+mince' },
    { store: 'Sainsbury\'s', url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/beef%20mince' },
    { store: 'Iceland', url: 'https://www.iceland.co.uk/search?q=beef%20mince' },
  ];

  for (const item of urls) {
    const page = await context.newPage();
    try {
      console.log(`Checking ${item.store}...`);
      const res = await page.goto(item.url, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(e => null);
      await page.waitForTimeout(2000);
      const title = await page.title();
      const status = res ? res.status() : 'N/A';
      console.log(`  -> ${item.store}: Status ${status}, Title: "${title}", URL: ${page.url()}`);
    } catch (e: any) {
      console.log(`  -> ${item.store} error: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

testWithStealth();
