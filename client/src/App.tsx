import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles } from 'lucide-react';
import { Header } from './components/Header';
import { ListCreator, EXAMPLE_LIST_TEXT } from './components/ListCreator';
import { ComparisonView } from './components/ComparisonView';
import { ArchiveHistory } from './components/ArchiveHistory';
import { FavoritesManager } from './components/FavoritesManager';
import { SettingsModal } from './components/SettingsModal';
import { ItemSwapModal } from './components/ItemSwapModal';
import { QuickPriceCheck } from './components/QuickPriceCheck';
import { StatsPage } from './components/StatsPage';
import { ChangelogModal } from './components/ChangelogModal';
import {
  ParsedItem,
  ComparisonResponse,
  SupermarketName,
  SupermarketProduct,
  ItemMatch,
  UserPreferences,
  FavoriteItem,
  IngredientIdea,
} from './types';
import { api } from './services/api';

const DEFAULT_PREFS: UserPreferences = {
  healthierDefault: true,
  fatPercentagePreference: 5,
  preferWholewheat: true,
  preferFreeRange: true,
  preferOrganic: false,
  cutMatchingStrategy: 'best_value',
  brandTierPriority: 'standard',
  packSizingPolicy: 'closest',
  enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'],
  devMode: true,
  directScrapersEnabled: true,
  directStoreAdapters: {
    tesco: true,
    sainsburys: true,
    asda: true,
    morrisons: true,
    iceland: true
  },
};

