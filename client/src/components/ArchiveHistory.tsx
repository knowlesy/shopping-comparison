import React, { useEffect, useState } from 'react';
import { History, Calendar, ArrowRight, Trash2, Sparkles, TrendingDown, ShoppingCart } from 'lucide-react';
import { SavedShop } from '../types';
import { api } from '../services/api';

interface ArchiveHistoryProps {
  onLoadShop: (rawList: string) => Promise<void>;
}

export const ArchiveHistory: React.FC<ArchiveHistoryProps> = ({ onLoadShop }) => {
  const [history, setHistory] = useState<SavedShop[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.getHistory();
      setHistory(res);
    } catch (err) {
      console.error('Error loading history:', err);
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
    } catch (err) {
      console.error('Error deleting shop:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold uppercase">
          <History className="w-3.5 h-3.5" />
          <span>Shopping Archives & Price Tracker</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          Past Shopping Trips & Supermarket Prices
        </h1>
        <p className="text-slate-500 text-sm max-w-2xl">
          Review historical baskets, compare which supermarket was cheapest on each date, and reload any list with a single click.
        </p>
      </div>

      {/* History List */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-16 text-center text-slate-400">Loading archived shops...</div>
        ) : history.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <History className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
            <h3 className="font-bold text-slate-700 dark:text-slate-300">No Saved Shops Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Run a price comparison on your shopping list and click "Save Archive" to keep track of your baskets over time!
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

            return (
              <div
                key={shop.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 transition space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                        {shop.name || `Basket with ${shop.itemCount} items`}
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold uppercase">
                        🏆 Cheapest: {shop.cheapestStore} (£{shop.lowestPrice?.toFixed(2)})
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span>{shop.itemCount} items compared</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 self-start sm:self-center">
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

                {/* Totals Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
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
                        <div className="text-xs uppercase font-bold text-slate-500">{store}</div>
                        <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                          £{Number(total).toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
