import React, { useId } from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { UserPreferences } from '../../types';
import { FOCUS_RING, SettingsCard, ToggleRow } from './controls';
import type { SectionProps } from './sectionTypes';

export interface AiTestState {
  testing: boolean;
  result: { success: boolean; passedCount: number; totalCount: number; error?: string } | null;
  onTest: () => void;
}

const INPUT =
  'w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500';

const STAGES: Array<{ id: keyof NonNullable<UserPreferences['aiStages']>; label: string }> = [
  { id: 'interpret', label: 'Interpret' },
  { id: 'query', label: 'Query' },
  { id: 'select', label: 'Select' },
];
const STAGE_DEFAULTS = { interpret: true, query: false, select: true };

export const AiSection: React.FC<SectionProps & { aiTest: AiTestState }> = ({ draft, update, aiTest }) => {
  const keyId = useId();
  const levelId = useId();
  const budgetId = useId();
  const stagesId = useId();
  const stages = { ...STAGE_DEFAULTS, ...(draft.aiStages || {}) };

  return (
    <SettingsCard title="AI matching" icon={<Sparkles className="w-4 h-4 text-purple-500" />}>
      <ToggleRow
        label="Google Gemini AI fallback matching"
        badge={
          draft.aiMatchingExternallyConfigured ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200 uppercase">
              Container ENV active
            </span>
          ) : undefined
        }
        description={
          <>
            Off by default. Uses <code>gemini-2.5-flash</code> when local matching returns borderline or thin
            candidates.
          </>
        }
        checked={draft.aiMatchingEnabled || false}
        onChange={(aiMatchingEnabled) => update({ aiMatchingEnabled })}
      />

      {draft.aiMatchingEnabled && (
        <div className="space-y-3 p-3 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/10">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={keyId} className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Gemini API key (optional if set in the environment)
              </label>
              {draft.hasGeminiKey && (
                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
                  <Check className="w-3 h-3" aria-hidden="true" />
                  Key saved
                </span>
              )}
            </div>
            <input
              id={keyId}
              type="password"
              autoComplete="off"
              placeholder={draft.hasGeminiKey ? '•••••••• (saved — enter a new key to replace it)' : 'AIzaSy… (leave blank if set in the environment)'}
              value={draft.geminiApiKey || ''}
              onChange={(e) => update({ geminiApiKey: e.target.value })}
              className={INPUT}
            />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
              Write-only: the key is never sent back to the browser.
            </span>
            <span className="text-[10px] text-amber-700 dark:text-amber-400 block">
              {draft.geminiKeySource === 'environment'
                ? 'Configured from the container environment — persists across restarts.'
                : 'A key entered here is held in server memory only and is lost when the API restarts. For a key that survives a restart, set GEMINI_API_KEY in the environment or a k3s Secret.'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor={levelId} className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                AI assist level
              </label>
              <select
                id={levelId}
                value={draft.aiAssistLevel || 'balanced'}
                onChange={(e) => update({ aiAssistLevel: e.target.value as UserPreferences['aiAssistLevel'] })}
                className={INPUT}
              >
                <option value="economy">Economy (only when no match found)</option>
                <option value="balanced">Balanced (near-ties and low confidence)</option>
                <option value="thorough">Thorough (also checks high-value items)</option>
                <option value="off">Off (deterministic matching only)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={budgetId} className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                AI calls per basket
              </label>
              <input
                id={budgetId}
                type="number"
                min={0}
                max={500}
                value={draft.aiMaxCallsPerBasket ?? 25}
                onChange={(e) => update({ aiMaxCallsPerBasket: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                className={INPUT}
              />
            </div>
          </div>

          <div role="group" aria-labelledby={stagesId} className="space-y-1.5">
            <span id={stagesId} className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
              Active AI stages
            </span>
            <div className="flex flex-wrap gap-4">
              {STAGES.map((stage) => (
                <label key={stage.id} className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stages[stage.id]}
                    onChange={(e) => update({ aiStages: { ...stages, [stage.id]: e.target.checked } })}
                    className={`w-3.5 h-3.5 rounded accent-purple-600 ${FOCUS_RING}`}
                  />
                  {stage.label}
                </label>
              ))}
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-purple-200/60 dark:border-purple-900/40">
            <button
              type="button"
              onClick={aiTest.onTest}
              disabled={aiTest.testing}
              className={`px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 ${FOCUS_RING}`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${aiTest.testing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {aiTest.testing ? 'Testing live AI…' : 'Test AI matching'}
            </button>
            {aiTest.result && (
              <span
                role="status"
                className={`text-[11px] font-bold ${aiTest.result.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}
              >
                {aiTest.result.success
                  ? `Passed (${aiTest.result.passedCount}/${aiTest.result.totalCount} fixtures)`
                  : aiTest.result.error || 'Failed'}
              </span>
            )}
          </div>
        </div>
      )}

      <ToggleRow
        label="Diagnostic match logging"
        description={
          <>
            Records full candidate scores and runner-up veto reasons to <code>match_decisions.jsonl</code>. Opt-in only.
          </>
        }
        checked={draft.enableMatchLog || false}
        onChange={(enableMatchLog) => update({ enableMatchLog })}
      />
    </SettingsCard>
  );
};
