import { test, expect, Page } from '@playwright/test';

/**
 * Settings ownership (Playwright project: api-integration).
 *
 * The server is the only source of truth for settings. These tests check that the
 * browser cannot override it, that a failed save cannot look successful, and that no
 * Gemini key is ever kept in browser storage.
 *
 * The API under test is the isolated one started by playwright.config.ts, with its own
 * temporary DATA_DIR, so nothing here touches the household's real settings.
 */

const API_PORT = Number(process.env.TEST_API_PORT || 3101);
const API_URL = `http://127.0.0.1:${API_PORT}`;

// Unique per run so a stale value from an earlier run cannot make this pass.
const FAKE_KEY = `AIzaFAKE-not-a-real-key-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const SETTINGS_STORAGE_KEY = 'shoppingwise_settings';

async function readLocalStorage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) out[k] = window.localStorage.getItem(k) ?? '';
    }
    return out;
  });
}

async function openSettings(page: Page) {
  // The header renders a desktop and a mobile button; only one is visible per viewport.
  await page.locator('button[title="Settings"]:visible').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

/** The healthier-yogurt toggle: a plain boolean setting to round-trip. */
function healthierToggle(page: Page) {
  return page.getByRole('checkbox', { name: /Healthier yogurt by default/ });
}

function saveButton(page: Page) {
  return page.getByRole('button', { name: 'Save', exact: true });
}

test.describe('Settings have one owner', () => {
  test('legacy localStorage key is sanitized without touching unrelated data', async ({ page }) => {
    // A browser that used an older build: settings blob with a key in it, plus
    // unrelated list/history data that must survive untouched.
    await page.addInitScript(
      ([storageKey, fakeKey]) => {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ healthierDefault: false, geminiApiKey: fakeKey, fatPercentagePreference: 12 })
        );
        window.localStorage.setItem('shoppingwise_items', JSON.stringify([{ id: 'keep-me', name: 'milk' }]));
        window.localStorage.setItem('shoppingwise_history', JSON.stringify([{ id: 'shop-keep', total: 12.3 }]));
        window.localStorage.setItem('shoppingwise_theme', 'dark');
      },
      [SETTINGS_STORAGE_KEY, FAKE_KEY]
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Settings are fetched on mount; give the sanitisation pass a moment to land.
    await expect.poll(async () => {
      const store = await readLocalStorage(page);
      return JSON.stringify(store).includes(FAKE_KEY);
    }).toBe(false);

    const store = await readLocalStorage(page);

    // 1. The key is gone from every browser storage entry.
    expect(JSON.stringify(store)).not.toContain(FAKE_KEY);
    if (store[SETTINGS_STORAGE_KEY]) {
      expect(store[SETTINGS_STORAGE_KEY]).not.toContain('geminiApiKey');
    }

    // 2. Unrelated data is untouched.
    expect(store['shoppingwise_items']).toContain('keep-me');
    expect(store['shoppingwise_history']).toContain('shop-keep');
    expect(store['shoppingwise_theme']).toBe('dark');
  });

  test('stale browser settings do not override the server', async ({ page, request }) => {
    const serverSettings = await (await request.get(`${API_URL}/api/settings`)).json();

    // A browser carrying settings that disagree with the server.
    await page.addInitScript(
      ([storageKey, serverValue]) => {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ healthierDefault: !serverValue, fatPercentagePreference: 99 })
        );
      },
      [SETTINGS_STORAGE_KEY, serverSettings.healthierDefault]
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openSettings(page);

    await expect(healthierToggle(page)).toBeChecked({ checked: serverSettings.healthierDefault });
  });

  test('a rejected save cannot appear successful', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openSettings(page);

    // The server refuses the write.
    await page.route('**/api/settings', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'settings store unavailable' }),
        });
        return;
      }
      await route.continue();
    });

    const toggle = healthierToggle(page);
    const before = await toggle.isChecked();
    await toggle.setChecked(!before);

    await saveButton(page).click();

    // The change must stay pending and the page must say the save failed. Clearing it
    // would tell the user their change was stored when the server refused it.
    await expect(page.locator('[data-testid="settings-save-error"]')).toBeVisible();
    await expect(saveButton(page)).toBeVisible();
    await expect(page.getByText('1 unsaved change')).toBeVisible();
    await expect(toggle).toBeChecked({ checked: !before });
  });

  test('a successful save survives a new browser session and matches the API', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openSettings(page);

    const toggle = healthierToggle(page);
    const before = await toggle.isChecked();
    const target = !before;
    await toggle.setChecked(target);

    const putResponse = page.waitForResponse(
      (r) => r.url().includes('/api/settings') && r.request().method() === 'PUT'
    );
    await saveButton(page).click();
    const put = await putResponse;
    expect(put.status()).toBe(200);
    // Only what changed is sent.
    expect(Object.keys(put.request().postDataJSON())).toEqual(['healthierDefault']);
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

    // The API is the authority and agrees.
    const apiSettings = await (await request.get(`${API_URL}/api/settings`)).json();
    expect(apiSettings.healthierDefault).toBe(target);
    expect(apiSettings.geminiApiKey, 'the safe response must never carry a key').toBeUndefined();

    // A brand new browser session sees the same thing.
    const fresh = await page.context().browser()!.newContext();
    const freshPage = await fresh.newPage();
    await freshPage.goto(page.url());
    await freshPage.waitForLoadState('networkidle');
    await openSettings(freshPage);
    await expect(healthierToggle(freshPage)).toBeChecked({ checked: target });
    await fresh.close();

    // Put it back so the ordering of tests cannot matter.
    await request.put(`${API_URL}/api/settings`, { data: { healthierDefault: before } });
  });

  test('a key entered in the UI never reaches browser storage or the safe response', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openSettings(page);
    await page.getByRole('button', { name: 'Advanced' }).click();

    // The key field only renders once AI fallback matching is switched on.
    const aiToggle = page.getByRole('checkbox', { name: /Google Gemini AI fallback matching/ });
    await aiToggle.setChecked(true);

    const keyInput = page.locator('input[type="password"]').first();
    await expect(keyInput).toBeVisible();
    await keyInput.fill(FAKE_KEY);

    const putResponse = page.waitForResponse(
      (r) => r.url().includes('/api/settings') && r.request().method() === 'PUT'
    );
    await saveButton(page).click();
    await putResponse;
    // The write-only field is cleared once the server has the key.
    await expect(keyInput).toHaveValue('');

    // Not in any browser storage entry.
    const store = await readLocalStorage(page);
    expect(JSON.stringify(store)).not.toContain(FAKE_KEY);

    // Not in the safe settings response.
    const safe = await (await request.get(`${API_URL}/api/settings`)).text();
    expect(safe).not.toContain(FAKE_KEY);

    // Not in a comparison payload either.
    const compare = await request.post(`${API_URL}/api/compare`, {
      data: { items: [{ name: 'milk', rawText: '4 pint semi skimmed milk', targetQuantity: 4, unit: 'g' }] },
    });
    expect(await compare.text()).not.toContain(FAKE_KEY);

    // Clear it again so it cannot linger in the test API's memory.
    await request.put(`${API_URL}/api/settings`, { data: { geminiApiKey: '', aiMatchingEnabled: false } });
  });

  test('food ratings are radiogroups that save as ratings and survive a reload', async ({ page, request }) => {
    const before = await (await request.get(`${API_URL}/api/settings`)).json();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openSettings(page);

    const whiteBread = page.getByRole('radiogroup', { name: 'White', exact: true }).first();
    await expect(whiteBread.getByRole('radio')).toHaveCount(3);

    // Keyboard: focus the checked option and move with the arrow keys.
    await whiteBread.getByRole('radio', { checked: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(whiteBread.getByRole('radio', { name: /^Never/ })).toBeChecked();

    const putResponse = page.waitForResponse(
      (r) => r.url().includes('/api/settings') && r.request().method() === 'PUT'
    );
    await saveButton(page).click();
    expect((await putResponse).status()).toBe(200);

    const after = await (await request.get(`${API_URL}/api/settings`)).json();
    expect(after.foodRatings.bread.white).toBe('never');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('radiogroup', { name: 'White', exact: true }).first().getByRole('radio', { name: /^Never/ })
    ).toBeChecked();

    await request.put(`${API_URL}/api/settings`, { data: { foodRatings: before.foodRatings } });
  });

  test('the chosen section is remembered and the page fits a 400px screen', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openSettings(page);

    await page.getByRole('button', { name: 'Deals & brands' }).click();
    await expect(page.getByRole('heading', { name: 'Brand tier' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('settingsSection'))).toBe('deals');

    for (const section of ['Food & diet', 'Stores & delivery', 'Deals & brands', 'Advanced']) {
      await page.getByRole('button', { name: section }).click();
      // The app root clips sideways overflow, so measure the content itself.
      const overflow = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        return main.scrollWidth - main.clientWidth;
      });
      expect(overflow, `${section} must not scroll sideways`).toBeLessThanOrEqual(0);
    }

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Advanced' })).toHaveAttribute('aria-current', 'page');
  });

  test('the preview shows the effect on the loaded comparison without fetching anything', async ({ page, request }) => {
    const bread = { id: 'b', name: 'bread', rawText: 'bread', baseItem: 'bread', category: 'general', targetQuantity: 1, unit: 'item' };
    const product = (id: string, title: string, price: number) => ({ id, supermarket: 'tesco', title, price, brand: '', source: 'live' });
    const comparison = {
      parsedItems: [bread],
      supermarkets: {
        tesco: {
          supermarket: 'tesco',
          info: { id: 'tesco', name: 'Tesco', themeColor: '#00539f', deliveryMinOrder: 40, deliveryFee: 4.5, searchBaseUrl: 'https://example.invalid' },
          items: [{
            parsedItem: bread, itemId: 'b', supermarket: 'tesco', packsNeeded: 1, totalQuantity: 1, totalPrice: 0.75, lines: [], matchScore: 90,
            product: product('w', 'Tesco Medium Sliced White Bread 800g', 0.75),
            alternatives: [product('m', 'Tesco Wholemeal Medium Sliced Bread 800g', 0.95)],
          }],
          subtotal: 0.75, deliveryFee: 0, totalPrice: 0.75, savingsVsHighest: 0, itemsFound: 1, itemsTotal: 1, missingItems: [], isCheapest: true, averageHealthScore: null,
        },
      },
      cheapestStore: 'tesco', highestStore: 'tesco',
      splitOptimization: { stores: [], combinedTotal: 0.75, savingsVsSingleBest: 0, cheapestSingleStoreName: 'Tesco', explanation: '' },
      timestamp: new Date().toISOString(),
    };
    await page.addInitScript(([c, i]) => {
      window.localStorage.setItem('shoppingwise_active_comparison', c);
      window.localStorage.setItem('shoppingwise_items', i);
    }, [JSON.stringify(comparison), JSON.stringify([bread])]);

    // A known starting point: every type OK.
    const before = await (await request.get(`${API_URL}/api/settings`)).json();
    await request.put(`${API_URL}/api/settings`, { data: { foodRatings: {} } });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openSettings(page);

    const compareCalls: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/api/compare')) compareCalls.push(r.url()); });

    const panel = page.getByRole('complementary', { name: 'Effect on this week' });
    await expect(panel).toContainText('Change a rating');

    // Love wholemeal: the loaded alternative at Tesco now wins, 20p dearer.
    await page.getByRole('radiogroup', { name: 'Wholemeal / brown', exact: true }).first().locator('label').first().click();
    await expect(panel).toContainText('1 item change');
    await expect(panel).toContainText('Tesco');
    await expect(panel).toContainText('+£0.20');

    expect(compareCalls, 'the preview must not re-run a comparison').toEqual([]);

    await request.put(`${API_URL}/api/settings`, { data: { foodRatings: before.foodRatings } });
  });
});
