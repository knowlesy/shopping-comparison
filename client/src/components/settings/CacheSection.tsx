import React from 'react';
import { Check, RefreshCw } from 'lucide-react';
import type { CacheStats } from '../../types';
import { FOCUS_RING, SettingsCard, ToggleRow } from './controls';
import type { SectionProps } from './sectionTypes';

export interface CacheState {
  stats: CacheStats | null;
  clearing: boolean;
  cleared: boolean;
  onClear: () => void;
}

export const CacheSection: React.FC<SectionProps & { cache: CacheState }> = ({ draft, update, cache }) => (
  <SettingsCard
    title="72-hour price cache & scrape control"
    icon={<RefreshCw className="w-4 h-4 text-cyan-500" />}
    actions={
      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300">
        72h TTL active
      </span>
    }
  >
    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-slate-900 dark:text-white">Local supermarket price cache</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {cache.stats
              ? `${cache.stats.entriesCount} search queries cached (~${cache.stats.estimatedProducts} prices stored on disk)`
              : 'Loading cache statistics…'}
          </p>
        </div>
        <button
          type="button"
          onClick={cache.onClear}
          disabled={cache.clearing}
          className={`px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50 ${FOCUS_RING}`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${cache.clearing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {cache.clearing ? 'Clearing cache…' : 'Clear cache & force rescan'}
        </button>
      </div>
      {cache.cleared && (
        <div
          role="status"
          className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2"
        >
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          Price cache cleared. The next search runs fresh live scrapes.
        </div>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Clearing only removes cached supermarket results. Past shops, saved lists and favourites are kept.
      </p>
    </div>
    <ToggleRow
      label="Record and show past searches (72 hours)"
      description="Remembers your searches for 72 hours so closing a tab does not lose your work. Turn off for testing."
      checked={draft.enablePastSearches !== false}
      onChange={(enablePastSearches) => update({ enablePastSearches })}
    />
  </SettingsCard>
);
