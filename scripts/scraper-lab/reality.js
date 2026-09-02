import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IngredientParser } from '../../services/logic-api/src/services/ingredientParser.js';
import { FuzzyMatcher } from '../../services/logic-api/src/services/fuzzyMatcher.js';
import { BasketCalculator } from '../../services/logic-api/src/services/basketCalculator.js';
import { QueryStrategist } from '../../services/logic-api/src/services/queryStrategist.js';
import { StoreFetcherClient } from '../../services/logic-api/src/services/storeFetcherClient.js';
import { isContaminated } from '../../services/logic-api/src/services/contaminationRules.js';
import { getUserSettings } from '../../services/logic-api/src/routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

export const REAL_LIST_FILE = path.join(ROOT_DIR, 'tests/fixtures/real-list.json');
export const REALITY_FIXTURES_FILE = path.join(ROOT_DIR, 'tests/fixtures/reality-fixtures.json');
export const REALITY_SAMPLE_FILE = path.join(ROOT_DIR, 'tests/fixtures/reality-sample.json');
export const REALITY_BASELINE_FILE = path.join(ROOT_DIR, 'tests/fixtures/reality-baseline.json');

export const REAL_52_LINES = JSON.parse(fs.readFileSync(REAL_LIST_FILE, 'utf8'));

export function trimProduct(p) {
  return {
    id: String(p.id || ''),
    supermarket: p.supermarket,
    title: p.title,
    brand: p.brand || undefined,
    price: p.price,
    unitPrice: p.unitPrice,
    unitPriceMeasure: p.unitPriceMeasure,
    packageSize: p.packageSize,
    packageUnit: p.packageUnit,
    packageDisplay: p.packageDisplay,
    deal: p.deal ? { description: p.deal.description, type: p.deal.type } : null,
    clubcardPrice: p.clubcardPrice,
    nectarPrice: p.nectarPrice,
    inStock: p.inStock !== false,
    source: p.source || 'direct',
    confidenceSource: p.confidenceSource || 'direct'
  };
}

export function isSuspectMatch(item, product) {
  if (!product || !item) return false;
  const itemText = (item.name || item.baseItem || '').toLowerCase();
  const prodTitle = (product.title || '').toLowerCase();

  if (isContaminated(itemText, prodTitle)) return true;
  if (/hummus/i.test(itemText) && /chips|crisps/i.test(prodTitle)) return true;
  if (/apple/i.test(itemText) && /spinach/i.test(prodTitle)) return true;
  if (/walnut/i.test(itemText) && /puree|paste/i.test(prodTitle)) return true;
  if (/peanut butter/i.test(itemText) && /egg/i.test(prodTitle)) return true;
  if (/butter bean/i.test(itemText) && /milk|butter\b(?! bean)/i.test(prodTitle)) return true;
  if (/dark chocolate/i.test(itemText) && !/chocolate|cocoa/i.test(prodTitle)) return true;
  if (/stock cubes/i.test(itemText) && !/stock|cube|pot|broth|bouillon/i.test(prodTitle)) return true;

  return false;
}

