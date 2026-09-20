/**
 * Validated, persistent household settings.
 *
 * The server is the only owner of settings. This module holds the schema (defaults,
 * types and validators in one place), validates every incoming change before anything
 * is applied, and persists the non-secret subset under DATA_DIR so a restart does not
 * silently reset the household's preferences.
 *
 * Two rules shape the design:
 *
 *   1. **No partial writes.** A PUT is validated in full first. If any field is
 *      invalid the request is rejected and nothing changes — a half-applied settings
 *      object is worse than a rejected one.
 *   2. **Secrets are never persisted.** `geminiApiKey` is deliberately absent from the
 *      persisted allowlist. A key typed into the UI lives in server memory only and is
 *      gone on restart; a key that must survive restart belongs in the environment or
 *      a k3s Secret.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  DEFAULT_ENABLED_SUPERMARKETS,
  KNOWN_DIRECT_STORES,
  KNOWN_SUPERMARKETS,
  normalizeSupermarketName,
  unknownSupermarkets
} from './supermarkets.js';

const AI_ASSIST_LEVELS = ['off', 'economy', 'balanced', 'thorough'];
const AI_STAGES = ['interpret', 'query', 'select'];
const CUT_STRATEGIES = ['best_value', 'strict_cut'];
const BRAND_TIERS = ['value', 'standard', 'premium', 'branded'];
const PACK_POLICIES = ['closest', 'cover', 'cheapest_per_unit'];

const isBoolean = (v) => (typeof v === 'boolean' ? null : 'must be a boolean');

const isEnum = (allowed) => (v) =>
  allowed.includes(v) ? null : `must be one of: ${allowed.join(', ')}`;

/** Rejects NaN and Infinity as well as out-of-range values. */
const isBoundedNumber = (min, max, { integer = false } = {}) => (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'must be a finite number';
  if (integer && !Number.isInteger(v)) return 'must be a whole number';
  if (v < min || v > max) return `must be between ${min} and ${max}`;
  return null;
};

const isEnabledSupermarkets = (v) => {
  if (!Array.isArray(v)) return 'must be an array of supermarket names';
  if (v.length === 0) return 'must enable at least one supermarket';
  const unknown = unknownSupermarkets(v);
  if (unknown.length > 0) {
    return `contains unknown supermarket(s): ${unknown.join(', ')}. Known: ${KNOWN_SUPERMARKETS.join(', ')}`;
  }
  return null;
};

/**
 * Validators normally return a suffix, composed as `<field> <suffix>`. A message that
 * reads better on its own is returned with a leading "!" and used verbatim — that is
 * how the established "Unknown store in X: y" wording is preserved.
 */
const VERBATIM = '!';

const isBooleanMapOver = (allowedKeys, field, label) => (v) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'must be an object';
  for (const [key, value] of Object.entries(v)) {
    if (!allowedKeys.includes(key)) {
      return `${VERBATIM}Unknown ${label} in ${field}: ${key}`;
    }
    if (typeof value !== 'boolean') return `${VERBATIM}${field}.${key} must be a boolean`;
  }
  return null;
};

/** Compose a validator's return value into the error the caller sees. */
function composeError(field, problem) {
  return problem.startsWith(VERBATIM) ? problem.slice(VERBATIM.length) : `${field} ${problem}`;
}

const isOptionalString = (maxLength) => (v) => {
  if (typeof v !== 'string') return 'must be a string';
  if (v.length > maxLength) return `must be at most ${maxLength} characters`;
  return null;
};

/**
 * One entry per setting.
 *
 * `persisted: false` marks a value that must not reach disk (a secret) or that is
 * derived from the environment at start-up and so must not be frozen into a file.
 * `merge` handles the nested objects, where a partial update patches keys rather than
 * replacing the whole object.
 */
export const SETTINGS_SCHEMA = {
  healthierDefault: { default: true, validate: isBoolean, persisted: true },
  fatPercentagePreference: { default: 5, validate: isBoundedNumber(0, 100), persisted: true },
  preferWholewheat: { default: true, validate: isBoolean, persisted: true },
  preferFreeRange: { default: true, validate: isBoolean, persisted: true },
  preferOrganic: { default: false, validate: isBoolean, persisted: true },
  cutMatchingStrategy: { default: 'strict_cut', validate: isEnum(CUT_STRATEGIES), persisted: true },
  brandTierPriority: { default: 'standard', validate: isEnum(BRAND_TIERS), persisted: true },
  packSizingPolicy: { default: 'closest', validate: isEnum(PACK_POLICIES), persisted: true },
  includeDeals: { default: true, validate: isBoolean, persisted: true },
  enabledSupermarkets: {
    default: [...DEFAULT_ENABLED_SUPERMARKETS],
    validate: isEnabledSupermarkets,
    persisted: true,
    coerce: (v) => v.map(normalizeSupermarketName)
  },
  devMode: { default: false, validate: isBoolean, persisted: true },
  enablePastSearches: { default: true, validate: isBoolean, persisted: true },
  directScrapersEnabled: { default: true, validate: isBoolean, persisted: true },
  directStoreAdapters: {
    default: Object.fromEntries(KNOWN_DIRECT_STORES.map((s) => [s, true])),
    validate: isBooleanMapOver([...KNOWN_DIRECT_STORES], 'directStoreAdapters', 'store'),
    persisted: true,
    merge: true
  },
  allowMixedPackSizes: { default: false, validate: isBoolean, persisted: true },
  aiMatchingEnabled: {
    default: false,
    validate: isBoolean,
    persisted: true,
    envDefault: () => aiConfiguredExternally()
  },
  aiAssistLevel: { default: 'balanced', validate: isEnum(AI_ASSIST_LEVELS), persisted: true },
  aiMaxCallsPerBasket: {
    default: 25,
    validate: isBoundedNumber(0, 500, { integer: true }),
    persisted: true
  },
  aiStages: {
    default: { interpret: true, query: false, select: true },
    validate: isBooleanMapOver([...AI_STAGES], 'aiStages', 'stage'),
    persisted: true,
    merge: true
  },
  enableMatchLog: {
    default: false,
    validate: isBoolean,
    persisted: true,
    envDefault: () => process.env.ENABLE_MATCH_LOG === 'true'
  },
  // Secret: server memory only, never written to disk, never returned to a browser.
  geminiApiKey: {
    default: '',
    validate: isOptionalString(512),
    persisted: false,
    coerce: (v) => v.trim()
  }
};

