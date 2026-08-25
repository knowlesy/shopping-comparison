import fs from "fs";
import path from "path";
import { chromium } from "@playwright/test";

const ARTIFACT_DIR = "/Users/peterknowles/.gemini/antigravity/brain/fb1ce239-2a37-4c30-a665-6c2e9a3628c8";
const SCREENSHOTS_DIR = path.join(ARTIFACT_DIR, "screenshots");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function captureProofs() {
  console.log("Launching Chromium for high-res visual verification captures...");
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop Full Master Comparison View
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const desktopPage = await desktopContext.newPage();

  console.log("1. Capturing Desktop Full Basket Comparison...");
  await desktopPage.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await desktopPage.click('button:has-text("Load 28-Item Sample List")');
  await desktopPage.waitForTimeout(400);
  await desktopPage.click('button:has-text("Compare Prices Now")');
  await desktopPage.waitForTimeout(4500);

  const desktopCompPath = path.join(SCREENSHOTS_DIR, "desktop_master_comparison.png");
  await desktopPage.screenshot({ path: desktopCompPath, fullPage: true });
  console.log("✓ Saved:", desktopCompPath);

  // 2. Desktop Alternative Swap Modal for Beef Mince
  console.log("2. Capturing Beef Mince Swap Modal...");
  const swapButtons = await desktopPage.$$('button:has-text("Swap"), button:has-text("Alternative"), button[title*="Swap"], button[title*="alternative"]');
  if (swapButtons.length > 0) {
    // Click swap on the first item (Beef Mince)
    await swapButtons[0].click();
    await desktopPage.waitForTimeout(1200);

    const minceModalPath = path.join(SCREENSHOTS_DIR, "desktop_mince_swap_modal.png");
    await desktopPage.screenshot({ path: minceModalPath });
    console.log("✓ Saved:", minceModalPath);

    const closeBtn = await desktopPage.$('button:has-text("✕"), button:has-text("×"), [aria-label*="Close"]');
    if (closeBtn) await closeBtn.click();
    await desktopPage.waitForTimeout(400);
  }

  // 3. Mobile Comparison View (iPhone 14: 390 x 844)
  console.log("3. Capturing Mobile Viewport Comparison...");
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await mobilePage.click('button:has-text("Load 28-Item Sample List")');
  await mobilePage.waitForTimeout(400);
  await mobilePage.click('button:has-text("Compare Prices Now")');
  await mobilePage.waitForTimeout(4500);

  const mobileCompPath = path.join(SCREENSHOTS_DIR, "mobile_comparison_view.png");
  await mobilePage.screenshot({ path: mobileCompPath, fullPage: true });
  console.log("✓ Saved:", mobileCompPath);

  // 4. Mobile Swap Modal
  console.log("4. Capturing Mobile Alternative Swap Modal...");
  const mobileSwapButtons = await mobilePage.$$('button:has-text("Swap"), button:has-text("Alternative"), button[title*="Swap"], button[title*="alternative"]');
  if (mobileSwapButtons.length > 0) {
    await mobileSwapButtons[0].click();
    await mobilePage.waitForTimeout(1200);

    const mobileModalPath = path.join(SCREENSHOTS_DIR, "mobile_swap_modal.png");
    await mobilePage.screenshot({ path: mobileModalPath });
    console.log("✓ Saved:", mobileModalPath);
  }

  await browser.close();
  console.log("All visual proof screenshots captured successfully!");
}

captureProofs().catch(err => {
  console.error("Visual proof capture failed:", err);
  process.exit(1);
});
