import { test, expect } from '@playwright/test';

/**
 * API-backed browser comparison (Playwright project: api-integration).
 *
 * The browser must obtain its comparison from the real Logic-API. Every assertion below
 * is made against the actual /api/compare response the page received, so the client's
 * in-browser fallback engine cannot satisfy this test: with the API unavailable no such
 * response exists and the test fails.
 *
 * Preconditions (handled by playwright.config.ts webServer):
 *   - `npm run build` has produced client/dist
 *   - tests/support/test-api-server.js runs the real API on TEST_API_PORT with an isolated
 *     DATA_DIR, no retailer network access and AI matching disabled
 *
 * Expected values come from the repository's verified catalog (data/catalog.json), which the
 * API falls back to when no live retailer data is reachable. They are server-computed.
 *
 * The completed comparison is accepted from whichever /api/compare response carries it.
 * At the time of writing /api/compare/stream truncates before its `complete` event and the
 * client re-runs the basket against /api/compare — a separate defect recorded for task 04.
 * This test asserts the browser got a complete result from the API; it does not assert
 * which of the two API endpoints delivered it.
 */

const SHOPPING_LIST = ['800g wholemeal bread', '4 pint semi skimmed milk', '12 free range eggs'].join('\n');

// Known catalog-backed result for the list above.
const EXPECTED = {
  itemCount: 3,
  cheapestStore: 'aldi',
  asda: {
    totalPrice: 10.24,
    bread: {
      title: 'ASDA Medium Wholemeal Bread 800g',
      packsNeeded: 1,
      totalQuantity: 800,
      totalPrice: 0.79,
    },
    milk: {
      title: 'ASDA British Fresh Semi-Skimmed Milk 1 Pint (568ml)',
      packsNeeded: 4,
      totalQuantity: 4,
      totalPrice: 3.6,
    },
  },
  aldi: { totalPrice: 6.6 },
};

type Comparison = {
  cheapestStore: string;
  parsedItems: unknown[];
  supermarkets: Record<string, {
    totalPrice: number;
    items: Array<{
      product: { title: string } | null;
      packsNeeded: number;
      totalQuantity: number;
      totalPrice: number;
      confidenceSource?: string;
    }>;
  }>;
  aiCallsUsed?: number;
  meta?: { sources?: { live: number; cache: number; catalog: number; direct: number }; scrapeError?: string };
};

type ApiCaptureRecord = { url: string; status: number; body: string; done: boolean };
type ApiCaptureState = { calls: ApiCaptureRecord[] };

/**
 * Records every /api/compare response the page receives, including the full
 * Server-Sent Events body. Playwright's own response.text() returns only the bytes
 * buffered when the response resolves, which truncates a streamed comparison, so the
 * capture happens in the page around the fetch the application itself performs.
 */
const CAPTURE_SCRIPT = () => {
  const w = window as unknown as { fetch: typeof fetch; __apiCompare?: ApiCaptureState };
  const original = w.fetch;
  w.__apiCompare = { calls: [] };
  w.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    const input = args[0] as RequestInfo | URL;
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (!url.includes('/api/compare')) return response;

    const record = { url, status: response.status, body: '', done: false };
    w.__apiCompare!.calls.push(record);

    if (!response.body) {
      record.body = await response.clone().text();
      record.done = true;
      return response;
    }

    const [captured, forwarded] = response.body.tee();
    void (async () => {
      const reader = captured.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        record.body += decoder.decode(value, { stream: true });
      }
      record.done = true;
    })();

    return new Response(forwarded, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
};

/** Extract the terminal `complete` payload from an SSE comparison stream body. */
function parseCompletedComparison(body: string): Comparison | null {
  for (const chunk of body.split('\n\n')) {
    const event = chunk.trim();
    if (!event.startsWith('data:')) continue;
    let payload: { type?: string; comparison?: Comparison };
    try {
      payload = JSON.parse(event.slice('data:'.length).trim());
    } catch {
      continue;
    }
    if (payload.type === 'complete' && payload.comparison) return payload.comparison;
  }
  // Non-streaming /api/compare returns the comparison directly.
  try {
    const direct = JSON.parse(body);
    return direct && direct.supermarkets ? (direct as Comparison) : null;
  } catch {
    return null;
  }
}

