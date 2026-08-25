import { chromium } from 'playwright';

async function testAsdaProductDOM() {
  console.log('Inspecting Asda Direct Product Page DOM...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const page = await context.newPage();
  const directUrls = [
    'https://www.asda.com/groceries/product/1000185923841',
    'https://www.asda.com/groceries/product/asda-extra-lean-beef-steak-mince-5-fat-750g/1000185923841',
    'https://groceries.asda.com/product/1000185923841',
  ];

  for (const url of directUrls) {
    console.log(`Loading: ${url}`);
    const res = await page.goto(url, { waitUntil: 'load', timeout: 15000 }).catch(e => null);
    await page.waitForTimeout(2000);
    const title = await page.title();
    const finalUrl = page.url();
    const is404 = await page.locator('text=Page not found,text=page-not-found,text=We can\'t find').isVisible().catch(() => false);
    const hasProduct = await page.locator('h1, [data-auto-id="product-title"]').innerText().catch(() => 'None');

    console.log(`  -> Status: ${res?.status()}, Title: "${title}", FinalUrl: ${finalUrl}`);
    console.log(`  -> Is 404: ${is404}, Product H1: "${hasProduct}"\n`);
  }

  await browser.close();
}

testAsdaProductDOM();
