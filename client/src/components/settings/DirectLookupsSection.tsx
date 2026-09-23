import React from 'react';
import { Cpu } from 'lucide-react';
import { FOCUS_RING, SettingsCard, ToggleRow } from './controls';
import type { SectionProps } from './sectionTypes';

const DIRECT_STORES = [
  { id: 'tesco', name: 'Tesco', supported: true },
  { id: 'sainsburys', name: "Sainsbury's", supported: true },
  { id: 'asda', name: 'Asda', supported: true },
  { id: 'morrisons', name: 'Morrisons', supported: true },
  { id: 'iceland', name: 'Iceland', supported: true },
  { id: 'aldi', name: 'Aldi', supported: false },
  { id: 'lidl', name: 'Lidl', supported: false },
];

const ADAPTER_DEFAULTS: Record<string, boolean> = { tesco: true, sainsburys: true, asda: true, morrisons: true, iceland: true };

export const DirectLookupsSection: React.FC<SectionProps> = ({ draft, update }) => {
  const masterOn = draft.directScrapersEnabled ?? true;
  const adapters = { ...ADAPTER_DEFAULTS, ...(draft.directStoreAdapters || {}) };

  return (
    <SettingsCard
      title="Direct store lookups"
      icon={<Cpu className="w-4 h-4 text-blue-500" />}
      actions={
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
          Tier 1 direct (90% trust)
        </span>
      }
    >
      <ToggleRow
        label="Use direct store adapters"
        description="Queries supermarket backends directly for high-confidence prices. When off, or when an adapter is down, results fall back to the aggregator (60%) or the catalog benchmark (40%)."
        checked={masterOn}
        onChange={(directScrapersEnabled) => update({ directScrapersEnabled })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DIRECT_STORES.map((store) => {
          if (!store.supported) {
            return (
              <div
                key={store.id}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400"
              >
                <span className="text-xs font-semibold">{store.name}</span>
                <span className="text-[10px] italic text-right">No online grocery — estimated data only</span>
              </div>
            );
          }
          const on = adapters[store.id];
          return (
            <label
              key={store.id}
              className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                masterOn ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              } ${
                masterOn && on
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                  : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!masterOn}
                  onChange={(e) => update({ directStoreAdapters: { ...adapters, [store.id]: e.target.checked } })}
                  className={`w-3.5 h-3.5 rounded accent-emerald-600 ${FOCUS_RING}`}
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{store.name}</span>
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  masterOn && on
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {masterOn && on ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          );
        })}
      </div>
    </SettingsCard>
  );
};