test.describe('API-backed browser comparison', () => {
  test('comparison shown in the browser is produced by the real Logic-API', async ({ page }) => {
    // No API pre-flight check here on purpose: the assertions below must be what fails
    // when the API is unavailable, so that a browser-generated result can never pass.
    await page.addInitScript(CAPTURE_SCRIPT);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.locator('button:has-text("Shopping List")').first().click();

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.fill(SHOPPING_LIST);

    const compareBtn = page.locator('button:has-text("Compare Prices Now")').first();
    await expect(compareBtn).toBeEnabled();

    const comparePromise = page.waitForResponse(
      (res) => res.url().includes('/api/compare') && res.request().method() === 'POST',
      { timeout: 60000 }
    );
    await compareBtn.click();

    // 1. The page really received a comparison from the API.
    const apiResponse = await comparePromise;
    expect(apiResponse.status(), 'browser must receive HTTP 200 from /api/compare').toBe(200);

    await expect(page.locator('h1:has-text("Supermarket Price & Sizing Matrix")')).toBeVisible({ timeout: 60000 });

    const captured = await page.evaluate(
      () => (window as unknown as { __apiCompare: { calls: Array<{ url: string; status: number; body: string }> } }).__apiCompare.calls
    );
    expect(captured.length, 'page must have called /api/compare').toBeGreaterThan(0);
    expect(captured.every((c) => c.status === 200), 'every /api/compare call must succeed').toBe(true);

    const comparison = captured
      .map((c) => parseCompletedComparison(c.body))
      .find((c): c is Comparison => c !== null) ?? null;
    expect(comparison, 'API response must contain a completed comparison').not.toBeNull();
    const result = comparison as Comparison;

    // 2. Known server-side data-source stamps. The in-browser engine emits neither
    //    `meta.sources` nor `aiCallsUsed`, so these can only come from the API.
    expect(result.meta?.sources, 'API must stamp its data sources').toBeTruthy();
    const sources = result.meta!.sources!;
    expect(sources.catalog).toBe(EXPECTED.itemCount);
    expect(sources.live + sources.cache + sources.direct).toBe(0);
    expect(result.aiCallsUsed, 'no AI calls are permitted in this test').toBe(0);

    // 3. Known product, quantity and total for a named store.
    expect(result.parsedItems).toHaveLength(EXPECTED.itemCount);
    expect(result.cheapestStore).toBe(EXPECTED.cheapestStore);

    const asda = result.supermarkets.asda;
    expect(asda.totalPrice).toBeCloseTo(EXPECTED.asda.totalPrice, 2);

    const bread = asda.items[0];
    expect(bread.product?.title).toBe(EXPECTED.asda.bread.title);
    expect(bread.packsNeeded).toBe(EXPECTED.asda.bread.packsNeeded);
    expect(bread.totalQuantity).toBe(EXPECTED.asda.bread.totalQuantity);
    expect(bread.totalPrice).toBeCloseTo(EXPECTED.asda.bread.totalPrice, 2);

    const milk = asda.items[1];
    expect(milk.product?.title).toBe(EXPECTED.asda.milk.title);
    expect(milk.packsNeeded, 'multi-pack quantity must be resolved server side').toBe(
      EXPECTED.asda.milk.packsNeeded
    );
    expect(milk.totalQuantity).toBe(EXPECTED.asda.milk.totalQuantity);
    expect(milk.totalPrice).toBeCloseTo(EXPECTED.asda.milk.totalPrice, 2);

    expect(result.supermarkets.aldi.totalPrice).toBeCloseTo(EXPECTED.aldi.totalPrice, 2);

    // 4. The rendered UI shows that same API result, not a locally computed one.
    await expect(page.locator('h1:has-text("Supermarket Price & Sizing Matrix")')).toBeVisible();
    await expect(
      page.locator(`text=£${EXPECTED.asda.totalPrice.toFixed(2)}`).first(),
      'ASDA basket total from the API must be rendered'
    ).toBeVisible();
    await expect(
      page.locator(`text=£${result.supermarkets.aldi.totalPrice.toFixed(2)}`).first()
    ).toBeVisible();
    await expect(page.locator(`text=${EXPECTED.asda.bread.title}`).first()).toBeVisible();
  });
});
