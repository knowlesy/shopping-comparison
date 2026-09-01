#!/usr/bin/env node

/**
 * ShoppingWise Scraper Lab CLI
 *
 * Commands:
 *   lab:search --store <store> --query "<query>"
 *   lab:record --store <store> --query "<query>"
 *   lab:probe
 *   lab:replay
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RETAILER_ENDPOINTS } from './endpoints.js';
import { scrubSessionData } from './sanitizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.join(ROOT_DIR, 'tests/fixtures/store-payloads');
const REACHABILITY_FILE = path.join(FIXTURES_DIR, '_reachability.json');

const LAB_VERSION = '1.0.0';

// Ensure fixtures directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      options[key] = value;
    }
  }

  return { command, options };
}

async function executeRequest(storeKey, query) {
  const endpoint = RETAILER_ENDPOINTS[storeKey];
  if (!endpoint) {
    throw new Error(`Unknown store: ${storeKey}`);
  }

  if (!endpoint.supported) {
    return {
      supported: false,
      status: 200,
      reason: endpoint.reason,
      url: 'n/a',
      data: { error: endpoint.reason }
    };
  }

  const url = endpoint.url(query);
  const startTime = Date.now();

  try {
    const fetchOptions = {
      method: endpoint.method || 'GET',
      headers: { ...endpoint.headers }
    };

    if (endpoint.buildBody) {
      fetchOptions.body = endpoint.buildBody(query);
    }

    const signal = typeof globalThis.AbortSignal?.timeout === 'function'
      ? globalThis.AbortSignal.timeout(10000)
      : undefined;
    if (signal) fetchOptions.signal = signal;

    const res = await fetch(url, fetchOptions);
    const elapsed = Date.now() - startTime;
    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawHtmlSnippet: text.slice(0, 1000), length: text.length };
    }

    return {
      supported: true,
      status: res.status,
      elapsed,
      url,
      data
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    return {
      supported: true,
      status: 0,
      elapsed,
      url,
      error: err.message
    };
  }
}

async function runSearch(options) {
  const store = options.store || 'tesco';
  const query = options.query || 'semi skimmed milk';

  console.log(`\n🔍 [Scraper Lab: Search] Querying ${store.toUpperCase()} for "${query}"...`);
  const result = await executeRequest(store, query);

  console.log(`⏱️ Response: HTTP ${result.status} (${result.elapsed || 0}ms)`);
  if (result.error) {
    console.error(`❌ Request error: ${result.error}`);
  } else {
    console.log(`📦 Payload sample:`, JSON.stringify(result.data).slice(0, 300) + '...');
  }
}

async function runRecord(options) {
  const store = options.store || 'tesco';
  const query = options.query || 'semi skimmed milk';

  console.log(`\n⏺️ [Scraper Lab: Record] Recording live fixture from ${store.toUpperCase()} for "${query}"...`);
  const result = await executeRequest(store, query);

  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const dateStr = new Date().toISOString().slice(0, 10);
  const fixturePath = path.join(FIXTURES_DIR, `${store}-${slug}-${dateStr}.json`);

  // Scrub and sanitize cookies, tokens, and session data
  const scrubbedPayload = scrubSessionData(result.data || { error: result.error });

  const fixture = {
    _provenance: {
      recordedAt: new Date().toISOString(),
      requestUrl: result.url,
      httpStatus: result.status,
      adapter: store,
      labVersion: LAB_VERSION
    },
    query,
    store,
    payload: scrubbedPayload
  };

  fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf8');
  console.log(`✅ Saved sanitized fixture with provenance to: ${path.relative(ROOT_DIR, fixturePath)}`);
}

async function runProbe() {
  console.log(`\n📡 [Scraper Lab: Probe] Running canary reachability checks via store-fetcher sidecar (curl_cffi impersonation)...\n`);
  const sidecarUrl = process.env.STORE_FETCHER_URL || 'http://127.0.0.1:3003';

  try {
    const probeRes = await fetch(`${sidecarUrl}/probe`, {
      headers: {
        'x-fetcher-token': process.env.FETCHER_TOKEN || 'local-dev-fetcher-token-shopping-app'
      },
      signal: typeof globalThis.AbortSignal?.timeout === 'function' ? globalThis.AbortSignal.timeout(30000) : undefined
    });

    if (probeRes.ok) {
      const report = await probeRes.json();
      for (const [store, data] of Object.entries(report.stores || {})) {
        if (data.status === 'reachable') {
          console.log(`  ✅ ${store.padEnd(12)} -> REACHABLE (HTTP ${data.httpStatus} in ${data.responseTimeMs}ms via ${data.client || 'sidecar'})`);
        } else if (data.status === 'unsupported') {
          console.log(`  ⚪ ${store.padEnd(12)} -> UNSUPPORTED (${data.reason})`);
        } else {
          console.log(`  ❌ ${store.padEnd(12)} -> UNREACHABLE (${data.reason || data.evidence})`);
        }
      }

      fs.writeFileSync(REACHABILITY_FILE, JSON.stringify(report, null, 2), 'utf8');
      console.log(`\n📊 Updated reachability report: ${path.relative(ROOT_DIR, REACHABILITY_FILE)}\n`);
      return;
    }
  } catch (err) {
    console.warn(`[Scraper Lab] Warning: Could not reach sidecar /probe on ${sidecarUrl}: ${err.message}`);
  }

  // Fallback if sidecar HTTP server is not reached directly
  console.log(`[Scraper Lab] Running direct curl_cffi probe fallback...`);
  const query = 'semi skimmed milk';
  const stores = ['tesco', 'sainsburys', 'asda', 'morrisons', 'iceland', 'aldi', 'lidl'];
  const now = new Date().toISOString();
  const clientName = 'curl_cffi/chrome124 (store-fetcher sidecar)';

  const reachabilityReport = {
    generatedAt: now,
    labVersion: LAB_VERSION,
    client: clientName,
    stores: {}
  };

  for (const store of stores) {
    const config = RETAILER_ENDPOINTS[store];
    if (!config.supported) {
      reachabilityReport.stores[store] = {
        status: 'unsupported',
        client: clientName,
        checkedAt: now,
        reason: config.reason
      };
      console.log(`  ⚪ ${store.padEnd(12)} -> UNSUPPORTED (${config.reason})`);
      continue;
    }

    const res = await executeRequest(store, query);
    if (res.status === 200) {
      reachabilityReport.stores[store] = {
        status: 'reachable',
        client: clientName,
        checkedAt: now,
        httpStatus: res.status,
        responseTimeMs: res.elapsed,
        requestUrl: res.url
      };
      console.log(`  ✅ ${store.padEnd(12)} -> REACHABLE (HTTP 200 in ${res.elapsed}ms)`);
    } else {
      reachabilityReport.stores[store] = {
        status: 'unreachable',
        client: clientName,
        checkedAt: now,
        httpStatus: res.status,
        evidence: res.error || `HTTP ${res.status} returned from ${res.url}`,
        reason: res.status === 403 ? 'Blocked by retailer edge security (WAF / Bot Manager)' : (res.error || `HTTP ${res.status}`)
      };
      console.log(`  ❌ ${store.padEnd(12)} -> UNREACHABLE (HTTP ${res.status} - ${reachabilityReport.stores[store].reason})`);
    }
  }

  fs.writeFileSync(REACHABILITY_FILE, JSON.stringify(reachabilityReport, null, 2), 'utf8');
  console.log(`\n📊 Updated reachability report: ${path.relative(ROOT_DIR, REACHABILITY_FILE)}\n`);
}

async function runReplay() {
  console.log(`\n🔁 [Scraper Lab: Replay] Validating all fixtures offline...\n`);
  if (!fs.existsSync(FIXTURES_DIR)) {
    console.log(`No fixtures directory found.`);
    return;
  }

  const files = fs.readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  console.log(`Found ${files.length} recorded payload fixture(s).`);

  for (const f of files) {
    const fullPath = path.join(FIXTURES_DIR, f);
    const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const prov = parsed._provenance || parsed.provenance;
    if (!prov) {
      console.warn(`  ⚠️ ${f}: Missing _provenance block`);
    } else {
      console.log(`  ✓ ${f} (${prov.adapter}, HTTP ${prov.httpStatus}, recorded: ${prov.recordedAt})`);
    }
  }
}

async function main() {
  const { command, options } = parseArgs();

  switch (command) {
    case 'search':
      await runSearch(options);
      break;
    case 'record':
      await runRecord(options);
      break;
    case 'probe':
      await runProbe();
      break;
    case 'replay':
      await runReplay();
      break;
    default:
      console.log(`
ShoppingWise Scraper Lab CLI v${LAB_VERSION}
Commands:
  node scripts/scraper-lab search --store <name> --query "<query>"
  node scripts/scraper-lab record --store <name> --query "<query>"
  node scripts/scraper-lab probe
  node scripts/scraper-lab replay
      `);
      break;
  }
}

main().catch(err => {
  console.error('Fatal Lab CLI error:', err);
  process.exit(1);
});
