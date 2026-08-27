import React, { useState, useEffect } from 'react';
import { X, Sliders, Heart, Shield, Package, Store, Check, RefreshCw } from 'lucide-react';
import { UserPreferences, SupermarketName, CacheStats } from '../types';
import { api } from '../services/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onSavePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  preferences,
  onSavePreferences,
}) => {
  const [localPrefs, setLocalPrefs] = useState<UserPreferences>(preferences);
  const [saving, setSaving] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearedSuccess, setCacheClearedSuccess] = useState(false);

  useEffect(() => {
    setLocalPrefs(preferences);
    if (isOpen) {
      api.getCacheStats().then(setCacheStats).catch(() => {});
      setCacheClearedSuccess(false);
    }
  }, [preferences, isOpen]);

  const handleNukeCache = async () => {
    try {
      setClearingCache(true);
      const res = await api.clearPriceCache();
      if (res.success) {
        setCacheClearedSuccess(true);
        const updatedStats = await api.getCacheStats();
        setCacheStats(updatedStats);
        setTimeout(() => setCacheClearedSuccess(false), 5000);
      }
    } catch (err) {
      console.error('Failed to clear price cache:', err);
    } finally {
      setClearingCache(false);
    }
  };

  if (!isOpen) return null;

  const handleToggleStore = (store: SupermarketName) => {
    const current = localPrefs.enabledSupermarkets;
    let next: SupermarketName[];
    if (current.includes(store)) {
      if (current.length === 1) return; // Prevent disabling all
      next = current.filter(s => s !== store);
    } else {
      next = [...current, store];
    }
    setLocalPrefs({ ...localPrefs, enabledSupermarkets: next });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSavePreferences(localPrefs);
      onClose();
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const allSupermarkets: Array<{ id: SupermarketName; name: string }> = [
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                Comparison Preferences & Rules
              </h3>
              <p className="text-xs text-slate-500">Tune health biases, brand tiers, and supermarket coverage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preferences Form */}
        <div className="space-y-5 max-h-[480px] overflow-y-auto pr-1">
          {/* Section 1: Healthier Defaults & Dietary Preferences */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center space-x-1.5">
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <span>Health & Dietary Biasing</span>
            </h4>

            <div className="space-y-2">
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Default to Healthier Options (e.g. 5% Lean Mince, 0% Yogurt)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Automatically prioritizes leaner meats, wholewheat grains, and low-fat dairy
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={localPrefs.healthierDefault}
                  onChange={e => setLocalPrefs({ ...localPrefs, healthierDefault: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
              </label>

              {/* Minced Meat Fat Preference */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Default Minced Meat Fat %
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 5, label: '5% Lean (Default)', desc: 'Healthy bias' },
                    { val: 12, label: '12-15% Standard', desc: 'Everyday blend' },
                    { val: 20, label: '20% Value', desc: 'Cheapest option' },
                  ].map(fatOpt => (
                    <button
                      key={fatOpt.val}
                      type="button"
                      onClick={() => setLocalPrefs({ ...localPrefs, fatPercentagePreference: fatOpt.val })}
                      className={`p-2 rounded-lg border text-center transition ${
                        (localPrefs.fatPercentagePreference ?? 5) === fatOpt.val
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="text-xs">{fatOpt.label}</div>
                      <div className="text-[9px] opacity-80">{fatOpt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Prefer Wholewheat
                  </span>
                  <input
                    type="checkbox"
                    checked={localPrefs.preferWholewheat}
                    onChange={e => setLocalPrefs({ ...localPrefs, preferWholewheat: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Prefer Free Range
                  </span>
                  <input
                    type="checkbox"
                    checked={localPrefs.preferFreeRange}
                    onChange={e => setLocalPrefs({ ...localPrefs, preferFreeRange: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Prefer Organic
                  </span>
                  <input
                    type="checkbox"
                    checked={localPrefs.preferOrganic}
                    onChange={e => setLocalPrefs({ ...localPrefs, preferOrganic: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Cut & Form Matching Strategy */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center space-x-1.5">
              <Package className="w-3.5 h-3.5 text-indigo-500" />
              <span>Meat & Fish Cut Matching Strategy</span>
            </h4>

            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  id: 'best_value',
                  label: '🟢 Best Value (Equivalent Cuts)',
                  desc: 'Treats loins, fillets & portions as equivalent to find the lowest £/kg (Recommended)'
                },
                {
                  id: 'strict_cut',
                  label: '🔵 Strict Cut Only',
                  desc: 'Only matches the exact cut specified in the list (e.g. only loins when loins is typed)'
                },
              ].map(strat => (
                <button
                  key={strat.id}
                  type="button"
                  onClick={() => setLocalPrefs({ ...localPrefs, cutMatchingStrategy: strat.id as any })}
                  className={`p-3 rounded-xl border text-left transition ${
                    (localPrefs.cutMatchingStrategy || 'best_value') === strat.id
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <strong className="text-xs text-slate-900 dark:text-white block">{strat.label}</strong>
                  <span className="text-[10px] text-slate-400 block mt-1 leading-snug">{strat.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Pack Sizing Strategy */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center space-x-1.5">
              <Package className="w-3.5 h-3.5 text-blue-500" />
              <span>Packaging Matching Policy</span>
            </h4>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'closest', label: 'Closest Single Pack', desc: 'e.g. 750g for 900g target' },
                { id: 'cover', label: 'Cover Target (Round Up)', desc: 'e.g. 2x500g for 900g target' },
                { id: 'cheapest_per_unit', label: 'Lowest £/kg', desc: 'Best value unit pricing' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLocalPrefs({ ...localPrefs, packSizingPolicy: opt.id as any })}
                  className={`p-3 rounded-xl border text-left transition ${
                    localPrefs.packSizingPolicy === opt.id
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <strong className="text-xs text-slate-900 dark:text-white block">{opt.label}</strong>
                  <span className="text-[10px] text-slate-400 block mt-1">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Brand Tier Priority */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-500" />
              <span>Brand Tier Priority</span>
            </h4>

            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'value', label: 'Value / Savers' },
                { id: 'standard', label: 'Own-Brand Standard' },
                { id: 'premium', label: 'Finest / Premium' },
                { id: 'branded', label: 'Name Brands First' },
              ].map(tier => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setLocalPrefs({ ...localPrefs, brandTierPriority: tier.id as any })}
                  className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition ${
                    localPrefs.brandTierPriority === tier.id
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section 4: Enabled Supermarkets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center space-x-1.5">
                <Store className="w-3.5 h-3.5 text-emerald-500" />
                <span>Active Supermarkets</span>
              </h4>
              <span className="text-[11px] text-slate-400">Select which supermarkets to compare</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {allSupermarkets.map(store => {
                const isEnabled = localPrefs.enabledSupermarkets.includes(store.id);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => handleToggleStore(store.id)}
                    className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                      isEnabled
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 opacity-60'
                    }`}
                  >
                    {isEnabled && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />}
                    <span>{store.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 5: 72-Hour Price Cache & Data Controls */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center space-x-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-cyan-500" />
                <span>72-Hour Price Cache & Scrape Control</span>
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300">
                72h TTL Active
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <span>Local Supermarket Price Cache</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {cacheStats
                      ? `${cacheStats.entriesCount} search queries cached (~${cacheStats.estimatedProducts} live prices stored on disk)`
                      : 'Loading cache statistics...'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleNukeCache}
                  disabled={clearingCache}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm transition flex items-center space-x-1.5 shrink-0 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${clearingCache ? 'animate-spin' : ''}`} />
                  <span>{clearingCache ? 'Nuking Cache...' : '⚡ Nuke Cache & Force Rescan'}</span>
                </button>
              </div>

              {cacheClearedSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Price cache nuked successfully! Next search will run 100% fresh live scrapes.</span>
                </div>
              )}

              <div className="text-[11px] text-slate-400 bg-white/60 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 leading-relaxed">
                💡 <strong>Safety Note:</strong> Nuking the price cache only purges cached supermarket scraper HTML. Your <strong>past shops, saved lists, and favorites are 100% preserved</strong> and will never be deleted.
              </div>
            </div>
          </div>

          {/* Section 6: Past Searches (72h Cache) */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  📌 Record & Display Past Searches (72h Cache)
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Remembers your searches for 72 hours so closing tabs won't lose your work. Toggle off for testing.
                </span>
              </div>
              <input
                type="checkbox"
                checked={localPrefs.enablePastSearches !== false}
                onChange={e => setLocalPrefs({ ...localPrefs, enablePastSearches: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
            </label>
          </div>

          {/* Section 7: Hybrid Matching (Gemini 2.5 Flash Fallback) */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className={`p-3.5 rounded-xl border transition-all space-y-3 ${
              localPrefs.aiMatchingEnabled
                ? 'border-purple-400 bg-purple-50/50 dark:bg-purple-950/20'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'
            }`}>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                    <span>✨ Google Gemini AI Fallback Matching</span>
                    {localPrefs.aiMatchingExternallyConfigured && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200 uppercase">
                        Container ENV Active
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Off by default. Uses <code>gemini-2.5-flash</code> when local fuzzy matching returns borderline or thin candidates.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={localPrefs.aiMatchingEnabled || false}
                  onChange={e => setLocalPrefs({ ...localPrefs, aiMatchingEnabled: e.target.checked })}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
              </label>

              {localPrefs.aiMatchingEnabled && (
                <div className="pt-2 border-t border-purple-200 dark:border-purple-800/50 space-y-2 animate-in fade-in">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                    Gemini API Key (Optional if configured via ENV):
                  </label>
                  <input
                    type="password"
                    placeholder="AIzaSy... (leave blank if GEMINI_API_KEY is set in container)"
                    value={localPrefs.geminiApiKey || ''}
                    onChange={e => setLocalPrefs({ ...localPrefs, geminiApiKey: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 block">
                    Model: <strong>gemini-2.5-flash</strong> • Cached for 72h to minimize API tokens.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 8: Dev Mode */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
              localPrefs.devMode
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'
            }`}>
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                  <span>🛠️ Developer Mode</span>
                  {localPrefs.devMode && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 uppercase">
                      Active
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5 leading-snug">
                  Disables auto-archiving of comparisons. Manual saves are labelled <strong>[DEV]</strong> in history. Turn off for production weekly shops.
                </span>
              </div>
              <input
                type="checkbox"
                checked={localPrefs.devMode || false}
                onChange={e => setLocalPrefs({ ...localPrefs, devMode: e.target.checked })}
                className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Apply & Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
