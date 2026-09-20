import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AiDecisionReviewer } from '../services/aiDecisionReviewer.js';
import {
  aiConfiguredExternally,
  buildDefaults,
  loadPersisted,
  persist,
  toSafeSettings,
  validatePatch
} from '../services/settingsStore.js';
import { KNOWN_DIRECT_STORES as SHARED_DIRECT_STORES } from '../services/supermarkets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const settingsRouter = express.Router();

/** Re-exported for callers that validated store names against this route. */
export const KNOWN_DIRECT_STORES = [...SHARED_DIRECT_STORES];

const isAiConfiguredExternally = aiConfiguredExternally();

/**
 * Start from the schema defaults, then apply whatever survived validation on disk.
 * The environment still wins for AI configuration, because a key or flag present in
 * the container is a statement about this deployment, not a stale household choice.
 */
function initialSettings() {
  const defaults = buildDefaults();
  const loaded = loadPersisted();

  if (loaded.rejected.length > 0) {
    for (const { field, reason } of loaded.rejected) {
      console.warn(`[Settings] Ignoring persisted ${field}: ${reason}. Using default.`);
    }
  }

  const merged = { ...defaults, ...loaded.values };
  if (isAiConfiguredExternally) {
    merged.aiMatchingEnabled = true;
  }

  if (loaded.existed) {
    console.log(`[Settings] Loaded household settings from ${loaded.file}`);
  }
  return merged;
}

let userSettings = initialSettings();

export function getUserSettings() {
  return userSettings;
}

export function getSafeUserSettings() {
  return toSafeSettings(userSettings);
}

/** Test seam: restore the in-memory state from disk without restarting the process. */
export function reloadSettingsFromDisk() {
  userSettings = initialSettings();
  return userSettings;
}

settingsRouter.get('/', (req, res) => {
  res.json(getSafeUserSettings());
});

/**
 * PUT /api/settings
 *
 * Merge semantics: this is a patch, not a replacement. Keys absent from the body keep
 * their current value; `directStoreAdapters` and `aiStages` merge key-by-key so a
 * client can flip one store without having to resend the rest. Unknown keys are
 * ignored rather than rejected, so an older client sending an extra field still saves.
 *
 * Nothing is applied unless everything validates, and nothing is reported as saved
 * unless it reached disk.
 */
settingsRouter.put('/', (req, res) => {
  const validation = validatePatch(req.body, userSettings);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error, field: validation.field });
  }

  const candidate = { ...userSettings, ...validation.patch };

  try {
    persist(candidate);
  } catch (err) {
    // The caller must be able to tell a refused save from a successful one, so this
    // is an error response and the in-memory state is left untouched.
    console.error(`[Settings] Could not persist settings: ${err.message}`);
    return res.status(500).json({
      error: `Settings were not saved: ${err.message}`,
      persisted: false
    });
  }

  userSettings = candidate;
  res.json(getSafeUserSettings());
});

settingsRouter.post('/ai-test', async (_req, res) => {
  try {
    if (!AiDecisionReviewer.isEnabled(userSettings)) {
      return res.status(400).json({
        success: false,
        error: 'AI matching is not enabled or no Gemini API key is configured.'
      });
    }

    const fixturesPath = path.resolve(__dirname, '../../../../tests/fixtures/ai-matching-fixtures.json');
    let fixtures = [];
    if (fs.existsSync(fixturesPath)) {
      fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
    }

    const testFixtures = fixtures.slice(0, 3);
    let passedCount = 0;
    const testResults = [];

    for (const fixture of testFixtures) {
      const scoredCandidates = fixture.candidates.map((prod) => ({
        product: prod,
        score: 50,
        packs: 1,
        totalPrice: prod.price
      }));

      const reviewed = await AiDecisionReviewer.reviewCandidates(
        fixture.query,
        fixture.item,
        scoredCandidates,
        { aiMatchingEnabled: true }
      );

      const targetExpected = fixture.expectedPick || fixture.expected;
      const chosenId = reviewed?.product?.id || reviewed?.id || null;
      const isMatch = chosenId === targetExpected;
      if (isMatch) passedCount++;

      testResults.push({
        query: fixture.query,
        expected: targetExpected,
        chosen: chosenId,
        passed: isMatch,
        reasoning: reviewed?.aiReasoning || 'AI Reviewer decision'
      });
    }

    res.json({
      success: passedCount === testFixtures.length,
      passedCount,
      totalCount: testFixtures.length,
      results: testResults
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
