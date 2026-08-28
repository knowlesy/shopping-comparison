import { ShoppingCart, Sparkles, History, BookmarkCheck, Settings, Moon, Sun, Search, Loader2, ArrowUpCircle, BarChart3 } from 'lucide-react';

interface HeaderProps {
  activeTab: 'list' | 'compare' | 'history' | 'favorites' | 'quickcheck' | 'stats';
  setActiveTab: (tab: 'list' | 'compare' | 'history' | 'favorites' | 'quickcheck' | 'stats') => void;
  onOpenSettings: () => void;
  onOpenChangelog?: () => void;
  updateAvailable?: boolean;
  updateVersion?: string;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  itemCount: number;
  cheapestStore?: string;
  loading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  onOpenChangelog,
  updateAvailable = false,
  updateVersion = '1.1.0',
  isDark,
  setIsDark,
  itemCount,
  cheapestStore,
  loading = false,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors w-full">
      {/* 24-hour Update Notification Banner */}
      {updateAvailable && (
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-semibold py-1.5 px-3 sm:px-6 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2 truncate">
            <ArrowUpCircle className="w-4 h-4 text-purple-200 shrink-0" />
            <span className="truncate">
              🚀 A newer container image is available (v{updateVersion}).
            </span>
          </div>
          <button
            onClick={onOpenChangelog}
            className="px-2.5 py-0.5 rounded-full bg-white/20 hover:bg-white/30 text-[11px] font-bold text-white transition shrink-0 ml-2 cursor-pointer"
          >
            Click here for changes & pull guide →
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-0 sm:h-16 gap-2 sm:gap-0">
          {/* Top Row on Mobile: Logo on Left, Actions on Right */}
          <div className="flex items-center justify-between">
            {/* Logo & Brand */}
            <div
              className="flex items-center space-x-2.5 cursor-pointer"
              onClick={() => setActiveTab('list')}
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 shrink-0">
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-extrabold text-lg sm:text-xl tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-700 dark:from-white dark:via-slate-200 dark:to-emerald-400 bg-clip-text text-transparent">
                    TrolleyWise
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenChangelog) onOpenChangelog();
                    }}
                    title="View Changelog & Release Notes"
                    className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 transition cursor-pointer"
                  >
                    UK v1.1
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions & Dark Mode (Visible on mobile header) */}
            <div className="flex items-center space-x-1 sm:hidden">
              <button
                onClick={onOpenSettings}
                title="Comparison Preferences"
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <Settings className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsDark(!isDark)}
                title="Toggle Theme"
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Navigation Tabs (Responsive & Scrollable on mobile) */}
          <nav className="flex items-center space-x-1 sm:space-x-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none -mx-1 px-1 max-w-full">
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === 'list'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden sm:inline">Shopping List</span>
              <span className="sm:hidden">List</span>
              {itemCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] sm:text-xs rounded-full bg-emerald-600 text-white font-bold">
                  {itemCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('compare')}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === 'compare' || loading
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 shrink-0" />
              )}
              <span className="hidden sm:inline">{loading ? 'Scanning...' : 'Compare Prices'}</span>
              <span className="sm:hidden">{loading ? 'Scanning...' : 'Compare'}</span>
              {cheapestStore && !loading && (
                <span className="hidden md:inline-block ml-1 px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-bold uppercase">
                  {cheapestStore}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('quickcheck')}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === 'quickcheck'
                  ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-500 shrink-0" />
              <span className="hidden sm:inline">Quick Check</span>
              <span className="sm:hidden">Quick</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === 'history'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden sm:inline">Past Shops</span>
              <span className="sm:hidden">Past</span>
            </button>

            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === 'stats'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="hidden sm:inline">Stats</span>
              <span className="sm:hidden">Stats</span>
            </button>
          </nav>

          {/* Quick Actions & Dark Mode on Desktop */}
          <div className="hidden sm:flex items-center space-x-2">
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
