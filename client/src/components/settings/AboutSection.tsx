import React from 'react';
import { Cpu, ExternalLink, GitBranch, Info, Layers, RefreshCw } from 'lucide-react';
import type { SystemVersionInfo } from '../../types';
import { FOCUS_RING, SettingsCard } from './controls';

// Shown instead of a version-derived guess when the deployment does not state its
// image references. Verified identity comes from scripts/deploy/verify-images.mjs.
const UNREPORTED_IMAGE = 'not reported by this deployment';

export interface AboutState {
  versionInfo: SystemVersionInfo | null;
  checking: boolean;
  updateResult: { updateAvailable: boolean; latestVersion: string } | null;
  onCheck: () => void;
}

export const AboutSection: React.FC<{ about: AboutState }> = ({ about }) => {
  const { versionInfo, checking, updateResult, onCheck } = about;
  // Shown only when the deployment reports them; synthesising these from the app
  // version would claim an image identity nothing had verified.
  const images = [
    { label: 'Client image', value: versionInfo?.clientImage, icon: Layers },
    { label: 'Logic API image', value: versionInfo?.logicApiImage, icon: Cpu },
    { label: 'Scraper pod image', value: versionInfo?.scraperPodImage, icon: GitBranch },
    { label: 'Store fetcher image', value: versionInfo?.storeFetcherImage, icon: GitBranch },
  ];

  return (
    <SettingsCard
      title="About & version"
      icon={<Info className="w-4 h-4 text-indigo-500" />}
      description={`ShoppingWise v${versionInfo?.version || '…'}${versionInfo?.releaseDate ? ` · released ${versionInfo.releaseDate}` : ''}`}
      actions={
        <button
          type="button"
          onClick={onCheck}
          disabled={checking}
          className={`px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50 ${FOCUS_RING}`}
        >
          <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
      }
    >
      {updateResult && (
        <div
          role="status"
          className={`p-2 rounded-lg text-xs font-semibold border ${
            updateResult.updateAvailable
              ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          {updateResult.updateAvailable
            ? `Update available: v${updateResult.latestVersion} (run: docker compose pull)`
            : `Running the latest build (v${versionInfo?.version || updateResult.latestVersion})`}
        </div>
      )}

      <dl className="space-y-1.5 text-[11px]">
        {images.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-slate-600 dark:text-slate-400">
            <dt className="inline-flex items-center gap-1">
              <Icon className="w-3 h-3" aria-hidden="true" />
              {label}
            </dt>
            <dd>
              <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-800 dark:text-slate-300 break-all">
                {value || UNREPORTED_IMAGE}
              </code>
            </dd>
          </div>
        ))}
      </dl>

      {versionInfo?.imageRepo && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <a
            href={versionInfo.imageRepo}
            target="_blank"
            rel="noreferrer"
            className={`text-[11px] text-indigo-700 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 font-semibold rounded ${FOCUS_RING}`}
          >
            View container registry on GitHub
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            Runtime: {versionInfo.environment === 'development' ? 'Dev (Vite / Node)' : 'Production Docker container'}
          </span>
        </div>
      )}
    </SettingsCard>
  );
};
