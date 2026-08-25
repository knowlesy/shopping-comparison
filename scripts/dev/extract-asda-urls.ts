import { chromium } from 'playwright';

async function extractLiveAsdaLinks() {
  console.log('Extracting live direct product links from Asda...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const page = await context.newPage();
  const searchQueries = [
    'ASDA Extra Lean Beef Steak Mince 5% Fat 750g',
    'ASDA Frozen Skinless Boneless Cod Fillets 1kg',
    'ASDA Greek Style Natural Yogurt 0% Fat 1kg',
  ];

  for (const q of searchQueries) {
    const url = `https://www.asda.com/groceries/search/${encodeURIComponent(q)}`;
    console.log(`Searching: ${url}`);
    await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => null);
    await page.waitForTimeout(3000);

    const productLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/product/"]'));
      return anchors.map(a => ({
        text: (a as HTMLElement).innerText?.trim().replace(/\n+/g, ' '),
        href: (a as HTMLAnchorElement).href,
      })).filter(x => x.text && x.href);
    });

    console.log(`  Found ${productLinks.length} product links on Asda search:`);
    productLinks.slice(0, 3).forEach(l => console.log(`   - "${l.text}" -> ${l.href}`));
    console.log('');
  }

  await browser.close();
}

extractLiveAsdaLinks();
