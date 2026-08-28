import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Award, Database, RefreshCw, Layers } from 'lucide-react';

interface StatsData {
  totalComparisons: number;
  winRates: Record<string, { wins: number; percentage: number }>;
  sourceRatios: {
    live: number;
    cache: number;
    catalog: number;
    counts: { live: number; cache: number; catalog: number };
  };
  categoryActivity: Record<string, number>;
  trackedItemsCount: number;
  trackedItems: string[];
  recentSnapshots: any[];
}

interface ItemSeriesData {
  itemKey: string;
  series: Record<string, Array<{ date: string; unitPrice: number; totalPrice: number; source: string }>>;
}

export const StatsPage: React.FC = () => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [itemSeries, setItemSeries] = useState<ItemSeriesData | null>(null);
  const [loadingSeries, setLoadingSeries] = useState<boolean>(false);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('Failed to load pricing statistics');
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching stats');
    } finally {
      setLoading(false);
    }
  };

  const fetchItemSeries = async (itemKey: string) => {
    setSelectedItem(itemKey);
    setLoadingSeries(true);
    try {
      const res = await fetch(`/api/stats/item/${encodeURIComponent(itemKey)}`);
      if (res.ok) {
        const data = await res.json();
        setItemSeries(data);
      }
    } catch (err) {
      console.error('Error fetching item series:', err);
    } finally {
      setLoadingSeries(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-4">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto" />
        <p className="text-slate-500 dark:text-slate-400 font-medium">Loading supermarket pricing intelligence...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center space-y-4">
        <div className="p-6 max-w-md mx-auto bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl">
          <p className="text-rose-700 dark:text-rose-300 font-semibold">{error || 'No stats available'}</p>
          <button
            onClick={fetchStats}
            className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-lg font-bold text-xs hover:bg-rose-700 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Pricing Intelligence & Historical Stats
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Real market telemetry across {stats.totalComparisons} comparison{stats.totalComparisons === 1 ? '' : 's'} with verified live & cached data.
          </p>
        </div>

        <button
          onClick={fetchStats}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Stats
        </button>
      </div>

      {/* Grid: Win Rates & Data Integrity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Supermarket Win Rates */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              Cheapest Supermarket Leaderboard
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {stats.totalComparisons} Shops
            </span>
          </div>

          <div className="space-y-3 pt-2">
            {Object.entries(stats.winRates || {}).length === 0 ? (
              <p className="text-sm text-slate-500 italic">No shop comparisons recorded yet.</p>
            ) : (
              Object.entries(stats.winRates)
                .sort((a, b) => b[1].wins - a[1].wins)
                .map(([store, data]) => (
                  <div key={store} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                      <span>{store}</span>
                      <span>{data.wins} wins ({data.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(4, data.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Data Provenance & Integrity */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-500" />
              Data Provenance & Match Sources
            </h2>
            <span className="text-xs font-semibold text-slate-500">Live Telemetry</span>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-center">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">Live Scraped</span>
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-400">{stats.sourceRatios.live}%</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-500 block mt-0.5">
                ({stats.sourceRatios.counts.live} hits)
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 text-center">
              <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 block">72h Cache</span>
              <span className="text-xl font-black text-indigo-700 dark:text-indigo-400">{stats.sourceRatios.cache}%</span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-500 block mt-0.5">
                ({stats.sourceRatios.counts.cache} hits)
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-center">
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 block">Catalog Estimate</span>
              <span className="text-xl font-black text-amber-700 dark:text-amber-400">{stats.sourceRatios.catalog}%</span>
              <span className="text-[10px] text-amber-600 dark:text-amber-500 block mt-0.5">
                ({stats.sourceRatios.counts.catalog} hits)
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-2">
            🛡️ <strong>Integrity Guarantee:</strong> Estimated catalog entries are strictly excluded from historical item price charts. Only verified live and cached scrapes are tracked.
          </p>
        </div>
      </div>

      {/* Tracked Items Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-teal-500" />
            Tracked Grocery Price Series ({stats.trackedItemsCount} distinct items)
          </h2>
        </div>

        {stats.trackedItems.length === 0 ? (
          <p className="text-sm text-slate-500 italic py-4">
            No live item series recorded yet. Run a live compare to populate historical item trends.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-2">
            {stats.trackedItems.map((item) => (
              <button
                key={item}
                onClick={() => fetchItemSeries(item)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer capitalize ${
                  selectedItem === item
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {/* Selected Item Series Inspection */}
        {selectedItem && (
          <div className="mt-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white capitalize flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Historical Price Points for "{selectedItem}"
              </h3>
              {loadingSeries && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
            </div>

            {itemSeries && Object.keys(itemSeries.series).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                {Object.entries(itemSeries.series).map(([store, points]) => (
                  <div key={store} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                    <span className="text-xs font-extrabold uppercase text-slate-700 dark:text-slate-300 block">{store}</span>
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                      {points.slice(-3).map((pt, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{pt.date}:</span>
                          <span className="font-bold text-slate-900 dark:text-white">£{pt.totalPrice.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !loadingSeries && (
                <p className="text-xs text-slate-500 italic">No price series recorded for this item yet.</p>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};
