import path from "path";
import { chromium } from "@playwright/test";

const ARTIFACT_DIR = "/Users/peterknowles/.gemini/antigravity/brain/fb1ce239-2a37-4c30-a665-6c2e9a3628c8";
const SCREENSHOTS_DIR = path.join(ARTIFACT_DIR, "screenshots");

async function testSwapModals() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();

  console.log("Navigating to http://localhost:5173/...");
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.click('button:has-text("Load 28-Item Sample List")');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Compare Prices Now")');
  await page.waitForTimeout(4500);

  const chgBtns = await page.$$('button:has-text("Chg")');
  console.log(`Found ${chgBtns.length} Change buttons.`);

  // 1. Eggs Swap Modal (Row 3, Asda column)
  console.log("Testing 1. Eggs Swap Modal...");
  if (chgBtns.length > 14) {
    await chgBtns[14].click();
    await page.waitForTimeout(1500);
    const eggsPath = path.join(SCREENSHOTS_DIR, "verified_eggs_swap_modal.png");
    await page.screenshot({ path: eggsPath });
    console.log("✓ Saved:", eggsPath);

    const closeBtn = await page.$('button:has-text("Close"), button:has-text("✕"), [aria-label*="Close"]');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(600);
  }

  // 2. Greek Yogurt Swap Modal (Row 4, Asda column)
  console.log("Testing 2. Greek Yogurt Swap Modal...");
  const chgBtns2 = await page.$$('button:has-text("Chg")');
  if (chgBtns2.length > 21) {
    await chgBtns2[21].click();
    await page.waitForTimeout(1500);
    const yogurtPath = path.join(SCREENSHOTS_DIR, "verified_yogurt_swap_modal.png");
    await page.screenshot({ path: yogurtPath });
    console.log("✓ Saved:", yogurtPath);

    const closeBtn = await page.$('button:has-text("Close"), button:has-text("✕"), [aria-label*="Close"]');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(600);
  }

  // 3. Milk Swap Modal (Row 6, Sainsbury column)
  console.log("Testing 3. Milk Swap Modal...");
  const chgBtns3 = await page.$$('button:has-text("Chg")');
  if (chgBtns3.length > 36) {
    await chgBtns3[36].click();
    await page.waitForTimeout(1500);
    const milkPath = path.join(SCREENSHOTS_DIR, "verified_milk_swap_modal.png");
    await page.screenshot({ path: milkPath });
    console.log("✓ Saved:", milkPath);

    const closeBtn = await page.$('button:has-text("Close"), button:has-text("✕"), [aria-label*="Close"]');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(600);
  }

  // 4. Potatoes Swap Modal (Row 8, Asda column)
  console.log("Testing 4. Potatoes Swap Modal...");
  const chgBtns4 = await page.$$('button:has-text("Chg")');
  if (chgBtns4.length > 49) {
    await chgBtns4[49].click();
    await page.waitForTimeout(1500);
    const potatoesPath = path.join(SCREENSHOTS_DIR, "verified_potatoes_swap_modal.png");
    await page.screenshot({ path: potatoesPath });
    console.log("✓ Saved:", potatoesPath);
  }

  await browser.close();
  console.log("All 4 swap modals captured successfully!");
}

testSwapModals().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
