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
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'list' | 'compare' | 'history' | 'favorites' | 'quickcheck'>('list');
  const [isDark, setIsDark] = useState(false);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
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

  // Dark mode effect
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Initial data loading
  useEffect(() => {
    const initData = async () => {
      try {
        setLoading(true);
        // 1. Fetch preferences
        const prefs = await api.getSettings().catch(() => DEFAULT_PREFS);
        setPreferences(prefs);

        // 2. Fetch favorites and ideas
        const [favs, ideas] = await Promise.all([
          api.getFavorites().catch(() => []),
          api.getIngredientIdeas().catch(() => []),
        ]);
        setFavorites(favs);
        setIngredientIdeas(ideas);

        // Auto-archive safety net: check for stale pending comparison (>71h old)
        if (!prefs.devMode) {
          try {
            const pendingRaw = localStorage.getItem('trolleywise_pending_comparison');
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
                localStorage.removeItem('trolleywise_pending_comparison');
              } else if (hoursOld >= 96) {
                // Too old, cache is gone anyway — discard the stale pending
                console.log(`[Auto-Archive] Pending comparison is ${hoursOld.toFixed(1)}h old. Too stale, discarding.`);
                localStorage.removeItem('trolleywise_pending_comparison');
              }
            }
          } catch (err) {
            console.warn('[Auto-Archive] Error checking pending comparison:', err);
          }
        }
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setLoading(false);
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

      // Stash pending comparison for auto-archive safety net only for genuine weekly shops (>= 3 items, not dev mode)
      if (!preferences.devMode && listToCompare.length >= 3) {
        try {
          const shopData = buildShopSnapshot(comp, listToCompare);
          localStorage.setItem('trolleywise_pending_comparison', JSON.stringify({
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
      localStorage.removeItem('trolleywise_pending_comparison');
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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Navbar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDark={isDark}
        setIsDark={setIsDark}
        itemCount={items.length}
        cheapestStore={comparison ? comparison.supermarkets[comparison.cheapestStore]?.info.name : undefined}
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
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shadow-lg animate-pulse">
              <Sparkles className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                Comparing Basket Across UK Supermarkets
              </h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Scanning Asda, Sainsbury's, Tesco, Morrisons & Iceland for real prices, pack sizing, and deals.
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
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                  {(preferences.enabledSupermarkets || ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland']).map(store => (
                    <span
                      key={store}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center space-x-1 uppercase tracking-wider"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                      <span>{store}</span>
                    </span>
                  ))}
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

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-slate-500 space-y-1">
        <p>TrolleyWise UK • Comparing {(() => {
          const nameMap: Record<string, string> = {
            asda: 'Asda', sainsburys: "Sainsbury's", tesco: 'Tesco', morrisons: 'Morrisons',
            iceland: 'Iceland', aldi: 'Aldi', lidl: 'Lidl', waitrose: 'Waitrose',
            ocado: 'Ocado', coop: 'Co-op',
          };
          const names = preferences.enabledSupermarkets.map(s => nameMap[s] || s);
          if (names.length <= 1) return names[0] || 'supermarkets';
          return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
        })()}</p>
        <p className="text-[11px] text-slate-400">
          Real package sizes, closest-weight pack matching, healthier alternatives, and live supermarket pricing.
        </p>
      </footer>
    </div>
  );
}
