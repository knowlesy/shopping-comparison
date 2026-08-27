import express from 'express';

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
  enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'],
  enablePastSearches: true,
  aiMatchingEnabled: process.env.ENABLE_GEMINI_MATCHING === 'true' || isAiConfiguredExternally,
  aiMatchingExternallyConfigured: isAiConfiguredExternally,
  geminiApiKey: ''
};

export function getUserSettings() {
  return userSettings;
}

settingsRouter.get('/', (req, res) => {
  res.json({
    ...userSettings,
    aiMatchingExternallyConfigured: isAiConfiguredExternally
  });
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
    'enabledSupermarkets',
    'devMode',
    'enablePastSearches',
    'aiMatchingEnabled',
    'geminiApiKey'
  ];

  const sanitized = {};
  for (const key of allowedKeys) {
    if (req.body && req.body[key] !== undefined) {
      sanitized[key] = req.body[key];
    }
  }

  userSettings = { ...userSettings, ...sanitized };
  res.json({
    ...userSettings,
    aiMatchingExternallyConfigured: isAiConfiguredExternally
  });
});
