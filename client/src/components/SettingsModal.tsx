import React, { useState, useEffect } from 'react';
import { X, Sliders, Heart, Shield, Package, Store, Check, RefreshCw, Sparkles, Info, ExternalLink, Layers, Cpu, GitBranch } from 'lucide-react';
import { UserPreferences, SupermarketName, CacheStats, SystemVersionInfo } from '../types';
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
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; passedCount: number; totalCount: number; error?: string } | null>(null);
  const [versionInfo, setVersionInfo] = useState<SystemVersionInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ updateAvailable: boolean; latestVersion: string } | null>(null);

  useEffect(() => {
    setLocalPrefs(preferences);
    if (isOpen) {
      api.getCacheStats().then(setCacheStats).catch(() => {});
      api.getSystemVersion().then(setVersionInfo).catch(() => {});
      setCacheClearedSuccess(false);
      setAiTestResult(null);
      setUpdateResult(null);
    }
  }, [preferences, isOpen]);

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
      if (localPrefs.geminiApiKey) {
        await onSavePreferences({ geminiApiKey: localPrefs.geminiApiKey, aiMatchingEnabled: true });
      }
      const res = await fetch('/api/settings/ai-test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setAiTestResult({ success: false, passedCount: 0, totalCount: 0, error: data.error || 'AI test failed' });
      } else {
        setAiTestResult({ success: data.success, passedCount: data.passedCount, totalCount: data.totalCount });
      }
    } catch (err: any) {
      setAiTestResult({ success: false, passedCount: 0, totalCount: 0, error: err.message });
    } finally {
      setTestingAi(false);
    }
  };

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

          {/* Section: Promotional Deals & Multibuys */}
          <div className="space-y-3">
            <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Promotions & Multibuy Deals</span>
            </h4>

            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Include Multibuy & Loyalty Card Pricing (Clubcard / Nectar / Deals)
                </span>
                <span className="text-[11px] text-slate-500">
                  When enabled, calculates multibuy bundle savings and loyalty prices. When disabled, compares raw base prices strictly.
                </span>
              </div>
              <input
                type="checkbox"
                checked={localPrefs.includeDeals ?? true}
                onChange={e => setLocalPrefs({ ...localPrefs, includeDeals: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
            </label>
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

          {/* Section: Direct Store Lookups */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase text-slate-400 tracking-wider flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-500" />
                <span>Direct Store Lookups</span>
              </h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
                Tier 1 Direct (90% trust)
              </span>
            </div>

            {/* Master Toggle */}
            <label className="flex items-start space-x-3 p-3.5 rounded-xl border border-blue-200/60 dark:border-blue-800/40 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer transition">
              <input
                type="checkbox"
                checked={localPrefs.directScrapersEnabled ?? true}
                onChange={e => setLocalPrefs({ ...localPrefs, directScrapersEnabled: e.target.checked })}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <span>Enable Direct Store Adapters (Master Switch)</span>
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Query supermarket backends directly for high-confidence pricing (90%). When disabled or if an adapter is offline, requests gracefully fall back to aggregator (60%) or catalog benchmark (40%).
                </p>
              </div>
            </label>

            {/* Per-Store Adapter Rows */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block px-1">
                Per-Store Adapters & Live Status
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'tesco', name: 'Tesco', supported: true },
                  { id: 'sainsburys', name: "Sainsbury's", supported: true },
                  { id: 'asda', name: 'Asda', supported: true },
                  { id: 'morrisons', name: 'Morrisons', supported: true },
                  { id: 'iceland', name: 'Iceland', supported: true },
                  { id: 'aldi', name: 'Aldi', supported: false },
                  { id: 'lidl', name: 'Lidl', supported: false },
                ].map(store => {
                  const masterOn = localPrefs.directScrapersEnabled ?? true;
                  const adapterOn = localPrefs.directStoreAdapters?.[store.id] ?? true;
                  const isChecked = masterOn && adapterOn && store.supported;

                  if (!store.supported) {
                    return (
                      <div
                        key={store.id}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 opacity-50 cursor-not-allowed flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            disabled
                            checked={false}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-slate-400 cursor-not-allowed"
                          />
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{store.name}</span>
                        </div>
                        <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 italic text-right">
                          No online grocery — estimated data only
                        </span>
                      </div>
                    );
                  }

                  return (
                    <label
                      key={store.id}
                      className={`p-2.5 rounded-xl border text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-slate-800 dark:text-slate-200'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={adapterOn}
                          disabled={!masterOn}
                          onChange={e => {
                            const current = localPrefs.directStoreAdapters || {
                              tesco: true, sainsburys: true, asda: true, morrisons: true, iceland: true
                            };
                            setLocalPrefs({
                              ...localPrefs,
                              directStoreAdapters: {
                                ...current,
                                [store.id]: e.target.checked
                              }
                            });
                          }}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                        />
                        <span className="text-xs font-bold">{store.name}</span>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        !masterOn
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                          : adapterOn
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      }`}>
                        {!masterOn ? 'Disabled' : adapterOn ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  );
                })}
              </div>
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
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                      Gemini API Key (Optional if configured via ENV):
                    </label>
                    {localPrefs.hasGeminiKey && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center space-x-1">
                        <Check className="w-3 h-3" />
                        <span>Key saved ✓</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    placeholder={localPrefs.hasGeminiKey ? '•••••••••••••••• (Key saved — enter new key to replace)' : 'AIzaSy... (leave blank if configured via ENV)'}
                    value={localPrefs.geminiApiKey || ''}
                    onChange={e => setLocalPrefs({ ...localPrefs, geminiApiKey: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 block">
                    Model: <strong>gemini-2.5-flash</strong> • Write-only (never exposed to browser) • Cached for 72h to minimize API tokens.
                  </span>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-purple-200/50 dark:border-purple-800/40">
                    <button
                      type="button"
                      onClick={handleTestAi}
                      disabled={testingAi}
                      className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${testingAi ? 'animate-spin' : ''}`} />
                      <span>{testingAi ? 'Testing Live AI...' : 'Test AI matching'}</span>
                    </button>
                    {aiTestResult && (
                      <span className={`text-[11px] font-bold ${aiTestResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {aiTestResult.success
                          ? `✅ Passed (${aiTestResult.passedCount}/${aiTestResult.totalCount} fixtures)`
                          : `❌ ${aiTestResult.error || 'Failed'}`}
                      </span>
                    )}
                  </div>
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

          {/* Section 9: About & Image Build Version */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Info className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      About & Container Build Version
                    </span>
                    <span className="text-[11px] text-slate-500">
                      ShoppingWise v{versionInfo?.version || '1.1.0'} • Released {versionInfo?.releaseDate || '2026-08-28'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate}
                  className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  <span>{checkingUpdate ? 'Checking...' : 'Check Updates'}</span>
                </button>
              </div>

              {updateResult && (
                <div className={`p-2 rounded-lg text-xs font-semibold flex items-center justify-between ${
                  updateResult.updateAvailable
                    ? 'bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                }`}>
                  <span>
                    {updateResult.updateAvailable
                      ? `🔔 Update available: v${updateResult.latestVersion} (Run: docker compose pull)`
                      : `✅ Running latest build (v${versionInfo?.version || '1.1.0'})`}
                  </span>
                </div>
              )}

              {/* Build Image Details */}
              <div className="space-y-1.5 pt-1 text-[11px]">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <Layers className="w-3 h-3 text-slate-400" />
                    <span>Client Image:</span>
                  </span>
                  <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-900 text-[10px] font-mono text-slate-800 dark:text-slate-300">
                    {versionInfo?.clientImage || `ghcr.io/knowlesy/shopping-comparison-client:v${versionInfo?.version || '1.1.0'}`}
                  </code>
                </div>

                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <Cpu className="w-3 h-3 text-slate-400" />
                    <span>Logic API Image:</span>
                  </span>
                  <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-900 text-[10px] font-mono text-slate-800 dark:text-slate-300">
                    {versionInfo?.logicApiImage || `ghcr.io/knowlesy/shopping-comparison-logic-api:v${versionInfo?.version || '1.1.0'}`}
                  </code>
                </div>

                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <GitBranch className="w-3 h-3 text-slate-400" />
                    <span>Scraper Pod Image:</span>
                  </span>
                  <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-900 text-[10px] font-mono text-slate-800 dark:text-slate-300">
                    {versionInfo?.scraperPodImage || `ghcr.io/knowlesy/shopping-comparison-scraper-pod:v${versionInfo?.version || '1.1.0'}`}
                  </code>
                </div>
              </div>

              {versionInfo?.imageRepo && (
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                  <a
                    href={versionInfo.imageRepo}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1 font-semibold"
                  >
                    <span>View Container Registry on GitHub</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="text-[10px] text-slate-400">
                    Runtime: {versionInfo?.environment === 'development' ? 'Dev (Vite / Node)' : 'Production Docker Container'}
                  </span>
                </div>
              )}
            </div>
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
