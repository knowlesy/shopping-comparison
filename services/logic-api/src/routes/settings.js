import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AiDecisionReviewer } from '../services/aiDecisionReviewer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const settingsRouter = express.Router();

const isAiConfiguredExternally = Boolean(
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.ENABLE_GEMINI_MATCHING === 'true'
);

let userSettings = {
  healthierDefault: true,
  fatPercentagePreference: 5,
  preferWholewheat: true,
  preferFreeRange: true,
  preferOrganic: false,
  cutMatchingStrategy: 'best_value',
  brandTierPriority: 'standard',
  packSizingPolicy: 'closest',
  includeDeals: true,
  enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'],
  enablePastSearches: true,
  aiMatchingEnabled: process.env.ENABLE_GEMINI_MATCHING === 'true' || isAiConfiguredExternally,
  aiMatchingExternallyConfigured: isAiConfiguredExternally,
  geminiApiKey: ''
};

export function getUserSettings() {
  return userSettings;
}

export function getSafeUserSettings() {
  const { geminiApiKey, ...safe } = userSettings;
  const hasKey = Boolean(geminiApiKey && geminiApiKey.trim().length > 0) || isAiConfiguredExternally;
  return {
    ...safe,
    hasGeminiKey: hasKey,
    aiMatchingExternallyConfigured: isAiConfiguredExternally
  };
}

settingsRouter.get('/', (req, res) => {
  res.json(getSafeUserSettings());
});

settingsRouter.put('/', (req, res) => {
  const allowedKeys = [
    'healthierDefault',
    'fatPercentagePreference',
    'preferWholewheat',
    'preferFreeRange',
    'preferOrganic',
    'cutMatchingStrategy',
    'brandTierPriority',
    'packSizingPolicy',
    'includeDeals',
    'enabledSupermarkets',
    'devMode',
    'enablePastSearches',
    'aiMatchingEnabled',
    'geminiApiKey'
  ];

  const sanitized = {};
  for (const key of allowedKeys) {
    if (req.body && req.body[key] !== undefined) {
      if (key === 'geminiApiKey') {
        sanitized[key] = typeof req.body[key] === 'string' ? req.body[key].trim() : '';
      } else {
        sanitized[key] = req.body[key];
      }
    }
  }

  userSettings = { ...userSettings, ...sanitized };
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
