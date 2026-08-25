import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';

const ASSETS_DIR = path.resolve('docs/assets');
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

let previewServer = null;
async function ensureServerRunning() {
  try {
    const res = await fetch('http://localhost:5173/');
    if (res.ok) return;
  } catch {}

  console.log('Starting local Vite preview server on port 5173...');
  previewServer = spawn('npx', ['vite', 'preview', '--port', '5173', '--strictPort'], {
    cwd: path.resolve('client'),
    stdio: 'ignore'
  });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch('http://localhost:5173/');
      if (res.ok) return;
    } catch {}
  }
}

async function captureScreenshots() {
  await ensureServerRunning();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  try {
    console.log('1. Navigating to TrolleyWise web app...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

    // Clear storage
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle' });

    // 1. Shopping List input view
    console.log('2. Capturing Shopping List View...');
    const loadSampleBtn = await page.waitForSelector('button:has-text("Load 28-Item Sample List")');
    await loadSampleBtn.click();
    await page.waitForTimeout(600);

    const listPath = path.join(ASSETS_DIR, '01-shopping-list.png');
    await page.screenshot({ path: listPath });
    console.log(`   ✓ Saved: ${listPath}`);

    // 2. Comparison Matrix View
    console.log('3. Running Comparison and Capturing Price Matrix...');
    const compareBtn = await page.waitForSelector('button:has-text("Compare Prices Now")');
    await compareBtn.click();
    await page.waitForTimeout(4000);

    const matrixPath = path.join(ASSETS_DIR, '02-price-matrix.png');
    await page.screenshot({ path: matrixPath });
    console.log(`   ✓ Saved: ${matrixPath}`);

    // Save to past history
    const lockBtn = await page.$('button:has-text("Lock In Weekly Shop"), button:has-text("Save Archive")');
    if (lockBtn) {
      await lockBtn.click();
      await page.waitForTimeout(500);
    }

    // 3. Swap Item Modal
    console.log('4. Capturing Swap Item Picker Modal...');
    const chgBtns = await page.$$('button:has-text("Chg")');
    if (chgBtns.length > 0) {
      await chgBtns[0].click();
      await page.waitForTimeout(1000);

      const modalPath = path.join(ASSETS_DIR, '03-swap-modal.png');
      await page.screenshot({ path: modalPath });
      console.log(`   ✓ Saved: ${modalPath}`);

      const closeBtn = await page.$('button:has-text("Close"), button:has-text("✕")');
      if (closeBtn) await closeBtn.click();
      await page.waitForTimeout(400);
    }

    // 4. Split-Basket Optimizer View
    console.log('5. Capturing Smart Split-Basket Optimization...');
    const splitBanner = await page.$('h2:has-text("Smart Split-Basket Optimization")');
    if (splitBanner) {
      await splitBanner.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);

      const splitPath = path.join(ASSETS_DIR, '04-split-basket.png');
      await page.screenshot({ path: splitPath });
      console.log(`   ✓ Saved: ${splitPath}`);
    }

    // 5. Quick Price Check View
    console.log('6. Capturing Quick Price Check View with results...');
    const quickCheckTab = await page.$('button:has-text("Quick Check")');
    if (quickCheckTab) {
      await quickCheckTab.click();
      await page.waitForTimeout(400);

      const input = await page.$('input[placeholder*="item"], input[type="text"]');
      if (input) {
        await input.fill('1kg carrots');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }

      const quickPath = path.join(ASSETS_DIR, '05-quick-price-check.png');
      await page.screenshot({ path: quickPath });
      console.log(`   ✓ Saved: ${quickPath}`);
    }

    // 6. Past Shops / Archive Trends View
    console.log('7. Capturing Past Shops & Archive History View...');
    const pastShopsTab = await page.$('button:has-text("Past Shops")');
    if (pastShopsTab) {
      await pastShopsTab.click();
      await page.waitForTimeout(600);

      const historyPath = path.join(ASSETS_DIR, '06-past-shops.png');
      await page.screenshot({ path: historyPath });
      console.log(`   ✓ Saved: ${historyPath}`);
    }

    console.log('\n🎉 All repository screenshots successfully captured!');
  } catch (err) {
    console.error('Error capturing screenshots:', err);
  } finally {
    await browser.close();
    if (previewServer) {
      previewServer.kill();
    }
  }
}

captureScreenshots().catch(console.error);
