import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'price_cache.json');
const HISTORY_FILE = path.join(DATA_DIR, 'shop_history.json');

// Default TTL: 72 Hours (3 Days in milliseconds)
const DEFAULT_TTL_MS = 72 * 60 * 60 * 1000;

export class PriceCache {
  static memoryCache = new Map();
  static diskSyncTimeout = null;

  static init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const now = Date.now();
        let loadedCount = 0;

        for (const [key, entry] of Object.entries(parsed)) {
          if (entry && entry.expiresAt && entry.expiresAt > now) {
            this.memoryCache.set(key, entry);
            loadedCount++;
          }
        }
        console.log(
          `[PriceCache] Loaded ${loadedCount} active price cache entries from disk (72h TTL).`
        );
      }
    } catch (err) {
      console.warn('[PriceCache] Warning: Could not initialize cache from disk:', err.message);
    }
  }

  static get(key) {
    if (!key) return null;
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (entry.expiresAt && entry.expiresAt <= now) {
      this.memoryCache.delete(key);
      this.scheduleDiskSync();
      return null;
    }

    return entry.data;
  }

  static set(key, data, ttlMs = DEFAULT_TTL_MS) {
    if (!key) return;
    const now = Date.now();
    const entry = {
      key,
      data,
      cachedAt: now,
      expiresAt: now + ttlMs
    };

    this.memoryCache.set(key, entry);
    this.scheduleDiskSync();
  }

  static has(key) {
    return this.get(key) !== null;
  }

  static clear() {
    const previousCount = this.memoryCache.size;
    this.memoryCache.clear();
    try {
      if (fs.existsSync(CACHE_FILE)) {
        fs.writeFileSync(CACHE_FILE, JSON.stringify({}, null, 2), 'utf-8');
      }
      console.log(`[PriceCache] Nuked ${previousCount} cache entries from memory and disk.`);
    } catch (err) {
      console.warn('[PriceCache] Error clearing cache file:', err.message);
    }
    return { success: true, clearedCount: previousCount };
  }

  static getStats() {
    const now = Date.now();
    let validCount = 0;
    let totalProductsCached = 0;
    let oldestTimestamp = null;
    let newestTimestamp = null;

    for (const [_, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt > now) {
        validCount++;
        if (Array.isArray(entry.data)) {
          totalProductsCached += entry.data.length;
        } else if (entry.data?.products && Array.isArray(entry.data.products)) {
          totalProductsCached += entry.data.products.length;
        }

        if (!oldestTimestamp || entry.cachedAt < oldestTimestamp) {
          oldestTimestamp = entry.cachedAt;
        }
        if (!newestTimestamp || entry.cachedAt > newestTimestamp) {
          newestTimestamp = entry.cachedAt;
        }
      }
    }

    return {
      entriesCount: validCount,
      estimatedProducts: totalProductsCached,
      ttlHours: 72,
      oldestEntry: oldestTimestamp ? new Date(oldestTimestamp).toISOString() : null,
      newestEntry: newestTimestamp ? new Date(newestTimestamp).toISOString() : null
    };
  }

  static scheduleDiskSync() {
    if (this.diskSyncTimeout) clearTimeout(this.diskSyncTimeout);
    this.diskSyncTimeout = setTimeout(() => {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const obj = {};
        const now = Date.now();
        for (const [key, entry] of this.memoryCache.entries()) {
          if (entry.expiresAt > now) {
            obj[key] = entry;
          }
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
      } catch (err) {
        console.warn('[PriceCache] Error syncing cache to disk:', err.message);
      }
    }, 1000);
  }

  // Persistent shop history helpers (never deleted on cache clear)
  static loadShopHistory() {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
        return JSON.parse(raw) || [];
      }
    } catch (err) {
      console.warn('[PriceCache] Error reading shop history:', err.message);
    }
    return [];
  }

  static saveShopHistory(history) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[PriceCache] Error writing shop history:', err.message);
    }
  }
}

// Initialize on module load
PriceCache.init();
