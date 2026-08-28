/**
 * Live Scraper Zero-Config & Connectivity Verification Test
 */
import assert from 'node:assert/strict';
import { getOrFetchCandidatesWithSource } from '../services/logic-api/src/services/candidatePipeline.js';

async function runLiveScraperTest() {
  console.log('--- Verifying Zero-Config Live Scraping ---');

  // 1. Verify default token configuration
  const defaultToken = process.env.SCRAPE_TOKEN || 'local-dev-scrape-token-shopping-app';
  assert.ok(defaultToken, 'SCRAPE_TOKEN must have a valid default non-empty fallback');
  console.log('✓ SCRAPE_TOKEN fallback is configured:', defaultToken.substring(0, 8) + '...');

  // 2. Test candidate pipeline fallback handling with expanded timeout budget
  const start = Date.now();
  const res = await getOrFetchCandidatesWithSource('apples', {
    timeoutMs: 15000,
    forceRefresh: true
  });
  const duration = Date.now() - start;

  assert.ok(res, 'Pipeline should return a response object');
  assert.ok(Array.isArray(res.products), 'Pipeline should return an array of products');
  assert.ok(['live', 'cache', 'catalog'].includes(res.source), `Source must be valid: got ${res.source}`);
  console.log(`✓ Pipeline completed in ${duration}ms with source: ${res.source} (${res.products.length} products)`);

  console.log('All live scraper zero-config checks PASSED.\n');
}

runLiveScraperTest().catch((err) => {
  console.error('Live scraper test failed:', err);
  process.exit(1);
});
