import { chromium } from 'playwright';

async function findExactMinceUrls() {
  console.log('🎯 Finding EXACT live direct product URLs for 5% Lean Beef Mince across all 5 stores...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB',
  });

  const page = await context.newPage();

  // 1. ASDA
  console.log('1. Checking Asda...');
  try {
    const asdaDirect = 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-mince-500g/5391423';
    const res = await page.goto(asdaDirect, { timeout: 15000, waitUntil: 'domcontentloaded' });
    console.log(`   Asda 500g Direct: HTTP ${res?.status()}, Title: "${await page.title()}"`);
  } catch (e: any) {
    console.log(`   Asda error: ${e.message}`);
  }

  // 2. TESCO
  console.log('\n2. Checking Tesco Search & Product...');
  try {
    await page.goto('https://www.tesco.com/groceries/en-GB/search?query=lean+beef+steak+mince+5%25', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const tescoLink = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/products/"]') as HTMLAnchorElement;
      return a ? { href: a.href, text: a.innerText } : null;
    });
    console.log(`   Tesco Found Link: ${tescoLink?.href} ("${tescoLink?.text?.slice(0, 40)}")`);
  } catch (e: any) {
    console.log(`   Tesco error: ${e.message}`);
  }

  // 3. SAINSBURY'S
  console.log('\n3. Checking Sainsbury\'s Search & Product...');
  try {
    await page.goto('https://www.sainsburys.co.uk/gol-ui/SearchResults/lean%20beef%20steak%20mince%205%25', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const sainsLink = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/gol-ui/product/"]') as HTMLAnchorElement;
      return a ? { href: a.href, text: a.innerText } : null;
    });
    console.log(`   Sainsbury's Found Link: ${sainsLink?.href} ("${sainsLink?.text?.slice(0, 40)}")`);
  } catch (e: any) {
    console.log(`   Sainsbury's error: ${e.message}`);
  }

  // 4. MORRISONS
  console.log('\n4. Checking Morrisons Search & Product...');
  try {
    await page.goto('https://groceries.morrisons.com/search?entry=lean%20beef%20steak%20mince%205%25', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const morrLink = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/products/"]') as HTMLAnchorElement;
      return a ? { href: a.href, text: a.innerText } : null;
    });
    console.log(`   Morrisons Found Link: ${morrLink?.href} ("${morrLink?.text?.slice(0, 40)}")`);
  } catch (e: any) {
    console.log(`   Morrisons error: ${e.message}`);
  }

  // 5. ICELAND
  console.log('\n5. Checking Iceland Search & Product...');
  try {
    await page.goto('https://www.iceland.co.uk/search?q=lean+beef+steak+mince', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const iceLink = await page.evaluate(() => {
      const a = document.querySelector('a[href*="/p/"]') as HTMLAnchorElement;
      return a ? { href: a.href, text: a.innerText } : null;
    });
    console.log(`   Iceland Found Link: ${iceLink?.href} ("${iceLink?.text?.slice(0, 40)}")`);
  } catch (e: any) {
    console.log(`   Iceland error: ${e.message}`);
  }

  await browser.close();
}

findExactMinceUrls();