export default function App() {
  // Persistent active tab
  const [activeTab, setActiveTabState] = useState<'list' | 'compare' | 'history' | 'favorites' | 'quickcheck' | 'stats'>(() => {
    try {
      const savedTab = localStorage.getItem('shoppingwise_active_tab');
      if (savedTab && ['list', 'compare', 'history', 'favorites', 'quickcheck', 'stats'].includes(savedTab)) {
        return savedTab as any;
      }
    } catch {}
    return 'list';
  });

  const setActiveTab = (tab: 'list' | 'compare' | 'history' | 'favorites' | 'quickcheck' | 'stats') => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('shoppingwise_active_tab', tab);
    } catch {}
  };

  // Persistent theme
  const [isDark, setIsDarkState] = useState(() => {
    try {
      return localStorage.getItem('shoppingwise_theme') === 'dark';
    } catch {}
    return false;
  });

  const setIsDark = (dark: boolean) => {
    setIsDarkState(dark);
    try {
      localStorage.setItem('shoppingwise_theme', dark ? 'dark' : 'light');
    } catch {}
  };

  // Persistent items list
  const [items, setItemsState] = useState<ParsedItem[]>(() => {
    try {
      const saved = localStorage.getItem('shoppingwise_items');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const setItems: React.Dispatch<React.SetStateAction<ParsedItem[]>> = (updater) => {
    setItemsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem('shoppingwise_items', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Persistent comparison result
  const [comparison, setComparisonState] = useState<ComparisonResponse | null>(() => {
    try {
      const saved = localStorage.getItem('shoppingwise_active_comparison');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  const setComparison = (comp: ComparisonResponse | null | ((prev: ComparisonResponse | null) => ComparisonResponse | null)) => {
    setComparisonState(prev => {
      const next = typeof comp === 'function' ? comp(prev) : comp;
      try {
        if (next) {
          localStorage.setItem('shoppingwise_active_comparison', JSON.stringify(next));
        } else {
          localStorage.removeItem('shoppingwise_active_comparison');
        }
      } catch {}
      return next;
    });
  };

  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFS);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [ingredientIdeas, setIngredientIdeas] = useState<IngredientIdea[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [swapModalState, setSwapModalState] = useState<{
    isOpen: boolean;
    item: ParsedItem | null;
    store: SupermarketName | null;
    currentMatch: ItemMatch | null;
  }>({
    isOpen: false,
    item: null,
    store: null,
    currentMatch: null,
  });

  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('1.1.0');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('1.1.0');

  // Dark mode effect
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // 24-Hour Docker Image Update Lookup
  useEffect(() => {
    const checkDockerUpdate = async () => {
      try {
        const lastCheck = Number(localStorage.getItem('shoppingwise_last_update_check') || '0');
        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        // Check if 24h elapsed or first time
        if (now - lastCheck >= ONE_DAY_MS || lastCheck === 0) {
          const res = await api.checkUpdate();
          if (res && res.updateAvailable) {
            setUpdateAvailable(true);
            setUpdateVersion(res.latestVersion || '1.1.0');
          }
          localStorage.setItem('shoppingwise_last_update_check', String(now));
        }
      } catch (err) {
        console.warn('Update check failed:', err);
      }
    };
    checkDockerUpdate();
  }, []);

  // Initial data loading (non-blocking)
  useEffect(() => {
    const initData = async () => {
      try {
        // 1. Fetch preferences
        const prefs = await api.getSettings().catch(() => DEFAULT_PREFS);
        setPreferences(prefs);

        // 2. Fetch favorites, ideas, and system version
        const [favs, ideas, versionInfo] = await Promise.all([
          api.getFavorites().catch(() => []),
          api.getIngredientIdeas().catch(() => []),
          api.getSystemVersion().catch(() => null),
        ]);
        setFavorites(favs);
        setIngredientIdeas(ideas);
        if (versionInfo && versionInfo.version) {
          setAppVersion(versionInfo.version);
        }

        // Auto-archive safety net: check for stale pending comparison (>71h old)
        if (!prefs.devMode) {
          try {
            const pendingRaw = localStorage.getItem('shoppingwise_pending_comparison');
            if (pendingRaw) {
              const pending = JSON.parse(pendingRaw);
              const ageMs = Date.now() - (pending.timestamp || 0);
              const hoursOld = ageMs / (1000 * 60 * 60);
              // Auto-archive if between 71-96h old (gives buffer before and after 72h cache expiry)
              if (hoursOld >= 71 && hoursOld < 96) {
                console.log(`[Auto-Archive] Pending comparison is ${hoursOld.toFixed(1)}h old. Auto-saving before cache expires...`);
                await api.saveShop({
                  ...pending.shopData,
                  name: `⏰ Auto-saved: ${pending.shopData.name}`,
                });
                localStorage.removeItem('shoppingwise_pending_comparison');
              } else if (hoursOld >= 96) {
                // Too old, cache is gone anyway — discard the stale pending
                console.log(`[Auto-Archive] Pending comparison is ${hoursOld.toFixed(1)}h old. Too stale, discarding.`);
                localStorage.removeItem('shoppingwise_pending_comparison');
              }
            }
          } catch (err) {
            console.warn('[Auto-Archive] Error checking pending comparison:', err);
          }
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    };

    initData();
  }, []);

  // Parse raw text list handler
  const handleParseRawList = async (rawText: string) => {
    try {
      setLoading(true);
      const parsed = await api.parseList(rawText);
      setItems(parsed);
      return parsed;
    } catch (err) {
      console.error('Error parsing list:', err);
    } finally {
      setLoading(false);
    }
  };

  const [progress, setProgress] = useState<import('./services/api').ComparisonProgress | null>(null);

  /**
   * Build a shop data snapshot from current items + comparison.
   * Used by both manual "Lock In" and auto-archive safety net.
   */
  const buildShopSnapshot = (comp: ComparisonResponse, currentItems: ParsedItem[]) => {
    const totals: Partial<Record<SupermarketName, number>> = {};
    Object.entries(comp.supermarkets).forEach(([k, v]) => {
      totals[k as SupermarketName] = v.totalPrice;
    });

    const itemPriceSnapshots = currentItems.map(it => {
      const itemPrices: Partial<Record<SupermarketName, number>> = {};
      const matchedTitles: Partial<Record<SupermarketName, string>> = {};

      Object.entries(comp.supermarkets).forEach(([storeKey, storeBasket]) => {
        const match = storeBasket.items.find(m => m.parsedItem.id === it.id);
        if (match && match.product) {
          itemPrices[storeKey as SupermarketName] = match.totalPrice;
          matchedTitles[storeKey as SupermarketName] = `${match.packsNeeded}x ${match.product.title}`;
        }
      });

      return {
        name: it.name,
        targetQuantity: `${it.targetQuantity} ${it.unit}`,
        prices: itemPrices,
        matchedTitles,
      };
    });

    return {
      name: `Shop (${currentItems.length} items)`,
      rawList: currentItems.map(i => i.rawText).join('\n'),
      itemCount: currentItems.length,
      totals,
      cheapestStore: comp.cheapestStore,
      lowestPrice: comp.supermarkets[comp.cheapestStore]?.totalPrice || 0,
      highestPrice: comp.supermarkets[comp.highestStore]?.totalPrice || 0,
      savings: comp.supermarkets[comp.cheapestStore]?.savingsVsHighest || 0,
      items: itemPriceSnapshots,
    };
  };

  // Run supermarket comparison
  const handleCompare = async (itemsToCompare?: ParsedItem[]) => {
    const listToCompare = itemsToCompare && itemsToCompare.length > 0 ? itemsToCompare : items;
    if (listToCompare.length === 0) return;
    try {
      setLoading(true);
      setTimeout(() => {
        const el = document.getElementById('loading-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);

      setProgress({
        type: 'init',
        currentItemIndex: 1,
        totalItems: listToCompare.length,
        totalChecks: listToCompare.length * (preferences.enabledSupermarkets?.length || 5),
        completedChecks: 0,
        percent: 0,
        status: `Starting live price comparison for ${listToCompare.length} items...`,
      });

      const comp = await api.compareStream(listToCompare, preferences, (prog) => {
        setProgress(prog);
      });
      setComparison(comp);
      setActiveTab('compare');
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 60);

      // Stash pending comparison for auto-archive safety net only for genuine weekly shops (>= 3 items, not dev mode)
      if (!preferences.devMode && listToCompare.length >= 3) {
        try {
          const shopData = buildShopSnapshot(comp, listToCompare);
          localStorage.setItem('shoppingwise_pending_comparison', JSON.stringify({
            timestamp: Date.now(),
            shopData,
          }));
        } catch (err) {
          console.warn('[Pending Stash] Error stashing pending comparison:', err);
        }
      }

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch {}
    } catch (err) {
      console.error('Comparison error:', err);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  // Handle alternative item swap
  const handleSelectAlternative = (
    store: SupermarketName,
    item: ParsedItem,
    newProduct: SupermarketProduct,
    customPacks?: number
  ) => {
    if (!comparison) return;

    setComparison(prevComp => {
      if (!prevComp) return null;

      const storeBasket = { ...prevComp.supermarkets[store] };
      const itemIndex = storeBasket.items.findIndex(i => i.parsedItem.id === item.id);

      if (itemIndex >= 0) {
        // Calculate new pack quantity & price safely
        let targetAmount = item.targetQuantity || 1;
        let prodAmount = newProduct.packageSize || 1;
        if (item.unit === 'kg' || item.unit === 'l') targetAmount *= 1000;
        if (newProduct.packageUnit === 'kg' || newProduct.packageUnit === 'l') prodAmount *= 1000;
        if ((item.unit === 'g' || item.unit === 'kg') && prodAmount <= 1) prodAmount = 500;

        const packsNeeded = customPacks && customPacks > 0
          ? customPacks
          : Math.min(12, Math.max(1, Math.round(targetAmount / (prodAmount || 1))));
        const totalQty = packsNeeded * prodAmount;
        const unitPrice = newProduct.clubcardPrice || newProduct.price;
        const totalPrice = Number((packsNeeded * unitPrice).toFixed(2));
        const weightDiffPct = Math.round(((totalQty - targetAmount) / (targetAmount || 1)) * 100);

        const updatedMatch: ItemMatch = {
          ...storeBasket.items[itemIndex],
          product: newProduct,
          packsNeeded,
          totalQuantity: totalQty,
          totalPrice,
          effectiveUnitPrice: newProduct.unitPrice,
          weightDifferencePercent: weightDiffPct,
          isClosestPack: Math.abs(weightDiffPct) < 25,
        };

        const newItems = [...storeBasket.items];
        newItems[itemIndex] = updatedMatch;

        // Recalculate subtotal & total
        const newSubtotal = Number(newItems.reduce((sum, i) => sum + (i.product ? i.totalPrice : 0), 0).toFixed(2));
        const deliveryFee = newSubtotal >= storeBasket.info.deliveryMinOrder ? 0 : storeBasket.info.deliveryFee;
        const newTotal = Number((newSubtotal + deliveryFee).toFixed(2));

        const updatedSupermarkets = {
          ...prevComp.supermarkets,
          [store]: {
            ...storeBasket,
            items: newItems,
            subtotal: newSubtotal,
            totalPrice: newTotal,
          },
        };

        // Recalculate cheapest store
        const ranked = Object.values(updatedSupermarkets).sort((a, b) => a.totalPrice - b.totalPrice);
        const cheapest = ranked[0]?.supermarket || store;

        return {
          ...prevComp,
          supermarkets: updatedSupermarkets,
          cheapestStore: cheapest,
        };
      }

      return prevComp;
    });
  };

  // Handle direct quantity update for an item at a supermarket
  const handleUpdateQuantity = (
    store: SupermarketName,
    itemId: string,
    newPacks: number
  ) => {
    if (!comparison || newPacks < 1) return;

    setComparison(prevComp => {
      if (!prevComp) return null;

      const storeBasket = { ...prevComp.supermarkets[store] };
      const itemIndex = storeBasket.items.findIndex(i => i.parsedItem.id === itemId);

      if (itemIndex >= 0) {
        const currentMatch = storeBasket.items[itemIndex];
        if (!currentMatch.product) return prevComp;

        const product = currentMatch.product;
        let prodAmount = product.packageSize || 1;
        if (product.packageUnit === 'kg' || product.packageUnit === 'l') prodAmount *= 1000;
        if ((currentMatch.parsedItem.unit === 'g' || currentMatch.parsedItem.unit === 'kg') && prodAmount <= 1) prodAmount = 500;

        const totalQty = newPacks * prodAmount;
        const unitPrice = product.clubcardPrice || product.price;
        const totalPrice = Number((newPacks * unitPrice).toFixed(2));

        let targetAmount = currentMatch.parsedItem.targetQuantity || 1;
        if (currentMatch.parsedItem.unit === 'kg' || currentMatch.parsedItem.unit === 'l') targetAmount *= 1000;
        const weightDiffPct = Math.round(((totalQty - targetAmount) / (targetAmount || 1)) * 100);

        const updatedMatch: ItemMatch = {
          ...currentMatch,
          packsNeeded: newPacks,
          totalQuantity: totalQty,
          totalPrice,
          weightDifferencePercent: weightDiffPct,
          isClosestPack: Math.abs(weightDiffPct) < 25,
        };

        const newItems = [...storeBasket.items];
        newItems[itemIndex] = updatedMatch;

        // Recalculate subtotal & total
        const newSubtotal = Number(newItems.reduce((sum, i) => sum + (i.product ? i.totalPrice : 0), 0).toFixed(2));
        const deliveryFee = newSubtotal >= storeBasket.info.deliveryMinOrder ? 0 : storeBasket.info.deliveryFee;
        const newTotal = Number((newSubtotal + deliveryFee).toFixed(2));

        const updatedSupermarkets = {
          ...prevComp.supermarkets,
          [store]: {
            ...storeBasket,
            items: newItems,
            subtotal: newSubtotal,
            totalPrice: newTotal,
          },
        };

        // Recalculate cheapest store
        const ranked = Object.values(updatedSupermarkets).sort((a, b) => a.totalPrice - b.totalPrice);
        const cheapest = ranked[0]?.supermarket || store;

        return {
          ...prevComp,
          supermarkets: updatedSupermarkets,
          cheapestStore: cheapest,
        };
      }

      return prevComp;
    });
  };

  // Lock In Weekly Shop (explicit save to archive)
  const handleSaveToArchive = async () => {
    if (!comparison) return;
    try {
      const shopData = buildShopSnapshot(comparison, items);

      // In dev mode, label it as a dev entry
      if (preferences.devMode) {
        shopData.name = `[DEV] ${shopData.name}`;
      }

      await api.saveShop(shopData);

      // Clear pending stash — user explicitly saved, no need for auto-archive
      localStorage.removeItem('shoppingwise_pending_comparison');
    } catch (err) {
      console.error('Error saving shop to archive:', err);
    }
  };

  // Load shop from Archive
  const handleLoadShopFromArchive = async (rawList: string) => {
    const parsed = await handleParseRawList(rawList);
    if (parsed) {
      const comp = await api.compare(parsed, preferences);
      setComparison(comp);
      setActiveTab('compare');
    }
  };

  // Update Settings
  const handleSavePreferences = async (newPrefs: Partial<UserPreferences>) => {
    const updated = await api.updateSettings(newPrefs);
    setPreferences(updated);
    if (items.length > 0) {
      const comp = await api.compare(items, updated);
      setComparison(comp);
    }
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Navbar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenChangelog={() => setIsChangelogOpen(true)}
        version={appVersion}
        updateAvailable={updateAvailable}
        updateVersion={updateVersion}
        isDark={isDark}
        setIsDark={setIsDark}
        itemCount={items.length}
        cheapestStore={comparison ? comparison.supermarkets[comparison.cheapestStore]?.info.name : undefined}
        loading={loading}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'list' && (
          <ListCreator
            items={items}
            setItems={setItems}
            ingredientIdeas={ingredientIdeas}
            onCompare={handleCompare}
            onParseRawList={handleParseRawList}
            loading={loading}
            enabledSupermarkets={preferences.enabledSupermarkets}
          />
        )}

        {loading && (
          <div id="loading-section" className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-6 scroll-mt-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shadow-lg animate-pulse">
              <Sparkles className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                Comparing Basket Across UK Supermarkets
              </h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Scanning {(() => {
                  const nameMap: Record<string, string> = {
                    asda: 'Asda', sainsburys: "Sainsbury's", tesco: 'Tesco', morrisons: 'Morrisons',
                    iceland: 'Iceland', aldi: 'Aldi', lidl: 'Lidl', waitrose: 'Waitrose',
                    ocado: 'Ocado', coop: 'Co-op',
                  };
                  const names = (preferences.enabledSupermarkets || ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl']).map(s => nameMap[s] || s);
                  if (names.length <= 1) return names[0] || 'supermarkets';
                  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
                })()} for real prices, pack sizing, and deals.
              </p>
            </div>

            {/* Live Progress Card */}
            {progress && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                      Item {progress.currentItemIndex || 1} of {progress.totalItems || items.length}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      ({progress.completedChecks || 0} / {progress.totalChecks || (items.length * 5)} store checks)
                    </span>
                  </div>
                  <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                    {progress.percent || 0}%
                  </span>
                </div>

                {/* Animated Progress Bar */}
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(5, progress.percent || 0)}%` }}
                  />
                </div>

                {/* Current Item & Status */}
                <div className="flex items-start space-x-3 pt-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping mt-1.5 flex-shrink-0" />
                  <div className="space-y-1 overflow-hidden">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {progress.itemName ? `"${progress.itemName}"` : 'Analyzing shopping list...'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {progress.status || 'Scanning supermarkets...'}
                    </p>
                  </div>
                </div>

                {/* Active Supermarket Badges */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  {(preferences.enabledSupermarkets || ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl']).map(store => {
                    const nameMap: Record<string, string> = {
                      asda: 'Asda', sainsburys: "Sainsbury's", tesco: 'Tesco', morrisons: 'Morrisons',
                      iceland: 'Iceland', aldi: 'Aldi', lidl: 'Lidl', waitrose: 'Waitrose',
                      ocado: 'Ocado', coop: 'Co-op',
                    };
                    return (
                      <span
                        key={store}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 border border-slate-200/60 dark:border-slate-700/60 shadow-xs"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block shrink-0" />
                        <span>{nameMap[store] || store.toUpperCase()}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'compare' && comparison && (
          <ComparisonView
            comparison={comparison}
            items={items}
            setItems={setItems}
            onUpdateQuantity={handleUpdateQuantity}
            onOpenSwapModal={(item, store, currentMatch) =>
              setSwapModalState({
                isOpen: true,
                item,
                store,
                currentMatch,
              })
            }
            onSaveToArchive={handleSaveToArchive}
            onBackToList={() => setActiveTab('list')}
          />
        )}

        {!loading && activeTab === 'compare' && !comparison && (
          <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-md">
              <Sparkles className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              {items.length > 0 ? `Ready to compare ${items.length} items` : 'No active comparison yet'}
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              {items.length > 0
                ? 'Your shopping list is ready. Click below to run a live price comparison across UK supermarkets.'
                : 'Create or paste a shopping list first to find the lowest supermarket prices.'}
            </p>
            <div className="pt-2">
              {items.length > 0 ? (
                <button
                  onClick={() => handleCompare(items)}
                  className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Compare {items.length} Items Now</span>
                </button>
              ) : (
                <button
                  onClick={() => setActiveTab('list')}
                  className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition"
                >
                  <span>Go to Shopping List</span>
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'quickcheck' && (
          <QuickPriceCheck enabledSupermarkets={preferences.enabledSupermarkets} />
        )}

        {activeTab === 'history' && (
          <ArchiveHistory onLoadShop={handleLoadShopFromArchive} />
        )}

        {activeTab === 'favorites' && (
          <FavoritesManager
            favorites={favorites}
            setFavorites={setFavorites}
            ingredientIdeas={ingredientIdeas}
            setIngredientIdeas={setIngredientIdeas}
          />
        )}

        {activeTab === 'stats' && (
          <StatsPage />
        )}
      </main>

      {/* Item Swap Modal */}
      <ItemSwapModal
        isOpen={swapModalState.isOpen}
        onClose={() => setSwapModalState({ ...swapModalState, isOpen: false })}
        item={swapModalState.item}
        store={swapModalState.store}
        currentMatch={swapModalState.currentMatch}
        onSelectAlternative={handleSelectAlternative}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        preferences={preferences}
        onSavePreferences={handleSavePreferences}
      />

      {/* Changelog & Update Modal */}
      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 space-y-1.5">
        <p className="font-semibold text-slate-700 dark:text-slate-300">
          ShoppingWise UK <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 ml-1">v{appVersion}</span> • Comparing {(() => {
            const nameMap: Record<string, string> = {
              asda: 'Asda', sainsburys: "Sainsbury's", tesco: 'Tesco', morrisons: 'Morrisons',
              iceland: 'Iceland', aldi: 'Aldi', lidl: 'Lidl', waitrose: 'Waitrose',
              ocado: 'Ocado', coop: 'Co-op',
            };
            const names = (preferences.enabledSupermarkets || []).map(s => nameMap[s] || s);
            if (names.length <= 1) return names[0] || 'supermarkets';
            return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
          })()}
        </p>
        <p className="text-[11px] text-slate-400">
          Real package sizes, closest-weight pack matching, healthier alternatives, and live supermarket pricing.
        </p>
      </footer>
    </div>
  );
}
