import React, { useId } from 'react';

/** Shared focus treatment: visible for keyboard users, absent for mouse clicks. */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900';

/** The same ring, drawn on a styled sibling of a visually hidden input. */
export const PEER_FOCUS_RING =
  'peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-slate-900';

interface SettingsCardProps {
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({ title, description, icon, actions, children }) => {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {icon && <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>}
          <div className="min-w-0">
            <h3 id={headingId} className="text-sm font-extrabold text-slate-900 dark:text-white">
              {title}
            </h3>
            {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
};

interface ToggleRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  badge?: React.ReactNode;
}

/** A labelled checkbox. The whole row is the click target. */
export const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, checked, onChange, disabled, badge }) => (
  <label
    className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition ${
      checked
        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'
    } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span className="min-w-0">
      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex flex-wrap items-center gap-1.5">
        {label}
        {badge}
      </span>
      {description && (
        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">{description}</span>
      )}
    </span>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className={`mt-0.5 w-4 h-4 shrink-0 rounded border-slate-300 text-emerald-600 accent-emerald-600 ${FOCUS_RING}`}
    />
  </label>
);

export interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface OptionGroupProps<T extends string> {
  label: string;
  hideLabel?: boolean;
  name: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Tailwind grid classes for the option layout. */
  columns?: string;
}

/**
 * One choice from several, as a radiogroup of cards. Native radios keep arrow-key
 * movement within the group and a single tab stop.
 */
export function OptionGroup<T extends string>({
  label,
  hideLabel,
  name,
  options,
  value,
  onChange,
  columns = 'grid-cols-1 sm:grid-cols-3',
}: OptionGroupProps<T>) {
  const labelId = useId();
  return (
    <div className="space-y-1.5">
      <span id={labelId} className={hideLabel ? 'sr-only' : 'text-[11px] font-bold text-slate-600 dark:text-slate-400 block'}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={`grid gap-2 ${columns}`}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <label key={opt.value} className="relative cursor-pointer">
              <input
                type="radio"
                name={name}
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="peer sr-only"
              />
              <span
                className={`block h-full p-3 rounded-xl border text-left transition ${PEER_FOCUS_RING} ${
                  selected
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <strong className="text-xs text-slate-900 dark:text-white block">{opt.label}</strong>
                {opt.description && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1 leading-snug">{opt.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Small text button used for per-block actions like Reset. */
export const LinkButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', ...props }) => (
  <button
    type="button"
    {...props}
    className={`text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed rounded ${FOCUS_RING} ${className}`}
  />
);
