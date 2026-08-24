import { chromium } from 'playwright';

async function testSainsburysRealBrowser() {
  const browser = await chromium.launch({
    headless: false, // launch non-headless or stealth to see actual redirect
  }).catch(() => null);

  if (!browser) {
    console.log('Headless fallback');
  }
}

console.log('Checking Sainsbury routes...');
