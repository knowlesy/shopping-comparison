import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronUp, SlidersHorizontal, Store, Tag, Utensils } from 'lucide-react';
import type { CacheStats, ComparisonResponse, ParsedItem, SystemVersionInfo, UserPreferences } from '../../types';
import { api } from '../../services/api';
import { previewFoodChanges } from '../../services/prefPreview';
import { FOCUS_RING } from './controls';
import { FoodSection } from './FoodSection';
import { StoresSection } from './StoresSection';
import { DealsSection } from './DealsSection';
import { AdvancedSection } from './AdvancedSection';
import type { AiTestState } from './AiSection';
import { PreviewPanel, PreviewSheet } from './PreviewPanel';
import { buildPatch, countChanges, draftFrom, fieldChanges } from './settingsDraft';

type SectionId = 'food' | 'stores' | 'deals' | 'advanced';

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'food', label: 'Food & diet', icon: Utensils },
  { id: 'stores', label: 'Stores & delivery', icon: Store },
  { id: 'deals', label: 'Deals & brands', icon: Tag },
  { id: 'advanced', label: 'Advanced', icon: SlidersHorizontal },
];

const SECTION_STORAGE_KEY = 'settingsSection';

function readSection(): SectionId {
  try {
    const saved = localStorage.getItem(SECTION_STORAGE_KEY);
    if (saved && SECTIONS.some((s) => s.id === saved)) return saved as SectionId;
  } catch {}
  return 'food';
}

