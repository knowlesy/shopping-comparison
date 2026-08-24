import { chromium } from 'playwright';

async function debugDOM() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://localhost:5173');
  await page.waitForLoadState('networkidle');

  // Load sample list
  await page.locator('button:has-text("Load 28-Item Sample List")').click();
  await page.waitForTimeout(400);

  // Compare
  await page.locator('button:has-text("Compare Prices Now")').click();
  await page.waitForTimeout(800);

  // Get all anchor tags on the page
  const anchors = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.innerText.trim(),
      href: a.href,
      target: a.target,
    }));
  });

  console.log(`Total <a> tags on page: ${anchors.length}`);
  console.log('Sample of first 10 links on the page:');
  console.log(JSON.stringify(anchors.slice(0, 10), null, 2));

  await browser.close();
}

debugDOM();
