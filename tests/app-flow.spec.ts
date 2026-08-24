import { test, expect } from '@playwright/test';

test.describe('TrolleyWise UK Web App End-to-End Verification', () => {
  test('Complete Shopping & Supermarket Comparison Flow', async ({ page }) => {
    // 1. Open the application
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // 2. Check title and brand
    await expect(page).toHaveTitle(/TrolleyWise UK/i);
    const brand = page.locator('span:has-text("TrolleyWise")').first();
    await expect(brand).toBeVisible();

    // 3. Navigate to Shopping List tab
    const listTab = page.locator('button:has-text("Shopping List")').first();
    await listTab.click();
    await page.waitForTimeout(300);

    // 4. Test "Load 28-Item Sample List" button
    const loadSampleBtn = page.locator('button:has-text("Load 28-Item Sample List")').first();
    await expect(loadSampleBtn).toBeVisible();
    await loadSampleBtn.click();
    await page.waitForTimeout(500);

    // 5. Verify checklist items rendered
    const checklistCard = page.locator('span:has-text("900g 5% lean beef mince")').first();
    await expect(checklistCard).toBeVisible();

    // 6. Test Ingredient Ideas Word Window: Click an idea chip to add
    const ideaChip = page.locator('button:has-text("Greek Yogurt 0%")').first();
    if (await ideaChip.isVisible()) {
      await ideaChip.click();
      await page.waitForTimeout(300);
    }

    // 7. Click "Compare Prices Now"
    const compareBtn = page.locator('button:has-text("Compare Prices Now")').first();
    await expect(compareBtn).toBeVisible();
    await compareBtn.click();
    await page.waitForTimeout(800);

    // 8. Verify Comparison View rendered
    await expect(page.locator('h1:has-text("Supermarket Price & Sizing Matrix")')).toBeVisible();

    // Verify 5 Supermarket summary cards exist
    await expect(page.locator('span:has-text("Asda")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Tesco")').first()).toBeVisible();
    await expect(page.locator("span:has-text(\"Sainsbury's\")").first()).toBeVisible();
    await expect(page.locator('span:has-text("Morrisons")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Iceland")').first()).toBeVisible();

    // Verify Cheapest store badge
    const cheapestBadge = page.locator('text=Cheapest Overall').first();
    await expect(cheapestBadge).toBeVisible();

    // Verify Split Basket Optimizer banner
    const splitBanner = page.locator('h2:has-text("Smart Split-Basket Optimization")');
    await expect(splitBanner).toBeVisible();

    // 9. Test "Swap Item" Modal
    const swapBtn = page.locator('button:has-text("Swap Item")').first();
    await expect(swapBtn).toBeVisible();
    await swapBtn.click();
    await page.waitForTimeout(500);

    // Verify Swap Modal is open
    const swapModalTitle = page.locator('h3:has-text("Choose replacement for")');
    await expect(swapModalTitle).toBeVisible();

    // Pick an alternative or close
    const chooseBtn = page.locator('button:has-text("Choose")').first();
    if (await chooseBtn.isVisible()) {
      await chooseBtn.click();
      await page.waitForTimeout(300);
    } else {
      const closeBtn = page.locator('button:has-text("Close")');
      await closeBtn.click();
    }

    // 10. Test Save to Archive
    const saveArchiveBtn = page.locator('button:has-text("Save Archive")');
    await expect(saveArchiveBtn).toBeVisible();
    await saveArchiveBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=Saved to Archive!')).toBeVisible();

    // 11. Navigate to Past Shops Tab
    const historyTab = page.locator('button:has-text("Past Shops")').first();
    await historyTab.click();
    await page.waitForTimeout(400);

    // Verify archived shop exists
    const archivedShop = page.locator('h1:has-text("Past Shopping Trips & Supermarket Prices")');
    await expect(archivedShop).toBeVisible();
    const reloadBtn = page.locator('button:has-text("Reload List")').first();
    await expect(reloadBtn).toBeVisible();

    // 12. Test Reload List
    await reloadBtn.click();
    await page.waitForTimeout(600);

    // Should navigate back to comparison view
    await expect(page.locator('h1:has-text("Supermarket Price & Sizing Matrix")')).toBeVisible();

    console.log('✅ End-to-End Playwright UI tests verified successfully!');
  });
});
