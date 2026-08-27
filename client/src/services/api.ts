import {
  ParsedItem,
  ComparisonResponse,
  SupermarketName,
  SupermarketProduct,
  UserPreferences,
  SavedShop,
  FavoriteItem,
  IngredientIdea,
  CacheStats,
} from '../types';
import {
  ClientShoppingParser,
  ClientSupermarketComparisonService,
  DEFAULT_INGREDIENT_IDEAS,
} from './clientEngine';

const API_BASE = '/api';

const DEFAULT_PREFERENCES: UserPreferences = {
  healthierDefault: true,
  fatPercentagePreference: 5,
  preferWholewheat: true,
  preferFreeRange: true,
  preferOrganic: false,
  cutMatchingStrategy: 'best_value',
  brandTierPriority: 'standard',
  packSizingPolicy: 'closest',
  enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'],
};

export interface ComparisonProgress {
  type: 'init' | 'progress' | 'item_matched' | 'complete' | 'error';
  currentItemIndex?: number;
  totalItems?: number;
  totalChecks?: number;
  completedChecks?: number;
  percent?: number;
  itemName?: string;
  status?: string;
  comparison?: ComparisonResponse;
  error?: string;
}

export const api = {
  // Parse raw text shopping list
  parseList: async (rawText: string): Promise<ParsedItem[]> => {
    try {
      const res = await fetch(`${API_BASE}/parse-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          return data.items;
        }
      }
    } catch {
      // Fall through to client parser
    }
    return ClientShoppingParser.parse(rawText);
  },

  // Compare items across supermarkets with live streaming progress updates
  compareStream: async (
    items: ParsedItem[],
    preferences?: UserPreferences,
    onProgress?: (progress: ComparisonProgress) => void,
    forceRefresh: boolean = false
  ): Promise<ComparisonResponse> => {
    try {
      const response = await fetch(`${API_BASE}/compare/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, preferences, forceRefresh }),
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith(':')) {
              // SSE heartbeat comment
              continue;
            }
            if (trimmed.startsWith('data:')) {
              try {
                const data: ComparisonProgress = JSON.parse(trimmed.slice(5).trim());
                if (onProgress) onProgress(data);
                if (data.type === 'complete' && data.comparison) {
                  return data.comparison;
                }
                if (data.type === 'error') {
                  throw new Error(data.error || 'Comparison stream error');
                }
              } catch (e) {
                console.warn('Failed to parse SSE chunk:', e);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Stream failed, falling back to standard compare:', e);
    }
    return api.compare(items, preferences, forceRefresh);
  },

  // Compare items across supermarkets (standard fallback)
  compare: async (items: ParsedItem[], preferences?: UserPreferences, forceRefresh: boolean = false): Promise<ComparisonResponse> => {
    try {
      const res = await fetch(`${API_BASE}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, preferences, forceRefresh }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Fall through to client comparison
    }
    return ClientSupermarketComparisonService.compare(items, preferences || DEFAULT_PREFERENCES);
  },

  // Cache Management
  getCacheStats: async (): Promise<CacheStats> => {
    try {
      const res = await fetch(`${API_BASE}/cache/stats`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('Could not fetch cache stats:', err);
    }
    return {
      entriesCount: 0,
      estimatedProducts: 0,
      ttlHours: 72,
      oldestEntry: null,
      newestEntry: null,
    };
  },

  clearPriceCache: async (): Promise<{ success: boolean; clearedCount: number }> => {
    try {
      const res = await fetch(`${API_BASE}/cache/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error('Error clearing price cache:', err);
    }
    return { success: false, clearedCount: 0 };
  },

  // Get product alternatives
  getAlternatives: async (store: SupermarketName, query: string): Promise<SupermarketProduct[]> => {
    try {
      const res = await fetch(`${API_BASE}/products/alternatives?store=${store}&query=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        return data.alternatives;
      }
    } catch {
      // Fall through to client alternatives
    }
    return ClientSupermarketComparisonService.getAlternatives(store, query);
  },

  // Settings
  getSettings: async (): Promise<UserPreferences> => {
    try {
      const local = localStorage.getItem('trolleywise_settings');
      if (local) return JSON.parse(local);
      const res = await fetch(`${API_BASE}/settings`);
      if (res.ok) return await res.json();
    } catch {}
    return DEFAULT_PREFERENCES;
  },

  updateSettings: async (prefs: Partial<UserPreferences>): Promise<UserPreferences> => {
    const current = await api.getSettings();
    const updated = { ...current, ...prefs };
    try {
      localStorage.setItem('trolleywise_settings', JSON.stringify(updated));
      fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      }).catch(() => {});
    } catch {}
    return updated;
  },

  // History
  getHistory: async (): Promise<SavedShop[]> => {
    try {
      const local = localStorage.getItem('trolleywise_history');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const res = await fetch(`${API_BASE}/history`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          localStorage.setItem('trolleywise_history', JSON.stringify(data));
          return data;
        }
      }
    } catch {}
    const local = localStorage.getItem('trolleywise_history');
    return local ? JSON.parse(local) : [];
  },

  saveShop: async (shop: Omit<SavedShop, 'id' | 'createdAt'>): Promise<SavedShop> => {
    const newShop: SavedShop = {
      ...shop,
      id: `shop-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
    };
    try {
      const local = localStorage.getItem('trolleywise_history');
      const history: SavedShop[] = local ? JSON.parse(local) : [];
      history.unshift(newShop);
      localStorage.setItem('trolleywise_history', JSON.stringify(history.slice(0, 50)));

      fetch(`${API_BASE}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shop),
      }).catch(() => {});
    } catch {}
    return newShop;
  },

  deleteShop: async (id: string): Promise<boolean> => {
    try {
      const local = localStorage.getItem('trolleywise_history');
      if (local) {
        const history: SavedShop[] = JSON.parse(local);
        const filtered = history.filter(s => s.id !== id);
        localStorage.setItem('trolleywise_history', JSON.stringify(filtered));
      }
      fetch(`${API_BASE}/history/${id}`, { method: 'DELETE' }).catch(() => {});
    } catch {}
    return true;
  },

  // Favorites
  getFavorites: async (): Promise<FavoriteItem[]> => {
    try {
      const local = localStorage.getItem('trolleywise_favorites');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const res = await fetch(`${API_BASE}/favorites`);
      if (res.ok) return await res.json();
    } catch {}
    const local = localStorage.getItem('trolleywise_favorites');
    return local ? JSON.parse(local) : [];
  },

  addFavorite: async (fav: Omit<FavoriteItem, 'id' | 'createdAt'>): Promise<FavoriteItem> => {
    const newFav: FavoriteItem = {
      ...fav,
      id: `fav-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toISOString(),
    };
    try {
      const favs = await api.getFavorites();
      favs.push(newFav);
      localStorage.setItem('trolleywise_favorites', JSON.stringify(favs));
      fetch(`${API_BASE}/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fav),
      }).catch(() => {});
    } catch {}
    return newFav;
  },

  removeFavorite: async (id: string): Promise<boolean> => {
    try {
      const favs = await api.getFavorites();
      const filtered = favs.filter(f => f.id !== id);
      localStorage.setItem('trolleywise_favorites', JSON.stringify(filtered));
      fetch(`${API_BASE}/favorites/${id}`, { method: 'DELETE' }).catch(() => {});
    } catch {}
    return true;
  },

  // Ingredient Ideas
  getIngredientIdeas: async (): Promise<IngredientIdea[]> => {
    try {
      const local = localStorage.getItem('trolleywise_ideas');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const res = await fetch(`${API_BASE}/ingredient-ideas`);
      if (res.ok) return await res.json();
    } catch {}
    const local = localStorage.getItem('trolleywise_ideas');
    return local ? JSON.parse(local) : DEFAULT_INGREDIENT_IDEAS;
  },

  addIngredientIdea: async (idea: Omit<IngredientIdea, 'id'>): Promise<IngredientIdea> => {
    const newIdea: IngredientIdea = {
      ...idea,
      id: `idea-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    try {
      const ideas = await api.getIngredientIdeas();
      ideas.push(newIdea);
      localStorage.setItem('trolleywise_ideas', JSON.stringify(ideas));
      fetch(`${API_BASE}/ingredient-ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(idea),
      }).catch(() => {});
    } catch {}
    return newIdea;
  },

  removeIngredientIdea: async (id: string): Promise<boolean> => {
    try {
      const ideas = await api.getIngredientIdeas();
      const filtered = ideas.filter(i => i.id !== id);
      localStorage.setItem('trolleywise_ideas', JSON.stringify(filtered));
      fetch(`${API_BASE}/ingredient-ideas/${id}`, { method: 'DELETE' }).catch(() => {});
    } catch {}
    return true;
  },

  // 72-Hour Recent Searches & Pinning
  getRecentSearches: async (): Promise<any[]> => {
    try {
      const res = await fetch(`${API_BASE}/cache/recent-searches`);
      if (res.ok) return await res.json();
    } catch {}
    try {
      const local = localStorage.getItem('trolleywise_recent_searches');
      return local ? JSON.parse(local) : [];
    } catch {}
    return [];
  },

  recordSearch: async (query: string, rawList: string, itemsCount: number): Promise<any[]> => {
    try {
      const res = await fetch(`${API_BASE}/cache/record-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, rawList, itemsCount }),
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  },

  pinSearch: async (id: string): Promise<any[]> => {
    try {
      const res = await fetch(`${API_BASE}/cache/pin-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  },

  deleteRecentSearch: async (id: string): Promise<any[]> => {
    try {
      const res = await fetch(`${API_BASE}/cache/recent-searches/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  },

  // System & Update Checker (every 24h)
  checkUpdate: async (): Promise<{ currentVersion: string; latestVersion: string; updateAvailable: boolean; pullCommand: string }> => {
    try {
      const res = await fetch(`${API_BASE}/system/check-update`);
      if (res.ok) return await res.json();
    } catch {}
    return {
      currentVersion: '1.1.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
      pullCommand: 'docker compose pull && docker compose up -d',
    };
  },

  getChangelog: async (): Promise<{ version: string; content: string }> => {
    try {
      const res = await fetch(`${API_BASE}/system/changelog`);
      if (res.ok) return await res.json();
    } catch {}
    return {
      version: '1.1.0',
      content: '# TrolleyWise Changelog\n\n## v1.1.0 - Multibuy Deals & Hybrid Gemini Matching',
    };
  },
};
