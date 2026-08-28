import React, { useEffect, useState } from 'react';
import {
  History,
  Calendar,
  Trash2,
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  Award,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
} from 'lucide-react';
import { SavedShop, SupermarketName, PriceHistoryStats } from '../types';
import { api } from '../services/api';

const STORE_DISPLAY_NAMES: Record<string, string> = {
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

const STORE_BADGE_COLORS: Record<string, string> = {
  asda: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300',
  sainsburys: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300',
  tesco: 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300',
  morrisons: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300',
  iceland: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300',
  aldi: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300',
  lidl: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300',
};

interface ArchiveHistoryProps {
  onLoadShop: (rawList: string) => Promise<void>;
}

export const ArchiveHistory: React.FC<ArchiveHistoryProps> = ({ onLoadShop }) => {
  const [history, setHistory] = useState<SavedShop[]>([]);
  const [stats, setStats] = useState<PriceHistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedShopId, setExpandedShopId] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const [resHistory, resStats] = await Promise.all([
        api.getHistory(),
        api.getStats()
      ]);
      setHistory(resHistory);
      setStats(resStats);
    } catch (err) {
      console.error('Error loading history & stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteShop(id);
      setHistory(prev => prev.filter(s => s.id !== id));
      if (expandedShopId === id) setExpandedShopId(null);
    } catch (err) {
      console.error('Error deleting shop:', err);
    }
  };

  // Trends & Summary Calculations
  const totalShops = history.length;
  const totalSpent = history.reduce((sum, s) => sum + (s.lowestPrice || 0), 0);
  const avgSpend = totalShops > 0 ? totalSpent / totalShops : 0;
  const totalSavings = history.reduce((sum, s) => sum + (s.savings || 0), 0);

  // Store winner tally
  const storeWins: Record<string, number> = {};
  history.forEach(s => {
    if (s.cheapestStore) {
      const st = s.cheapestStore.toLowerCase();
      storeWins[st] = (storeWins[st] || 0) + 1;
    }
  });

  const sortedWins = Object.entries(storeWins).sort((a, b) => b[1] - a[1]);
  const topWinner = sortedWins[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold uppercase">
          <History className="w-3.5 h-3.5" />
          <span>Shopping Archives & Price Tracker</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          Past Shopping Trips & Price Trends
        </h1>
        <p className="text-slate-500 text-sm max-w-2xl">
          Track your grocery spending over time, analyze which supermarket is consistently cheapest, and review item-by-item price snapshots.
        </p>
      </div>

      {/* Trends Dashboard (When 1+ shops exist) */}
      {history.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-extrabold uppercase text-slate-400 tracking-wider">
              Weekly Spend & Supermarket Trends
            </h2>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase">
                <span>Avg. Basket Spend</span>
                <DollarSign className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                £{avgSpend.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400">across {totalShops} recorded trips</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase">
                <span>Total Savings</span>
                <TrendingDown className="w-4 h-4 text-teal-500" />
              </div>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                £{totalSavings.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400">vs highest priced supermarket</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase">
                <span>Top Value Store</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {topWinner ? STORE_DISPLAY_NAMES[topWinner[0]] || topWinner[0] : '—'}
              </div>
              <div className="text-[11px] text-slate-400">
                {topWinner ? `Won ${topWinner[1]} of ${totalShops} shops (${Math.round((topWinner[1] / totalShops) * 100)}%)` : 'No data'}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase">
                <span>Total Trips</span>
                <Layers className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {totalShops}
              </div>
              <div className="text-[11px] text-slate-400">archived in local database</div>
            </div>
          </div>

          {/* Supermarket Win Leaderboard */}
          {sortedWins.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  🏆 Supermarket Price Competitiveness
                </span>
                <span className="text-[11px] text-slate-400">Historical lowest-price frequency</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sortedWins.map(([store, count], idx) => {
                  const pct = Math.round((count / totalShops) * 100);
                  return (
                    <div
                      key={store}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 border border-slate-200/60 dark:border-slate-700/60 ${
                        idx === 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                      <span className="uppercase">{STORE_DISPLAY_NAMES[store] || store}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 text-[10px]">
                        {count} wins ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Data Freshness & Match Sources Distribution */}
          {stats && stats.totalComparisons > 0 && (
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  📊 Match Source Truthfulness & Freshness
                </span>
                <span className="text-[11px] text-slate-400">Aggregated across all comparison runs</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20">
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                    {stats.sourceRatios.live}%
                  </div>
                  <div className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300 mt-0.5">
                    Live Aggregator ({stats.sourceRatios.counts.live})
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-500/20">
                  <div className="text-xl font-black text-blue-600 dark:text-blue-400">
                    {stats.sourceRatios.cache}%
                  </div>
                  <div className="text-[10px] font-bold uppercase text-blue-800 dark:text-blue-300 mt-0.5">
                    72h Cache ({stats.sourceRatios.counts.cache})
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-500/20">
                  <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                    {stats.sourceRatios.catalog}%
                  </div>
                  <div className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-300 mt-0.5">
                    Benchmark Catalog ({stats.sourceRatios.counts.catalog})
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History List */}
      <div className="space-y-4">
        <h2 className="text-sm font-extrabold uppercase text-slate-400 tracking-wider">
          Saved Shopping Baskets
        </h2>

        {loading ? (
          <div className="py-16 text-center text-slate-400">Loading archived shops...</div>
        ) : history.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <History className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
            <h3 className="font-bold text-slate-700 dark:text-slate-300">No Saved Shops Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Run a price comparison on your weekly shopping list and click "🔒 Lock In Weekly Shop" to track prices and trends over time!
            </p>
          </div>
        ) : (
          history.map(shop => {
            const dateStr = new Date(shop.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            const isExpanded = expandedShopId === shop.id;
            const hasItemDetails = Array.isArray(shop.items) && shop.items.length > 0;
            const isDevShop = shop.name?.startsWith('[DEV]');

            return (
              <div
                key={shop.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                        {shop.name || `Basket with ${shop.itemCount} items`}
                      </h3>
                      {isDevShop && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 uppercase">
                          Dev
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${STORE_BADGE_COLORS[shop.cheapestStore?.toLowerCase()] || 'bg-emerald-100 text-emerald-800'}`}>
                        🏆 Cheapest: {STORE_DISPLAY_NAMES[shop.cheapestStore?.toLowerCase()] || shop.cheapestStore} (£{shop.lowestPrice?.toFixed(2)})
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span>{shop.itemCount} items</span>
                      {shop.savings > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            Saved £{shop.savings.toFixed(2)} vs highest store
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 self-start sm:self-center">
                    {hasItemDetails && (
                      <button
                        onClick={() => setExpandedShopId(isExpanded ? null : shop.id)}
                        className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>Hide Items</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>Item Breakdown</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => onLoadShop(shop.rawList)}
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Reload List</span>
                    </button>

                    <button
                      onClick={() => handleDelete(shop.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition"
                      title="Delete archive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Supermarket Totals Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 pt-1">
                  {Object.entries(shop.totals || {}).map(([store, total]) => {
                    const isLowest = store.toLowerCase() === shop.cheapestStore?.toLowerCase();
                    return (
                      <div
                        key={store}
                        className={`p-3 rounded-xl border text-center transition ${
                          isLowest
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400'
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="text-xs uppercase font-bold text-slate-500">
                          {STORE_DISPLAY_NAMES[store.toLowerCase()] || store}
                        </div>
                        <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                          £{Number(total).toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Expanded Item-by-Item Price Snapshot Table */}
                {isExpanded && hasItemDetails && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                      <span>Item-by-Item Supermarket Price Snapshot</span>
                      <span className="text-[11px] font-normal text-slate-400">Lowest item price highlighted in green</span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="py-2.5 px-3">Item</th>
                            {Object.keys(shop.totals || {}).map(store => (
                              <th key={store} className="py-2.5 px-3 uppercase text-center">
                                {STORE_DISPLAY_NAMES[store.toLowerCase()] || store}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {shop.items!.map((it, idx) => {
                            // Find lowest price for this row
                            const validPrices = Object.values(it.prices || {}).filter(p => typeof p === 'number' && p > 0);
                            const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;

                            return (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white max-w-xs">
                                  <div>{it.name}</div>
                                  {it.targetQuantity && (
                                    <div className="text-[10px] text-slate-400">{it.targetQuantity}</div>
                                  )}
                                </td>
                                {Object.keys(shop.totals || {}).map(store => {
                                  const p = it.prices?.[store as SupermarketName];
                                  const title = it.matchedTitles?.[store as SupermarketName];
                                  const isMin = minPrice !== null && p === minPrice;

                                  return (
                                    <td
                                      key={store}
                                      className={`py-2 px-3 text-center ${
                                        isMin
                                          ? 'bg-emerald-50/80 dark:bg-emerald-950/40 font-bold text-emerald-700 dark:text-emerald-300'
                                          : 'text-slate-700 dark:text-slate-300'
                                      }`}
                                    >
                                      {typeof p === 'number' && p > 0 ? (
                                        <div>
                                          <div>£{p.toFixed(2)}</div>
                                          {title && (
                                            <div className="text-[9px] text-slate-400 truncate max-w-[120px] mx-auto" title={title}>
                                              {title}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-slate-300 dark:text-slate-600">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

