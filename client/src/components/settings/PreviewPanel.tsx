import React, { useEffect, useRef } from 'react';
import { ArrowRight, Ban, Clock, Eye, X } from 'lucide-react';
import type { ItemEffect, PreviewResult, StoreEffect } from '../../services/prefPreview';
import { FOCUS_RING } from './controls';

function money(delta: number): string {
  if (delta === 0) return '£0.00';
  return `${delta > 0 ? '+' : '−'}£${Math.abs(delta).toFixed(2)}`;
}

const StoreLine: React.FC<{ effect: StoreEffect }> = ({ effect }) => {
  const from = effect.fromType || effect.fromTitle;
  const to = effect.toType || effect.toTitle;
  return (
    <li className="flex items-start justify-between gap-2 text-[11px] leading-snug">
      <span className="min-w-0">
        <span className="font-bold text-slate-700 dark:text-slate-200">{effect.storeName}: </span>
        {effect.status === 'switch' && (
          <span className="text-slate-600 dark:text-slate-300" title={`${effect.fromTitle} → ${effect.toTitle}`}>
            {from} <ArrowRight className="inline w-3 h-3 -mt-0.5" aria-label="to" /> {to}
          </span>
        )}
        {effect.status === 'next_compare' && (
          <span className="text-slate-500 dark:text-slate-400">applies on next compare</span>
        )}
        {effect.status === 'only_never' && (
          <span className="text-rose-700 dark:text-rose-300 font-semibold">only a Never option</span>
        )}
        {effect.status === 'excluded' && (
          <span className="text-rose-700 dark:text-rose-300 font-semibold">nothing loaded fits your diet</span>
        )}
      </span>
      {effect.status === 'switch' && effect.priceDelta !== undefined && (
        <span
          className={`shrink-0 font-bold tabular-nums ${
            effect.priceDelta > 0
              ? 'text-amber-700 dark:text-amber-400'
              : effect.priceDelta < 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {money(effect.priceDelta)}
        </span>
      )}
    </li>
  );
};

const ItemBlock: React.FC<{ effect: ItemEffect }> = ({ effect }) => (
  <li className="py-2.5 border-t border-slate-100 dark:border-slate-800 first:border-t-0 space-y-1">
    <div className="text-xs font-bold text-slate-900 dark:text-white">
      {effect.itemName}
      {effect.newType && (
        <>
          {' '}
          <ArrowRight className="inline w-3 h-3 -mt-0.5 text-slate-400" aria-label="to" /> {effect.newType}
        </>
      )}
    </div>
    {effect.notCompared ? (
      <p className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
        <Clock className="w-3 h-3" aria-hidden="true" />
        Not in the loaded comparison — applies on next compare
      </p>
    ) : (
      <ul className="space-y-1">
        {effect.stores.map((s) => (
          <StoreLine key={s.store} effect={s} />
        ))}
      </ul>
    )}
  </li>
);

interface PreviewBodyProps {
  result: PreviewResult;
  pending: boolean;
  hasItems: boolean;
}

export const PreviewBody: React.FC<PreviewBodyProps> = ({ result, pending, hasItems }) => {
  if (!hasItems && !result.hasComparison) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Add items to your list to see how ratings change your shop.</p>;
  }
  if (!pending) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Change a rating or diet to see how this week’s list would shift.</p>;
  }
  if (result.items.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Nothing on this week’s list is affected.</p>;
  }
  const neverStores = result.items.flatMap((i) => i.stores).filter((s) => s.status === 'only_never').length;
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
        {result.changedItems} item{result.changedItems === 1 ? '' : 's'} change
      </p>
      {neverStores > 0 && (
        <p className="text-[11px] text-rose-700 dark:text-rose-300 inline-flex items-center gap-1">
          <Ban className="w-3 h-3" aria-hidden="true" />
          {neverStores} store{neverStores === 1 ? ' has' : 's have'} only a Never option
        </p>
      )}
      <ul>
        {result.items.map((effect) => (
          <ItemBlock key={effect.itemId} effect={effect} />
        ))}
      </ul>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
        From the comparison already loaded; nothing is re-checked. Prices are per line at the same pack count.
      </p>
    </div>
  );
};

/** Desktop: a sticky column beside the food section. */
export const PreviewPanel: React.FC<PreviewBodyProps> = (props) => (
  <aside aria-labelledby="preview-heading" className="hidden lg:block">
    <div className="sticky top-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <h2 id="preview-heading" className="text-sm font-extrabold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
        <Eye className="w-4 h-4 text-emerald-600" aria-hidden="true" />
        Effect on this week
      </h2>
      <PreviewBody {...props} />
    </div>
  </aside>
);

interface PreviewSheetProps extends PreviewBodyProps {
  open: boolean;
  onClose: () => void;
}

/** Below desktop: the same content in a bottom sheet opened from the save strip. */
export const PreviewSheet: React.FC<PreviewSheetProps> = ({ open, onClose, ...body }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (returnFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-sheet-heading"
        className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="preview-sheet-heading" className="text-sm font-extrabold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            Effect on this week
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className={`p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 ${FOCUS_RING}`}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <PreviewBody {...body} />
      </div>
    </div>
  );
};