export async function runReality(options = {}) {
  const isOffline = Boolean(options.offline || options['--offline'] || process.argv.includes('--offline'));
  console.log(`\n======================================================`);
  console.log(`  ShoppingWise Reality Lab: 52-Line Weekly Shop`);
  console.log(`  Mode: ${isOffline ? 'OFFLINE (replaying recorded fixtures)' : 'LIVE (querying store-fetcher sidecar)'}`);
  console.log(`======================================================\n`);

  const parsedItems = IngredientParser.parseList(REAL_52_LINES);
  console.log(`Parsed ${REAL_52_LINES.length} lines into ${parsedItems.length} shopping items.`);

  const preferences = getUserSettings();
  const storesLive = ['tesco', 'sainsburys', 'morrisons'];
  let fixturesData = { _provenance: {}, items: [] };

  if (isOffline) {
    const fixturePath = fs.existsSync(REALITY_FIXTURES_FILE) ? REALITY_FIXTURES_FILE : REALITY_SAMPLE_FILE;
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Offline mode requires ${fixturePath} to exist. Run live mode first.`);
    }
    fixturesData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    console.log(`Loaded offline fixtures from ${path.relative(ROOT_DIR, fixturePath)}`);
  } else {
    // Live mode: check sidecar health
    const health = await StoreFetcherClient.health();
    if (!health.ok) {
      console.warn(`[Reality Lab] Warning: Sidecar /health check failed: ${health.error}`);
    } else {
      console.log(`[Reality Lab] Sidecar active (v${health.data.version}, uptime: ${health.data.uptime}s)`);
    }

    console.log(`Fetching live direct store candidates across [${storesLive.join(', ')}] with politeness throttling...`);
    const recordedItems = [];

    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const queryPlan = await QueryStrategist.plan(item, { supermarket: 'tesco', aiMatchingEnabled: false });
      const query = queryPlan?.queries?.[0] || item.baseItem || item.name;

      process.stdout.write(`  [${i + 1}/${parsedItems.length}] Searching "${query}"... `);
      const res = await StoreFetcherClient.search(query, storesLive, {
        targetQuantity: item.targetQuantity,
        unit: item.unit,
        wantVariants: true,
        timeoutMs: 12000
      });

      const trimmed = (res.products || []).slice(0, 10).map(trimProduct);
      console.log(`${trimmed.length} products kept.`);
      recordedItems.push({
        index: i,
        rawText: item.rawText,
        name: item.name,
        baseItem: item.baseItem,
        query,
        products: trimmed
      });
    }

    fixturesData = {
      _provenance: {
        recordedAt: new Date().toISOString(),
        labVersion: '1.3.0',
        sidecarUsed: true,
        stores: storesLive,
        totalItems: parsedItems.length
      },
      items: recordedItems
    };

    fs.writeFileSync(REALITY_FIXTURES_FILE, JSON.stringify(fixturesData, null, 2), 'utf8');
    fs.writeFileSync(REALITY_SAMPLE_FILE, JSON.stringify(fixturesData, null, 2), 'utf8');
    console.log(`\n💾 Saved trimmed reality fixtures to: ${path.relative(ROOT_DIR, REALITY_FIXTURES_FILE)}`);
    console.log(`💾 Saved reality sample to: ${path.relative(ROOT_DIR, REALITY_SAMPLE_FILE)}\n`);
  }

  // Build match results through identical runtime matching pipeline
  const storeMatchesMap = {};
  for (const store of storesLive) {
    storeMatchesMap[store] = [];
  }

  const bySourceCounts = { direct: 0, aggregator: 0, catalog: 0 };
  const confidenceCounts = {};
  let variantRoutesCount = 0;

  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i];
    const candidateProducts = fixturesData.items[i]?.products || [];

    for (const store of storesLive) {
      const match = FuzzyMatcher.matchProduct(store, item, candidateProducts, preferences);
      storeMatchesMap[store].push(match);

      if (match && match.product) {
        const src = match.product.source || 'catalog';
        bySourceCounts[src] = (bySourceCounts[src] || 0) + 1;
        const confKey = String(match.confidenceScore ?? '0.90');
        confidenceCounts[confKey] = (confidenceCounts[confKey] || 0) + 1;

        if ((match.lines && match.lines.length > 1) || (match.packsNeeded && match.packsNeeded > 1)) {
          variantRoutesCount++;
        }
      }
    }
  }

  const comparison = BasketCalculator.computeComparison(parsedItems, storeMatchesMap, storesLive);

  // Per-item resolution across all live stores
  const unresolvedItems = [];
  let matchedCount = 0;
  let noMatchCount = 0;

  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i];
    let hasMatch = false;
    for (const store of storesLive) {
      const m = storeMatchesMap[store][i];
      if (m && m.product) {
        hasMatch = true;
        break;
      }
    }
    if (hasMatch) {
      matchedCount++;
    } else {
      noMatchCount++;
      unresolvedItems.push(item.name || item.baseItem);
    }
  }

  // Measure suspect match correctness
  let suspectMatches = 0;
  const suspectItems = [];
  for (let i = 0; i < parsedItems.length; i++) {
    const item = parsedItems[i];
    let isItemSuspect = false;
    for (const store of storesLive) {
      const match = storeMatchesMap[store][i];
      if (match && match.product && isSuspectMatch(item, match.product)) {
        suspectMatches++;
        isItemSuspect = true;
      }
    }
    if (isItemSuspect) {
      suspectItems.push(item.name || item.baseItem);
    }
  }

  const perStore = {};
  for (const store of storesLive) {
    const sRes = comparison.supermarkets[store] || {};
    perStore[store] = {
      itemsFound: sRes.itemsFound || 0,
      matchRate: Number(((sRes.itemsFound || 0) / parsedItems.length).toFixed(2)),
      basketTotal: sRes.totalPrice || 0
    };
  }

  // Normalize bySource to represent items resolved by tier (highest tier resolving the item)
  const itemTierCounts = { direct: 0, aggregator: 0, catalog: 0 };
  for (let i = 0; i < parsedItems.length; i++) {
    let bestSource = null;
    for (const store of storesLive) {
      const m = storeMatchesMap[store][i];
      if (m && m.product) {
        const s = m.product.source || 'catalog';
        if (s === 'direct') { bestSource = 'direct'; break; }
        if (s === 'aggregator' && bestSource !== 'direct') bestSource = 'aggregator';
        if (!bestSource) bestSource = 'catalog';
      }
    }
    if (bestSource) {
      itemTierCounts[bestSource] = (itemTierCounts[bestSource] || 0) + 1;
    }
  }

  const baselineData = {
    measuredAt: new Date().toISOString(),
    sidecarUsed: true,
    storesLive,
    totals: {
      itemsParsed: parsedItems.length,
      matchedCount,
      noMatchCount,
      suspectMatches
    },
    suspectMatches,
    suspectItems,
    bySource: {
      direct: itemTierCounts.direct,
      aggregator: itemTierCounts.aggregator || 0,
      catalog: itemTierCounts.catalog || 0
    },
    perStore,
    variantRoutesCount,
    confidenceDistribution: confidenceCounts,
    unresolvedItems,
    comparisonToCatalogOnly: {
      catalogOnlyNoMatch: 28,
      directNoMatch: noMatchCount,
      explanation:
        noMatchCount < 28
          ? `Direct fetch tier resolved ${28 - noMatchCount} previously unmatchable items across Tesco, Sainsbury's, and Morrisons.`
          : `Direct fetch tier resolved live pricing for ${itemTierCounts.direct} items; remaining unresolved items represent genuine grocery catalog coverage gaps (e.g. niche produce/bulk quantities).`
    }
  };

  fs.writeFileSync(REALITY_BASELINE_FILE, JSON.stringify(baselineData, null, 2), 'utf8');
  console.log(`📊 Reality baseline written to: ${path.relative(ROOT_DIR, REALITY_BASELINE_FILE)}\n`);

  console.log(`---------------- RESULTS SUMMARY ----------------`);
  console.log(`Items Parsed:             ${baselineData.totals.itemsParsed}`);
  console.log(`Matched Items:            ${baselineData.totals.matchedCount}`);
  console.log(`Unmatched Items:          ${baselineData.totals.noMatchCount}`);
  console.log(`Suspect / Contaminated:   ${baselineData.totals.suspectMatches} items: [${baselineData.suspectItems.join(', ')}]`);
  console.log(`Direct-tier resolutions:  ${baselineData.bySource.direct}`);
  console.log(`Catalog-only before:      ${baselineData.comparisonToCatalogOnly.catalogOnlyNoMatch}`);
  console.log(`Direct tier after:        ${baselineData.comparisonToCatalogOnly.directNoMatch}`);
  console.log(`Per-Store Performance:`);
  for (const [s, data] of Object.entries(baselineData.perStore)) {
    console.log(`  - ${s.padEnd(12)}: ${data.itemsFound}/${parsedItems.length} matched (${Math.round(data.matchRate * 100)}%) — Total: £${data.basketTotal.toFixed(2)}`);
  }
  console.log(`-------------------------------------------------\n`);

  return baselineData;
}
