import { test, expect } from '@playwright/test';

/**
 * End-to-end UI flow test across application tabs and features.
 * In accordance with Task 06, the browser fallback matching engine has been retired,
 * and the application uses the authoritative Logic-API.
 */
test.describe('ShoppingWise UK Web App UI Flow', () => {
  test('Complete Shopping & Supermarket Comparison Flow', async ({ page }) => {
    // 1. Open the application
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 2. Check title and brand
    await expect(page).toHaveTitle(/ShoppingWise UK/i);
    const brand = page.locator('span:has-text("ShoppingWise")').first();
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

    // 5. Verify checklist items rendered.
    // The previous assertion matched the exact string "900g 5% lean beef mince", which is
    // only ever produced by the client's fallback parser (it uses the raw line as the item
    // name). The API's parser names the same item "beef mince", so that assertion silently
    // required the API to be down. Intent preserved and strengthened: the whole 28-item
    // sample must render, and the beef mince row must be among them, under either parser.
    const checklistRows = page.locator('span.text-sm.font-medium');
    await expect(page.locator('span:has-text("beef mince")').first()).toBeVisible();
    expect(await checklistRows.count()).toBeGreaterThanOrEqual(28);

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

    // Verify all 7 Supermarket summary cards exist
    await expect(page.locator('span:has-text("Asda")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Tesco")').first()).toBeVisible();
    await expect(page.locator("span:has-text(\"Sainsbury's\")").first()).toBeVisible();
    await expect(page.locator('span:has-text("Morrisons")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Iceland")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Aldi")').first()).toBeVisible();
    await expect(page.locator('span:has-text("Lidl")').first()).toBeVisible();

    // The server classifies this partial result by coverage, not a price claim.
    const coverageBadge = page.locator('text=Best Coverage').first();
    await expect(coverageBadge).toBeVisible();

    // Verify Split Basket Optimizer banner
    const splitBanner = page.locator('h2:has-text("Smart Split-Basket Optimization")');
    await expect(splitBanner).toBeVisible();

    // 9. Test "Swap Item" Modal
    const swapBtn = page.locator('button:has-text("Chg"), button:has-text("Swap Item")').first();
    await expect(swapBtn).toBeVisible();
    await swapBtn.click();
    await page.waitForTimeout(500);

    // Verify Swap Modal is open
    const swapModal = page.locator('[data-testid="item-swap-modal"]');
    await expect(swapModal).toBeVisible();
    const swapModalTitle = page.locator('h3:has-text("Choose replacement for")');
    await expect(swapModalTitle).toBeVisible();

    // Pick an alternative or close inside the modal
    const chooseBtn = swapModal.locator('button:has-text("Choose"), button:has-text("Update"), [data-testid="modal-choose-btn"]').first();
    if (await chooseBtn.isVisible()) {
      await chooseBtn.click();
      await page.waitForTimeout(300);
    } else {
      const closeBtn = swapModal.locator('button:has-text("Close"), [data-testid="modal-close-btn"]').first();
      await closeBtn.click();
    }
    await expect(swapModal).not.toBeVisible();

    // 10. Test Save to Archive
    const saveArchiveBtn = page.locator('button:has-text("Lock In Weekly Shop"), button:has-text("Save Archive")').first();
    await expect(saveArchiveBtn).toBeVisible();
    await saveArchiveBtn.click();
    await page.waitForTimeout(500);
    await expect(page.locator('text=Weekly Shop Locked In!').first()).toBeVisible();

    // 11. Navigate to Past Shops Tab
    const historyTab = page.locator('button:has-text("Past Shops"), button:has-text("Past")').first();
    await historyTab.click();
    await page.waitForTimeout(400);

    // Verify archived shop exists
    const archivedShop = page.locator('h1:has-text("Past Shopping Trips")');
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

  test('renders provenance preference and a genuine price win with distinct badges', async ({ page }) => {
    const items = [
      { id: 'a', name: 'A', rawText: 'A', targetQuantity: 1 },
      { id: 'b', name: 'B', rawText: 'B', targetQuantity: 1 },
    ];
    const info = (id: string, name: string) => ({
      id, name, shortName: name, logo: '•', themeColor: '#000', accentColor: '#000',
      deliveryMinOrder: 0, deliveryFee: 0, deliveryPassAvailable: false, searchBaseUrl: 'https://example.invalid',
    });
    const match = (store: string, item: typeof items[number], price: number, estimated = false) => ({
      parsedItem: item, itemId: item.id, product: { id: `${store}-${item.id}`, title: `${store} ${item.name}`, price, supermarket: store, source: estimated ? 'catalog' : 'live' },
      totalPrice: price, packsNeeded: 1, totalQuantity: 1, lines: [], isEstimated: estimated, confidenceSource: estimated ? 'catalog' : 'live',
    });
    const noMatch = (item: typeof items[number]) => ({ parsedItem: item, itemId: item.id, product: null, totalPrice: 0, packsNeeded: 0, totalQuantity: 0, lines: [] });
    const store = (id: string, matches: unknown[], totalPrice: number, isCheapest: boolean, estimated = false) => ({
      supermarket: id, info: info(id, id === 'aldi' ? 'Aldi' : 'Lidl'), items: matches, subtotal: totalPrice, deliveryFee: 0, totalPrice,
      savingsVsHighest: 0, indicativeSavingsVsHighest: isCheapest ? 2 : 0, itemsFound: matches.filter((entry: any) => entry.product).length,
      itemsTotal: items.length, missingItems: [], isCheapest, estimatedShare: estimated ? 1 : 0, hasEstimatedPrices: estimated, averageHealthScore: 0,
    });
    const comparison = (recommendationBasis: 'preferred_verified_prices' | 'lowest_comparable_price') => ({
      parsedItems: items,
      supermarkets: recommendationBasis === 'preferred_verified_prices'
        ? {
            aldi: store('aldi', [match('aldi', items[0], 1), noMatch(items[1])], 1, true),
            lidl: store('lidl', [match('lidl', items[0], 2, true), match('lidl', items[1], 2, true)], 4, false, true),
          }
        : {
            aldi: store('aldi', [match('aldi', items[0], 1), match('aldi', items[1], 1)], 2, true),
            lidl: store('lidl', [match('lidl', items[0], 2), match('lidl', items[1], 2)], 4, false),
          },
      cheapestStore: 'aldi', highestStore: 'lidl', recommendationBasis, comparableCoverage: 2,
      splitOptimization: { stores: [], combinedTotal: 2, savingsVsSingleBest: 0, cheapestSingleStoreName: 'Aldi', explanation: 'Fixture comparison.' },
      estimatedShare: recommendationBasis === 'preferred_verified_prices' ? 0.5 : 0, hasEstimatedPrices: recommendationBasis === 'preferred_verified_prices', timestamp: new Date().toISOString(),
    });

    let response = comparison('preferred_verified_prices');
    await page.route('**/api/parse-list', route => route.fulfill({ json: { items } }));
    await page.route('**/api/compare/stream', route => route.fulfill({
      contentType: 'text/event-stream', body: `data: ${JSON.stringify({ type: 'complete', comparison: response })}\n\n`,
    }));

    await page.goto('/');
    await page.locator('textarea').first().fill('A\nB');
    await page.locator('button:has-text("Compare Prices Now")').first().click();
    await expect(page.locator('text=Verified Prices Preferred').first()).toBeVisible();
    await expect(page.locator('text=Indicative £2.00 vs estimated baseline').first()).toBeVisible();

    response = comparison('lowest_comparable_price');
    await page.locator('button:has-text("Shopping List")').first().click();
    await page.locator('button:has-text("Compare Prices Now")').first().click();
    await expect(page.locator('text=Cheapest Overall').first()).toBeVisible();
  });
});
