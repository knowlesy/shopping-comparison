import dotenv from 'dotenv';
dotenv.config();

const STORE_FETCHER_URL = process.env.STORE_FETCHER_URL || 'http://127.0.0.1:3003';
const FETCHER_TOKEN = process.env.FETCHER_TOKEN || 'local-dev-fetcher-token-shopping-app';

export class StoreFetcherClient {
  /**
   * Check health and adapter availability of the store-fetcher sidecar.
   * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
   */
  static async health() {
    try {
      const signal = typeof globalThis.AbortSignal?.timeout === 'function'
        ? globalThis.AbortSignal.timeout(3000)
        : undefined;

      const res = await fetch(`${STORE_FETCHER_URL}/health`, {
        method: 'GET',
        headers: {
          'x-fetcher-token': FETCHER_TOKEN
        },
        signal
      });
      if (!res.ok) {
        return { ok: false, error: `Sidecar returned status ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Search direct retailer backends via store-fetcher sidecar.
   * Graceful failure: never throws unhandled errors into the pipeline.
   *
   * @param {string} query - Clean food search query
   * @param {string[]} stores - List of stores to query (e.g. ['tesco', 'asda'])
   * @param {object} options - { timeoutMs = 8000, targetQuantity, unit, wantVariants }
   * @returns {Promise<{ success: boolean, products: Array, stores: object, error?: string }>}
   */
  static async search(query, stores = [], options = {}) {
    const {
      timeoutMs = 8000,
      targetQuantity = null,
      unit = null,
      wantVariants = false
    } = options;

    const startTime = Date.now();

    try {
      const signal = typeof globalThis.AbortSignal?.timeout === 'function'
        ? globalThis.AbortSignal.timeout(timeoutMs)
        : undefined;

      const response = await fetch(`${STORE_FETCHER_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-fetcher-token': FETCHER_TOKEN
        },
        body: JSON.stringify({
          query,
          stores,
          targetQuantity,
          unit,
          wantVariants
        }),
        signal
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          success: false,
          products: [],
          stores: {},
          error: `Sidecar search returned status ${response.status}: ${errorText}`
        };
      }

      const data = await response.json();
      const elapsed = Date.now() - startTime;
      console.log(
        `[Logic-API -> StoreFetcherClient] Completed search for "${query}" across [${stores.join(',')}] in ${elapsed}ms`
      );

      // Collect normalised products across all returned stores
      const allProducts = [];
      const storeMap = data.stores || {};

      for (const [storeName, storeResult] of Object.entries(storeMap)) {
        if (Array.isArray(storeResult?.products)) {
          for (const prod of storeResult.products) {
            allProducts.push({
              ...prod,
              supermarket: prod.supermarket || storeName,
              source: 'direct',
              confidenceSource: 'direct'
            });
          }
        }
      }

      return {
        success: true,
        products: allProducts,
        stores: storeMap,
        source: 'direct'
      };
    } catch (err) {
      // Graceful failure: sidecar offline, timed out, or network error
      const elapsed = Date.now() - startTime;
      console.warn(
        `[Logic-API -> StoreFetcherClient] Direct fetch failed for "${query}" (${elapsed}ms): ${err.message}`
      );
      return {
        success: false,
        products: [],
        stores: {},
        error: err.message
      };
    }
  }
}
