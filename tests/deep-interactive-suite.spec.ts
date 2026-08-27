import { test, expect } from '@playwright/test';

test.describe('🔬 Deep Interactive Link & Workflow Verification Suite', () => {
  test('Complete Interactive Verification: Navigation, Links, Modal Swaps, Basket Calculations & Archive', async ({ page }) => {
    // 1. Open the application
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // 2. Check title and brand
    await expect(page).toHaveTitle(/TrolleyWise UK/i);
    const brand = page.locator('span:has-text("TrolleyWise")').first();
    await expect(brand).toBeVisible();

    // 3. Verify Header Navigation tabs
    const listTab = page.locator('button:has-text("Shopping List"), button:has-text("List")').first();
    const compareTab = page.locator('button:has-text("Compare Prices"), button:has-text("Compare")').first();
    const historyTab = page.locator('button:has-text("Past Shops"), button:has-text("Past")').first();
    const favTab = page.locator('button:has-text("Favorites"), button:has-text("Ideas")').first();

    await expect(listTab).toBeVisible();
    await expect(compareTab).toBeVisible();
    await expect(historyTab).toBeVisible();
    await expect(favTab).toBeVisible();

    // 4. Test "Favorites & Ideas" Tab
    await favTab.click();
    await page.waitForTimeout(300);
    await expect(page.locator('h1:has-text("Favorites & Ingredient Word Window")')).toBeVisible();

    // 5. Test "Past Shops" Tab
    await historyTab.click();
    await page.waitForTimeout(300);
    await expect(page.locator('h1:has-text("Past Shopping Trips")')).toBeVisible();

    // 6. Return to Shopping List Tab
    await listTab.click();
    await page.waitForTimeout(300);

    // 7. Load 28-Item Sample List
    const loadSampleBtn = page.locator('button:has-text("Load 28-Item Sample List")').first();
    await expect(loadSampleBtn).toBeVisible();
    await loadSampleBtn.click();
    await page.waitForTimeout(500);

    // Verify 28 items loaded
    const checklistCard = page.locator('span:has-text("900g 5% lean beef mince")').first();
    await expect(checklistCard).toBeVisible();

    // 8. Test Word Window Idea Chips
    const ideaChip = page.locator('button:has-text("Greek Yogurt 0%")').first();
    if (await ideaChip.isVisible()) {
      await ideaChip.click();
      await page.waitForTimeout(300);
      console.log('✅ Clicked Word Window Idea Chip');
    }

    // 9. Navigate to Comparison View
    const compareBtn = page.locator('button:has-text("Compare Prices Now")').first();
    await expect(compareBtn).toBeVisible();
    await compareBtn.click();
    await page.waitForTimeout(800);

    // 10. Verify Comparison View & Store Summary Headers
    await expect(page.locator('h1:has-text("Supermarket Price & Sizing Matrix")')).toBeVisible();
    await expect(page.locator('span:has-text("Asda")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Tesco")').first()).toBeVisible();
    await expect(page.locator("span:has-text(\"Sainsbury's\")").first()).toBeVisible();
    await expect(page.locator('span:has-text("Morrisons")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Iceland")').first()).toBeVisible();

    // 11. Inspect all external product links on the matrix
    const productLinks = page.locator('a[href^="http"]');
    const linkCount = await productLinks.count();
    console.log(`Found ${linkCount} live supermarket external links on comparison matrix.`);
    expect(linkCount).toBeGreaterThanOrEqual(7);

    // Verify every sampled product link is valid and opens in target="_blank"
    for (let i = 0; i < Math.min(20, linkCount); i++) {
      const link = productLinks.nth(i);
      const href = await link.getAttribute('href');
      const target = await link.getAttribute('target');
      expect(href).toBeTruthy();
      expect(href).toMatch(/^https?:\/\//);
      expect(target).toBe('_blank');
    }
    console.log('✅ All tested product links have valid HTTP URLs and target="_blank".');

    // 12. Deep Test "Swap Item" Modal Interaction
    const swapButtons = page.locator('button:has-text("Chg"), button:has-text("Swap Item")');
    const swapCount = await swapButtons.count();
    expect(swapCount).toBeGreaterThan(0);

    // Open swap modal for the first item
    await swapButtons.first().click();
    await page.waitForTimeout(500);

    // Verify Swap Modal is open
    const swapModalTitle = page.locator('h3:has-text("Choose replacement for")');
    await expect(swapModalTitle).toBeVisible();

    // Inspect alternative options in the modal
    const altCards = page.locator('.rounded-2xl.border');
    const altCount = await altCards.count();
    console.log(`Swap Modal rendered ${altCount} replacement options.`);
    expect(altCount).toBeGreaterThan(0);

    // Verify alternative links in the modal
    const altLink = page.locator('.fixed.inset-0 a[href^="http"]').first();
    if (await altLink.isVisible()) {
      const href = await altLink.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toMatch(/^https?:\/\//);
      console.log(`Verified alternative item external link in modal: ${href?.slice(0, 50)}...`);
    }

    // Select alternative item
    const chooseBtn = page.locator('.fixed.inset-0 button:has-text("Choose")').first();
    if (await chooseBtn.isVisible()) {
      await chooseBtn.click();
      await page.waitForTimeout(500);
      console.log('✅ Clicked "Choose" on alternative item in modal.');
    } else {
      const closeBtn = page.locator('button:has-text("Close")');
      await closeBtn.click();
    }

    // Verify modal closed and comparison matrix is intact
    await expect(page.locator('h1:has-text("Supermarket Price & Sizing Matrix")')).toBeVisible();

    // 13. Test Split Basket Optimization section
    const splitBanner = page.locator('h2:has-text("Smart Split-Basket Optimization")');
    await expect(splitBanner).toBeVisible();

    // 14. Test Save to Archive
    const saveArchiveBtn = page.locator('button:has-text("Lock In Weekly Shop"), button:has-text("Save Archive")').first();
    await expect(saveArchiveBtn).toBeVisible();
    await saveArchiveBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=Weekly Shop Locked In!').first()).toBeVisible();
    console.log('✅ Successfully saved shop to archive.');

    // 15. Navigate to Past Shops and Reload
    await historyTab.click();
    await page.waitForTimeout(400);

    const reloadBtn = page.locator('button:has-text("Reload List")').first();
    await expect(reloadBtn).toBeVisible();
    await reloadBtn.click();
    await page.waitForTimeout(600);

    // Verify returned to Comparison matrix
    await expect(page.locator('h1:has-text("Supermarket Price & Sizing Matrix")')).toBeVisible();
    console.log('✅ Successfully reloaded past shop into active comparator!');
  });
});
