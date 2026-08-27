import React, { useState, useEffect } from 'react';
import { X, Sparkles, Terminal, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  const [content, setContent] = useState<string>('');
  const [version, setVersion] = useState<string>('1.1.0');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api.getChangelog().then((res) => {
        setContent(res.content);
        setVersion(res.version);
      }).catch(() => {
        setContent('# TrolleyWise v1.1.0\n\n- Multibuy & Deal Price Parsing\n- 72-Hour Search Pinning\n- Hybrid Gemini AI Fallback\n- 24h Update Notifier');
      }).finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const pullCommand = 'docker compose pull && docker compose up -d';

  const handleCopy = () => {
    navigator.clipboard.writeText(pullCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-700 dark:text-purple-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center space-x-2">
                <span>TrolleyWise Release Notes & Changelog</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                  v{version}
                </span>
              </h3>
              <p className="text-xs text-slate-500">Container updates, new features, and changelog history</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pull Instructions Box */}
        <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center space-x-1.5 text-emerald-400">
              <Terminal className="w-3.5 h-3.5" />
              <span>Pull Latest Docker Image</span>
            </span>
            <button
              onClick={handleCopy}
              className="text-[11px] font-bold text-slate-400 hover:text-white flex items-center space-x-1 transition"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Command</span>
                </>
              )}
            </button>
          </div>
          <code className="text-xs font-mono bg-black/50 p-2 rounded-xl block text-slate-300 select-all overflow-x-auto">
            {pullCommand}
          </code>
        </div>

        {/* Markdown Content Box */}
        <div className="max-h-72 overflow-y-auto pr-1 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-sans bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
          {loading ? (
            <div className="flex items-center justify-center py-8 space-x-2 text-slate-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading release notes...</span>
            </div>
          ) : (
            content || 'No release notes available.'
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <a
            href="https://github.com/knowlesy/shopping-comparison/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-purple-600 dark:text-purple-400 font-semibold hover:underline flex items-center space-x-1"
          >
            <span>View on GitHub Releases</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
