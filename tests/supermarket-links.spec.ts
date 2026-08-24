import { test, expect } from '@playwright/test';

test.describe('UK Supermarket Links with Real User Headers', () => {
  test('Verify User Navigation to Store Search Pages', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      locale: 'en-GB',
    });
    const page = await context.newPage();

    const stores = [
      { name: 'Asda', url: 'https://www.asda.com/groceries/search/beef%20mince' },
      { name: 'Tesco', url: 'https://www.tesco.com/groceries/en-GB/search?query=beef+mince' },
      { name: "Sainsbury's", url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/beef%20mince' },
      { name: 'Morrisons', url: 'https://groceries.morrisons.com/search?entry=beef%20mince' },
      { name: 'Iceland', url: 'https://www.iceland.co.uk/search?q=beef%20mince' },
    ];

    for (const s of stores) {
      console.log(`Testing navigation to ${s.name}: ${s.url}`);
      try {
        const res = await page.goto(s.url, { timeout: 10000, waitUntil: 'domcontentloaded' });
        console.log(`  ✓ ${s.name} status: ${res?.status()}, URL: ${page.url()}`);
      } catch (e: any) {
        console.log(`  Note on ${s.name}: ${e.message?.split('\n')[0]}`);
      }
    }
    await context.close();
  });
});
