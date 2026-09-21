// Offline test preloader: temporary household data and no external global-fetch calls.
// Load before application modules; tests may replace fetch with explicit local fakes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopping-offline-test-'));
process.env.DATA_DIR = testDataDir;
process.on('exit', () => fs.rmSync(testDataDir, { recursive: true, force: true }));
process.env.GEMINI_API_KEY = '';
process.env.GOOGLE_GENAI_API_KEY = '';
process.env.ENABLE_GEMINI_MATCHING = 'false';
process.env.ENABLE_MATCH_LOG = 'false';
process.env.MATCH_LOG = 'false';
process.env.DIAGNOSTIC_LOG = 'false';
process.env.NODE_ENV = 'test';
process.env.STORE_FETCHER_URL = 'http://127.0.0.1:9';
process.env.SCRAPER_SERVICE_URL = 'http://127.0.0.1:9/scrape';
process.loadEnvFile = () => {};
const originalFetch = globalThis.fetch;
globalThis.fetch = function(input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    return Promise.reject(new Error('TEST_NETWORK_BLOCKED: external fetch disabled'));
  }
  return originalFetch(input, init);
};
