import React from 'react';
import { ShoppingCart, Sparkles, History, BookmarkCheck, Settings, Moon, Sun } from 'lucide-react';

interface HeaderProps {
  activeTab: 'list' | 'compare' | 'history' | 'favorites';
  setActiveTab: (tab: 'list' | 'compare' | 'history' | 'favorites') => void;
  onOpenSettings: () => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  itemCount: number;
  cheapestStore?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  isDark,
  setIsDark,
  itemCount,
  cheapestStore,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('list')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-700 dark:from-white dark:via-slate-200 dark:to-emerald-400 bg-clip-text text-transparent">
                  TrolleyWise
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  UK
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                Smart Grocery & Price Comparator
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'list'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Shopping List</span>
              {itemCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-emerald-600 text-white font-bold">
                  {itemCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('compare')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'compare'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Compare Prices</span>
              {cheapestStore && (
                <span className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[11px] rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-bold uppercase">
                  {cheapestStore}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'history'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Past Shops</span>
            </button>

            <button
              onClick={() => setActiveTab('favorites')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'favorites'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <BookmarkCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Favorites & Ideas</span>
            </button>
          </nav>

          {/* Quick Actions & Dark Mode */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenSettings}
              title="Comparison Preferences"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <Settings className="w-5 h-5" />
            </button>

            <button
              onClick={() => setIsDark(!isDark)}
              title="Toggle Theme"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
