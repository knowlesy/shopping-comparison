import { chromium } from 'playwright';

async function verifyDirectMince() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });
  const page = await context.newPage();

  const url = 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-mince-500g/5391423';
  console.log(`Checking direct product: ${url}`);
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);
  const title = await page.title();
  const h1 = await page.locator('h1').innerText().catch(() => 'No H1');

  console.log(`  -> HTTP ${res?.status()}, Title: "${title}", H1: "${h1}"`);
  await browser.close();
}

verifyDirectMince();
