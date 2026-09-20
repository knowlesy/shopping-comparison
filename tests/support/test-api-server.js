/**
 * Isolated Logic-API instance for browser integration tests.
 *
 * Starts the real application (services/logic-api/src/app.js — same middleware and
 * routers as production) on a dedicated port, with:
 *   - an isolated DATA_DIR, so the household's cache/history/settings are never read or written
 *   - external boundaries (scraper pod, store-fetcher sidecar) pointed at a closed port,
 *     so no live retailer traffic leaves the machine and the run falls back to the
 *     repository's verified catalog deterministically
 *   - Gemini/AI matching disabled with a dummy key, so no model call is ever made
 *
 * It intentionally does NOT read the repository .env: it runs from its own temp
 * directory and sets every sensitive variable explicitly before importing the app.
 *
 * Usage: node tests/support/test-api-server.js
 * Env:   TEST_API_PORT (default 3101), TEST_API_DATA_DIR (default: fresh temp dir)
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const PORT = Number(process.env.TEST_API_PORT || 3101);

const dataDir =
  process.env.TEST_API_DATA_DIR ||
  fs.mkdtempSync(path.join(os.tmpdir(), 'shoppingwise-test-api-'));
fs.mkdirSync(dataDir, { recursive: true });

// A closed loopback port: connections are refused immediately, so the candidate
// pipeline degrades to the catalog tier without waiting on a network timeout.
const CLOSED_PORT_URL = 'http://127.0.0.1:9';

// Set before importing the app: several services read these at module load.
process.env.DATA_DIR = dataDir;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || `http://127.0.0.1:${process.env.TEST_CLIENT_PORT || 4180}`;
process.env.SCRAPER_SERVICE_URL = `${CLOSED_PORT_URL}/scrape`;
process.env.STORE_FETCHER_URL = CLOSED_PORT_URL;
// Defined but empty: the settings owner treats ANY non-empty key as "AI configured
// externally" and switches matching on, so a dummy value would enable real model calls.
// Defining the variables also stops dotenv from importing the repository's real key.
process.env.ENABLE_GEMINI_MATCHING = 'false';
process.env.GEMINI_API_KEY = '';
process.env.GOOGLE_GENAI_API_KEY = '';
process.env.ENABLE_AUTH = 'false';
process.env.ENABLE_MATCH_LOG = 'false';
process.env.DIAGNOSTIC_LOG = 'false';

// Run from the isolated data directory so a repository .env (which holds a real
// Gemini key) is never loaded into this process by dotenv.
process.chdir(dataDir);

const { createApp } = await import('../../services/logic-api/src/app.js');

const app = createApp();
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[test-api] Logic-API listening on http://127.0.0.1:${PORT}`);
  console.log(`[test-api] DATA_DIR=${dataDir}`);
  console.log('[test-api] external scraper/fetcher disabled; AI matching disabled');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
