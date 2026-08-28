import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
const HISTORY_FILE = path.join(DATA_DIR, 'price_history.json');

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

    const snapshot = {
      id: `snap-${Date.now()}`,
      timestamp: comparison.timestamp || new Date().toISOString(),
      itemsCount: (comparison.parsedItems || []).length,
      cheapestStore: comparison.cheapestStore,
      supermarketTotals,
      meta: comparison.meta || {},
      items: itemsSummary
    };

    snapshots.unshift(snapshot);
    // Keep max 100 snapshots
    const trimmed = snapshots.slice(0, 100);
    this.saveSnapshots(trimmed);
    return snapshot;
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

    return {
      totalComparisons,
      winRates,
      sourceRatios,
      categoryActivity: categoryCounts,
      recentSnapshots: snapshots.slice(0, 10)
    };
  }
}
