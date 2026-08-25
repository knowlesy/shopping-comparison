import express from 'express';

export const settingsRouter = express.Router();

let userSettings = {
  healthierDefault: true,
  fatPercentagePreference: 5,
  preferWholewheat: true,
  preferFreeRange: true,
  preferOrganic: false,
  cutMatchingStrategy: 'best_value',
  brandTierPriority: 'standard',
  packSizingPolicy: 'closest',
  enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl']
};

export function getUserSettings() {
  return userSettings;
}

settingsRouter.get('/', (req, res) => {
  res.json(userSettings);
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
    'devMode'
  ];

  const sanitized = {};
  for (const key of allowedKeys) {
    if (req.body && req.body[key] !== undefined) {
      sanitized[key] = req.body[key];
    }
  }

  userSettings = { ...userSettings, ...sanitized };
  res.json(userSettings);
});
