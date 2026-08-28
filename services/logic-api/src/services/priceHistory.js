import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const HISTORY_FILE = path.join(DATA_DIR, 'price_history.json');
const ITEM_HISTORY_FILE = path.join(DATA_DIR, 'item_price_history.json');

export class PriceHistory {
  static loadSnapshots() {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
        return JSON.parse(raw) || [];
      }
    } catch (err) {
      console.warn('[PriceHistory] Error reading price history:', err.message);
    }
    return [];
  }

  static saveSnapshots(snapshots) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(snapshots, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[PriceHistory] Error saving price history:', err.message);
    }
  }

  static loadItemRows() {
    try {
      if (fs.existsSync(ITEM_HISTORY_FILE)) {
        const raw = fs.readFileSync(ITEM_HISTORY_FILE, 'utf-8');
        return JSON.parse(raw) || [];
      }
    } catch (err) {
      console.warn('[PriceHistory] Error reading item price history:', err.message);
    }
    return [];
  }

  static saveItemRows(rows) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(ITEM_HISTORY_FILE, JSON.stringify(rows, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[PriceHistory] Error saving item price history:', err.message);
    }
  }

  /**
   * Records a snapshot of comparison results, including per-item price rows per store per day.
   * Explicitly skips matches where isEstimated or confidenceSource === 'catalog'.
   * @param {object} comparison
   * @returns {object} snapshot
   */
  static recordSnapshot(comparison) {
    if (!comparison || !comparison.supermarkets) return;
    const snapshots = this.loadSnapshots();

    const supermarketTotals = {};
    for (const [store, basket] of Object.entries(comparison.supermarkets)) {
      if (basket && basket.totalPrice > 0) {
        supermarketTotals[store] = basket.totalPrice;
      }
    }

    const itemsSummary = (comparison.parsedItems || []).map((item) => ({
      name: item.name,
      category: item.category || 'general'
    }));

    // Record per-item rows skipping estimated/catalog data
    const dateStr = (comparison.timestamp ? new Date(comparison.timestamp) : new Date()).toISOString().slice(0, 10);
    const existingItemRows = this.loadItemRows();
    const newItemRows = [];

    for (const [store, basket] of Object.entries(comparison.supermarkets || {})) {
      for (const match of basket?.matches || []) {
        if (match.isEstimated || match.confidenceSource === 'catalog' || match.product?.source === 'catalog') {
          continue; // Do NOT record fabricated catalog estimates in item stats
        }
        if (!match.product || !match.parsedItem) continue;

        const itemKey = (match.parsedItem.name || match.parsedItem.baseItem || '').toLowerCase().trim();
        if (!itemKey) continue;

        const row = {
          itemKey,
          store,
          unitPrice: match.product.unitPrice ?? match.product.price,
          totalPrice: match.totalPrice ?? match.product.price,
          source: match.product.source || match.confidenceSource || 'live',
          date: dateStr,
          timestamp: comparison.timestamp || new Date().toISOString()
        };
        newItemRows.push(row);
      }
    }

    // Dedupe per itemKey x store x date and cap to 90 days
    const cutoffDate = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const combined = [...newItemRows, ...existingItemRows].filter((r) => {
      const ts = r.timestamp ? new Date(r.timestamp).getTime() : new Date(r.date).getTime();
      return ts >= cutoffDate;
    });

    const seen = new Set();
    const dedupedItemRows = [];
    for (const row of combined) {
      const key = `${row.itemKey}:${row.store}:${row.date}`;
      if (!seen.has(key)) {
        seen.add(key);
        dedupedItemRows.push(row);
      }
    }
    this.saveItemRows(dedupedItemRows);

    const snapshot = {
      id: `snap-${Date.now()}`,
      timestamp: comparison.timestamp || new Date().toISOString(),
      itemsCount: (comparison.parsedItems || []).length,
      cheapestStore: comparison.cheapestStore,
      supermarketTotals,
      meta: comparison.meta || {},
      items: itemsSummary,
      itemRows: newItemRows
    };

    snapshots.unshift(snapshot);
    // Keep max 100 snapshots
    const trimmed = snapshots.slice(0, 100);
    this.saveSnapshots(trimmed);
    return snapshot;
  }

  static getItemSeries(itemKey) {
    if (!itemKey) return { itemKey: '', series: {} };
    const normalizedKey = itemKey.toLowerCase().trim();
    const rows = this.loadItemRows().filter((r) => r.itemKey === normalizedKey);
    const seriesByStore = {};
    for (const row of rows) {
      if (!seriesByStore[row.store]) seriesByStore[row.store] = [];
      seriesByStore[row.store].push({
        date: row.date,
        unitPrice: row.unitPrice,
        totalPrice: row.totalPrice,
        source: row.source
      });
    }
    for (const store of Object.keys(seriesByStore)) {
      seriesByStore[store].sort((a, b) => a.date.localeCompare(b.date));
    }
    return {
      itemKey: normalizedKey,
      series: seriesByStore
    };
  }

  static getStats() {
    const snapshots = this.loadSnapshots();
    const totalComparisons = snapshots.length;

    const winCounts = {};
    let totalSources = { live: 0, cache: 0, catalog: 0 };
    const categoryCounts = {};

    for (const snap of snapshots) {
      if (snap.cheapestStore) {
        winCounts[snap.cheapestStore] = (winCounts[snap.cheapestStore] || 0) + 1;
      }
      if (snap.meta?.sources) {
        totalSources.live += snap.meta.sources.live || 0;
        totalSources.cache += snap.meta.sources.cache || 0;
        totalSources.catalog += snap.meta.sources.catalog || 0;
      }
      for (const item of snap.items || []) {
        const cat = item.category || 'general';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      }
    }

    const winRates = {};
    for (const [store, count] of Object.entries(winCounts)) {
      winRates[store] = {
        wins: count,
        percentage: totalComparisons > 0 ? Math.round((count / totalComparisons) * 100) : 0
      };
    }

    const totalMatches = totalSources.live + totalSources.cache + totalSources.catalog;
    const sourceRatios = {
      live: totalMatches > 0 ? Math.round((totalSources.live / totalMatches) * 100) : 0,
      cache: totalMatches > 0 ? Math.round((totalSources.cache / totalMatches) * 100) : 0,
      catalog: totalMatches > 0 ? Math.round((totalSources.catalog / totalMatches) * 100) : 0,
      counts: totalSources
    };

    const itemRows = this.loadItemRows();
    const uniqueTrackedItems = Array.from(new Set(itemRows.map((r) => r.itemKey)));

    return {
      totalComparisons,
      winRates,
      sourceRatios,
      categoryActivity: categoryCounts,
      trackedItemsCount: uniqueTrackedItems.length,
      trackedItems: uniqueTrackedItems.slice(0, 20),
      recentSnapshots: snapshots.slice(0, 10)
    };
  }
}