export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMA);
export const PERSISTED_KEYS = SETTINGS_KEYS.filter((k) => SETTINGS_SCHEMA[k].persisted);

export function aiConfiguredExternally() {
  return Boolean(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.ENABLE_GEMINI_MATCHING === 'true'
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same default as priceCache/priceHistory/matchLog: the service's own runtime data
// directory, never the repository's tracked `data/` (which holds the catalog).
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data');

function settingsFilePath() {
  const dataDir = process.env.DATA_DIR || DEFAULT_DATA_DIR;
  return path.join(dataDir, 'settings.json');
}

export function buildDefaults() {
  const out = {};
  for (const [key, spec] of Object.entries(SETTINGS_SCHEMA)) {
    const base = spec.envDefault ? spec.envDefault() : spec.default;
    out[key] = Array.isArray(base) ? [...base] : base && typeof base === 'object' ? { ...base } : base;
  }
  return out;
}

/**
 * Validate a patch against the schema.
 *
 * @returns {{ok: true, patch: object} | {ok: false, error: string, field: string}}
 */
export function validatePatch(patch, current) {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { ok: false, field: null, error: 'Request body must be a settings object' };
  }

  const accepted = {};
  for (const [key, rawValue] of Object.entries(patch)) {
    if (rawValue === undefined) continue;
    const spec = SETTINGS_SCHEMA[key];
    if (!spec) continue; // Unknown keys are ignored, not an error: older clients send extras.

    const problem = spec.validate(rawValue);
    if (problem) {
      return { ok: false, field: key, error: composeError(key, problem) };
    }

    let value = spec.coerce ? spec.coerce(rawValue) : rawValue;
    if (spec.merge) {
      value = { ...(current?.[key] || spec.default), ...value };
    }
    accepted[key] = value;
  }

  return { ok: true, patch: accepted };
}

/**
 * Read persisted settings, validating each value with the same rules as a live PUT.
 *
 * A corrupt or hand-edited file must not stop the service starting, and a single bad
 * value must not discard the rest, so invalid entries fall back to their default and
 * are reported rather than thrown.
 */
export function loadPersisted() {
  const file = settingsFilePath();
  const result = { values: {}, rejected: [], file, existed: false };

  let parsed;
  try {
    if (!fs.existsSync(file)) return result;
    result.existed = true;
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    result.rejected.push({ field: '(file)', reason: `unreadable: ${err.message}` });
    return result;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    result.rejected.push({ field: '(file)', reason: 'not a settings object' });
    return result;
  }

  for (const key of PERSISTED_KEYS) {
    if (!(key in parsed)) continue;
    const spec = SETTINGS_SCHEMA[key];
    const problem = spec.validate(parsed[key]);
    if (problem) {
      result.rejected.push({ field: key, reason: composeError(key, problem) });
      continue;
    }
    result.values[key] = spec.coerce ? spec.coerce(parsed[key]) : parsed[key];
  }

  return result;
}

/**
 * Write the persisted subset atomically.
 *
 * Written to a temp file in the same directory and renamed, so a crash or a full disk
 * leaves the previous good file in place rather than a truncated one. Throws on
 * failure: the caller must be able to tell the user the save did not happen.
 */
export function persist(settings) {
  const file = settingsFilePath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  const subset = {};
  for (const key of PERSISTED_KEYS) {
    if (settings[key] !== undefined) subset[key] = settings[key];
  }

  const tmp = path.join(dir, `.settings.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(subset, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      // best effort
    }
    throw err;
  }
  return file;
}

/** Strip the secret and add the derived fields a browser is allowed to see. */
export function toSafeSettings(settings) {
  const { geminiApiKey, ...safe } = settings;
  const externallyConfigured = aiConfiguredExternally();
  const hasRuntimeKey = Boolean(geminiApiKey && geminiApiKey.trim().length > 0);

  return {
    ...safe,
    hasGeminiKey: hasRuntimeKey || externallyConfigured,
    aiMatchingExternallyConfigured: externallyConfigured,
    // Where the key came from, and how long it lasts, stated rather than implied.
    geminiKeySource: externallyConfigured ? 'environment' : hasRuntimeKey ? 'runtime' : 'none',
    geminiKeyLifetime: hasRuntimeKey && !externallyConfigured
      ? 'server-memory-only: this key is not persisted and is lost when the API restarts'
      : externallyConfigured
        ? 'environment: persists across restarts'
        : 'none configured'
  };
}

/** Exposed for tests that need a throwaway DATA_DIR. */
export function makeTempDataDir(prefix = 'shoppingwise-settings-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
