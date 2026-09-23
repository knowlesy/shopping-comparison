import React from 'react';
import { Check, Store, Truck } from 'lucide-react';
import type { SupermarketName } from '../../types';
import { PEER_FOCUS_RING, SettingsCard } from './controls';
import type { SectionProps } from './sectionTypes';

export const ALL_SUPERMARKETS: Array<{ id: SupermarketName; name: string }> = [
  { id: 'asda', name: 'Asda' },
  { id: 'sainsburys', name: "Sainsbury's" },
  { id: 'tesco', name: 'Tesco' },
  { id: 'morrisons', name: 'Morrisons' },
  { id: 'iceland', name: 'Iceland' },
  { id: 'aldi', name: 'Aldi' },
  { id: 'lidl', name: 'Lidl' },
  { id: 'waitrose', name: 'Waitrose' },
  { id: 'ocado', name: 'Ocado (M&S)' },
  { id: 'coop', name: 'Co-op' },
];

export const StoresSection: React.FC<SectionProps> = ({ draft, update }) => {
  const enabled = draft.enabledSupermarkets;

  const toggle = (store: SupermarketName, on: boolean) => {
    // The server refuses an empty list, so the last store cannot be switched off.
    if (!on && enabled.length === 1) return;
    update({ enabledSupermarkets: on ? [...enabled, store] : enabled.filter((s) => s !== store) });
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Active supermarkets"
        icon={<Store className="w-4 h-4 text-emerald-500" />}
        description={`Compare prices at ${enabled.length} of ${ALL_SUPERMARKETS.length} stores. At least one must stay on.`}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {ALL_SUPERMARKETS.map((store) => {
            const on = enabled.includes(store.id);
            const locked = on && enabled.length === 1;
            return (
              <label key={store.id} className={`relative ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={locked}
                  onChange={(e) => toggle(store.id, e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-bold transition ${PEER_FOCUS_RING} ${
                    on
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {on && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{store.name}</span>
                </span>
              </label>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard title="Delivery" icon={<Truck className="w-4 h-4 text-sky-500" />}>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Store totals include each store’s standard delivery fee, waived once the basket reaches that store’s minimum
          order. Split-basket routes add a fee for every store they use.
        </p>
      </SettingsCard>
    </div>
  );
};
