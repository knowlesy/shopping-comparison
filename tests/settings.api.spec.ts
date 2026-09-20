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
  await page.locator('button[title="Comparison Preferences"]:visible').first().click();
  await expect(page.locator('button:has-text("Apply & Save Settings")')).toBeVisible();
}

/** The "Default to Healthier Options" toggle — a plain boolean setting to round-trip. */
function healthierToggle(page: Page) {
  return page.locator('input[type="checkbox"]').first();
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

    await page.locator('button:has-text("Apply & Save Settings")').click();

    // The modal must stay open and say the save failed. Silently closing would tell
    // the user their change was stored when the server refused it.
    await expect(page.locator('[data-testid="settings-save-error"]')).toBeVisible();
    await expect(page.locator('button:has-text("Apply & Save Settings")')).toBeVisible();
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
    await page.locator('button:has-text("Apply & Save Settings")').click();
    const put = await putResponse;
    expect(put.status()).toBe(200);

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

    // The key field only renders once AI fallback matching is switched on.
    const aiToggle = page
      .locator('label', { hasText: 'Google Gemini AI Fallback Matching' })
      .locator('input[type="checkbox"]')
      .first();
    await aiToggle.setChecked(true);

    const keyInput = page.locator('input[type="password"]').first();
    await expect(keyInput).toBeVisible();
    await keyInput.fill(FAKE_KEY);

    const putResponse = page.waitForResponse(
      (r) => r.url().includes('/api/settings') && r.request().method() === 'PUT'
    );
    await page.locator('button:has-text("Apply & Save Settings")').click();
    await putResponse;

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
});