interface SettingsPageProps {
  preferences: UserPreferences;
  onSavePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  items: ParsedItem[];
  comparison: ComparisonResponse | null;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ preferences, onSavePreferences, items, comparison }) => {
  const [section, setSectionState] = useState<SectionId>(readSection);
  const [draft, setDraft] = useState<UserPreferences>(() => draftFrom(preferences));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [versionInfo, setVersionInfo] = useState<SystemVersionInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ updateAvailable: boolean; latestVersion: string } | null>(null);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AiTestState['result']>(null);

  const changes = countChanges(preferences, draft);

  // "Effect on this week", from the list and comparison already loaded.
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const foodPending = fieldChanges(preferences, draft, 'foodRatings') + fieldChanges(preferences, draft, 'diet') > 0;
  const preview = useMemo(
    () =>
      previewFoodChanges({
        items,
        comparison,
        savedRatings: preferences.foodRatings,
        draftRatings: draft.foodRatings,
        savedDiet: preferences.diet,
        draftDiet: draft.diet,
      }),
    [items, comparison, preferences.foodRatings, draft.foodRatings, preferences.diet, draft.diet]
  );
  const previewProps = { result: preview, pending: foodPending, hasItems: items.length > 0 };

  // New server settings replace the draft when nothing was pending against the previous
  // ones, or straight after a save. Unsaved edits are never silently thrown away.
  const resetOnNextPrefs = useRef(false);
  const previousPrefs = useRef(preferences);
  useEffect(() => {
    const previous = previousPrefs.current;
    previousPrefs.current = preferences;
    const force = resetOnNextPrefs.current;
    resetOnNextPrefs.current = false;
    setDraft((current) => (force || countChanges(previous, current) === 0 ? draftFrom(preferences) : current));
  }, [preferences]);

  // On the mobile chip row, keep the active section's chip fully on screen.
  const activeChip = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeChip.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [section]);

  useEffect(() => {
    api.getCacheStats().then(setCacheStats).catch(() => {});
    api.getSystemVersion().then(setVersionInfo).catch(() => {});
  }, []);

  const setSection = (id: SectionId) => {
    setSectionState(id);
    try {
      localStorage.setItem(SECTION_STORAGE_KEY, id);
    } catch {}
  };

  const update = (patch: Partial<UserPreferences>) => {
    setJustSaved(false);
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async () => {
    const patch = buildPatch(preferences, draft);
    if (Object.keys(patch).length === 0) return;
    try {
      setSaving(true);
      setSaveError(null);
      resetOnNextPrefs.current = true;
      await onSavePreferences(patch);
      setJustSaved(true);
    } catch (err: any) {
      // The draft stays as it was: a refused save must not look like a stored one.
      resetOnNextPrefs.current = false;
      setSaveError(err?.message || 'Settings were not saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setSaveError(null);
    setDraft(draftFrom(preferences));
  };

  const handleClearCache = async () => {
    try {
      setClearingCache(true);
      const res = await api.clearPriceCache();
      if (res.success) {
        setCacheCleared(true);
        setCacheStats(await api.getCacheStats());
        setTimeout(() => setCacheCleared(false), 5000);
      }
    } catch (err) {
      console.error('Failed to clear price cache:', err);
    } finally {
      setClearingCache(false);
    }
  };

  const handleCheckUpdate = async () => {
    try {
      setCheckingUpdate(true);
      const res = await api.checkUpdate();
      setUpdateResult({ updateAvailable: res.updateAvailable, latestVersion: res.latestVersion });
    } catch {
      setUpdateResult(null);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleTestAi = async () => {
    try {
      setTestingAi(true);
      setAiTestResult(null);
      // A key typed but not yet saved has to reach the server before it can be tested.
      if (draft.geminiApiKey) {
        try {
          await onSavePreferences({ geminiApiKey: draft.geminiApiKey, aiMatchingEnabled: true });
          setDraft((prev) => ({ ...prev, geminiApiKey: '', aiMatchingEnabled: true }));
        } catch (err: any) {
          setAiTestResult({ success: false, passedCount: 0, totalCount: 0, error: err?.message || 'Could not save the key before testing' });
          return;
        }
      }
      const res = await fetch('/api/settings/ai-test', { method: 'POST' });
      const data = await res.json();
      setAiTestResult(
        res.ok
          ? { success: data.success, passedCount: data.passedCount, totalCount: data.totalCount }
          : { success: false, passedCount: 0, totalCount: 0, error: data.error || 'AI test failed' }
      );
    } catch (err: any) {
      setAiTestResult({ success: false, passedCount: 0, totalCount: 0, error: err.message });
    } finally {
      setTestingAi(false);
    }
  };

  const sectionProps = { draft, update };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          How your list is matched and priced. Changes apply after you save.
        </p>
      </div>

      <div
        className={`lg:grid lg:gap-8 ${
          section === 'food' ? 'lg:grid-cols-[220px_minmax(0,1fr)_300px]' : 'lg:grid-cols-[220px_minmax(0,1fr)]'
        }`}
      >
        <nav aria-label="Settings sections" className="mb-4 lg:mb-0">
          <ul className="flex lg:flex-col gap-2 lg:gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 lg:pb-0 lg:sticky lg:top-24 scrollbar-none">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const active = id === section;
              return (
                <li key={id} className="shrink-0">
                  <button
                    ref={active ? activeChip : undefined}
                    type="button"
                    onClick={() => setSection(id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full inline-flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm font-semibold transition rounded-full lg:rounded-xl px-3 py-1.5 lg:py-2.5 border lg:border-0 ${FOCUS_RING} ${
                      active
                        ? 'bg-emerald-600 lg:bg-emerald-50 text-white lg:text-emerald-800 border-emerald-600 dark:lg:bg-emerald-950/60 dark:lg:text-emerald-300 font-bold'
                        : 'bg-white dark:bg-slate-900 lg:bg-transparent lg:dark:bg-transparent border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 pb-24">
          <h2 className="sr-only">{SECTIONS.find((s) => s.id === section)?.label}</h2>
          {section === 'food' && <FoodSection {...sectionProps} />}
          {section === 'stores' && <StoresSection {...sectionProps} />}
          {section === 'deals' && <DealsSection {...sectionProps} />}
          {section === 'advanced' && (
            <AdvancedSection
              {...sectionProps}
              cache={{ stats: cacheStats, clearing: clearingCache, cleared: cacheCleared, onClear: handleClearCache }}
              about={{ versionInfo, checking: checkingUpdate, updateResult, onCheck: handleCheckUpdate }}
              aiTest={{ testing: testingAi, result: aiTestResult, onTest: handleTestAi }}
            />
          )}
        </div>

        {section === 'food' && <PreviewPanel {...previewProps} />}
      </div>

      <SaveBar
        changes={changes}
        saving={saving}
        error={saveError}
        justSaved={justSaved}
        onSave={handleSave}
        onDiscard={handleDiscard}
        preview={section === 'food' && foodPending ? { count: preview.changedItems, onOpen: () => setSheetOpen(true) } : undefined}
      />
      {section === 'food' && <PreviewSheet open={sheetOpen} onClose={closeSheet} {...previewProps} />}
    </div>
  );
};

interface SaveBarProps {
  changes: number;
  saving: boolean;
  error: string | null;
  justSaved: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** Below desktop, the food preview lives in this strip and opens as a sheet. */
  preview?: { count: number; onOpen: () => void };
}

const SaveBar: React.FC<SaveBarProps> = ({ changes, saving, error, justSaved, onSave, onDiscard, preview }) => {
  if (changes === 0 && !error && !justSaved) return null;
  return (
    <div className="sticky bottom-0 z-30 -mx-4 sm:mx-0 px-4 sm:px-0 pb-3 pt-2 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent dark:from-slate-950 dark:via-slate-950/95">
      <div
        role="region"
        aria-label="Unsaved settings"
        className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-4 py-3 space-y-2"
      >
        {error && (
          <div
            data-testid="settings-save-error"
            role="alert"
            className="px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
          >
            Not saved: {error}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {preview && (
            <button
              type="button"
              onClick={preview.onOpen}
              aria-haspopup="dialog"
              className={`lg:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-xs font-bold ${FOCUS_RING}`}
            >
              {preview.count} item{preview.count === 1 ? '' : 's'} change
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <span role="status" className={`text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 ${preview ? 'max-lg:sr-only' : ''}`}>
            {changes > 0 ? (
              `${changes} unsaved change${changes === 1 ? '' : 's'}`
            ) : (
              <>
                <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                Saved
              </>
            )}
          </span>
          {changes > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDiscard}
                disabled={saving}
                className={`px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 ${FOCUS_RING}`}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className={`px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50 ${FOCUS_RING}`}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
