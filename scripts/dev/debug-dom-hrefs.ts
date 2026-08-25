import { chromium } from 'playwright';

async function debugDOMHrefs() {
  console.log('🚀 Debugging exact rendered href attributes on http://localhost:5173...\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');

  // Click Load Sample List
  await page.locator('button:has-text("Load 28-Item Sample List")').click();
  await page.waitForTimeout(500);

  // Click Compare
  await page.locator('button:has-text("Compare Prices Now")').click();
  await page.waitForTimeout(1000);

  // Extract all links in the first comparison row (Beef Mince)
  const firstRowLinks = await page.evaluate(() => {
    // Find all store columns in the first item card container
    const cards = Array.from(document.querySelectorAll('.rounded-2xl.p-4, .rounded-2xl.p-3'));
    return cards.slice(0, 5).map(card => {
      const titleEl = card.querySelector('a');
      const title = titleEl?.innerText?.trim() || 'NO_TITLE';
      const href = titleEl?.getAttribute('href') || 'NO_HREF';
      const storeBadge = card.closest('[class*="border-"]') || card;
      return {
        title,
        href,
        html: card.innerHTML.slice(0, 200),
      };
    });
  });

  console.log('Found first row product cards on the live UI:');
  console.log(JSON.stringify(firstRowLinks, null, 2));

  await browser.close();
}

debugDOMHrefs();
