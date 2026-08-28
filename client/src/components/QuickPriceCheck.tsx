import React, { useState } from 'react';
import { Search, RefreshCw, Tag, X } from 'lucide-react';
import { SupermarketName, SupermarketProduct } from '../types';
import { api } from '../services/api';

const STORE_NAMES: Record<string, string> = {
  asda: 'Asda',
  sainsburys: "Sainsbury's",
  tesco: 'Tesco',
  morrisons: 'Morrisons',
  iceland: 'Iceland',
  aldi: 'Aldi',
  lidl: 'Lidl',
  waitrose: 'Waitrose',
  ocado: 'Ocado',
  coop: 'Co-op',
};

const STORE_COLORS: Record<string, string> = {
  asda: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  sainsburys: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  tesco: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  morrisons: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  iceland: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  aldi: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  lidl: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  waitrose: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  ocado: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  coop: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
};

interface QuickPriceCheckProps {
  enabledSupermarkets: SupermarketName[];
}

export const QuickPriceCheck: React.FC<QuickPriceCheckProps> = ({ enabledSupermarkets }) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Record<string, SupermarketProduct[]> | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('shoppingwise_quick_searches');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const handleSearch = async (searchQuery?: string) => {
    const q = (searchQuery || query).trim();
    if (!q) return;

    setSearching(true);
    setResults(null);
    setSearchedQuery(q);

    try {
      const storeResults: Record<string, SupermarketProduct[]> = {};

      const fetches = enabledSupermarkets.map(async (store) => {
        try {
          const alts = await api.getAlternatives(store, q);
          if (alts && alts.length > 0) {
            storeResults[store] = alts.slice(0, 6);
          }
        } catch {
          // Skip silently on error
        }
      });

      await Promise.all(fetches);
      setResults(storeResults);

      const updated = [q, ...recentSearches.filter(s => s.toLowerCase() !== q.toLowerCase())].slice(0, 8);
      setRecentSearches(updated);
      localStorage.setItem('shoppingwise_quick_searches', JSON.stringify(updated));
    } catch (err) {
      console.error('Quick price check failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const clearResults = () => {
    setResults(null);
    setSearchedQuery('');
    setQuery('');
  };

  const getCheapest = (): { store: string; product: SupermarketProduct } | null => {
    if (!results) return null;
    let cheapest: { store: string; product: SupermarketProduct } | null = null;
    Object.entries(results).forEach(([store, products]) => {
      products.forEach(p => {
        const price = p.clubcardPrice || p.price;
        if (!cheapest || price < (cheapest.product.clubcardPrice || cheapest.product.price)) {
          cheapest = { store, product: p };
        }
      });
    });
    return cheapest;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-800 dark:text-violet-300 text-xs font-bold uppercase">
              <Search className="w-3.5 h-3.5" />
              <span>Quick Price Check</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-2">
              One-Off Item Price Lookup
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Check a single item's price across supermarkets instantly. This won't touch your weekly shop or saved basket history.
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center space-x-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. frozen cod loins, semi skimmed milk, free range eggs, 5% mince..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-sm font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition"
            />
          </div>

          <button
            onClick={() => handleSearch()}
            disabled={searching || !query.trim()}
            className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold shadow-sm transition disabled:opacity-50 flex items-center space-x-2 shrink-0"
          >
            {searching ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>{searching ? 'Checking...' : 'Check Price'}</span>
          </button>
        </div>

        {/* Recent Searches */}
        {recentSearches.length > 0 && !results && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase">Recent:</span>
            {recentSearches.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  setQuery(s);
                  handleSearch(s);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-950 hover:text-violet-700 dark:hover:text-violet-300 transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading State */}
      {searching && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <RefreshCw className="w-8 h-8 mx-auto text-violet-500 animate-spin" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Checking live prices for "{searchedQuery}" across {enabledSupermarkets.length} supermarkets...
          </p>
        </div>
      )}

      {/* Results */}
      {results && !searching && (
        <div className="space-y-4">
          {/* Results Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Results for "{searchedQuery}"
              </h2>
              {(() => {
                const cheapest = getCheapest();
                if (!cheapest) return null;
                const price = cheapest.product.clubcardPrice || cheapest.product.price;
                return (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                    🏆 Cheapest: {STORE_NAMES[cheapest.store] || cheapest.store} — £{price.toFixed(2)}
                  </span>
                );
              })()}
            </div>
            <button
              onClick={clearResults}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Store Results Grid */}
          {Object.keys(results).length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-2">
              <Search className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400">No results found across enabled supermarkets</p>
              <p className="text-xs text-slate-400">Try a different search term</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {enabledSupermarkets.map(store => {
                const storeProducts = results[store];
                if (!storeProducts || storeProducts.length === 0) return null;

                const cheapestOverall = getCheapest();
                const isWinner = cheapestOverall?.store === store;

                return (
                  <div
                    key={store}
                    className={`bg-white dark:bg-slate-900 rounded-2xl border p-4 space-y-3 transition ${
                      isWinner
                        ? 'border-emerald-400 ring-1 ring-emerald-400/30 shadow-md'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Store Header */}
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold uppercase ${STORE_COLORS[store] || 'bg-slate-100 text-slate-700'}`}>
                        {isWinner && '🏆 '}{STORE_NAMES[store] || store}
                      </span>
                      <span className="text-[11px] text-slate-400">{storeProducts.length} results</span>
                    </div>

                    {/* Product List */}
                    <div className="space-y-2">
                      {storeProducts.map((product, idx) => {
                        const price = product.clubcardPrice || product.price;
                        const isCheapestInStore = idx === 0;
                        return (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-xl border transition ${
                              isCheapestInStore
                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50'
                                : 'bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug flex-1 line-clamp-2">
                                {product.title}
                              </p>
                              <div className="text-right shrink-0">
                                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                                  £{price.toFixed(2)}
                                </span>
                                {product.unitPrice > 0 && (
                                  <span className="block text-[10px] text-slate-400 font-medium">
                                    £{product.unitPrice.toFixed(2)}/{product.unitPriceMeasure || 'kg'}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {product.packageSize > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                                  {product.packageSize}{product.packageUnit || 'g'}
                                </span>
                              )}
                              {product.deal && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300">
                                  🏷️ {product.deal.badge || product.deal.rawText}
                                </span>
                              )}
                              {product.confidence && (
                                <span className="text-[9px] text-slate-400 dark:text-slate-500">
                                  {product.confidence}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!results && !searching && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
            <Tag className="w-7 h-7 text-violet-600 dark:text-violet-400" />
          </div>
          <h3 className="font-bold text-slate-700 dark:text-slate-300">Quick Price Check</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Search for any single item to instantly see prices across all your enabled supermarkets.
            This is completely separate from your weekly shop — no data is saved to history.
          </p>
        </div>
      )}
    </div>
  );
};
