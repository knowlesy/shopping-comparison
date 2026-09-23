import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildPatch, countChanges, draftFrom } from '../src/components/settings/settingsDraft.ts';
import type { UserPreferences } from '../src/types.ts';

const saved: UserPreferences = {
  healthierDefault: true,
  foodRatings: { bread: { wholemeal: 'love' }, eggs: { free_range: 'love' } },
  diet: [],
  preferOrganic: false,
  brandTierPriority: 'standard',
  packSizingPolicy: 'closest',
  enabledSupermarkets: ['tesco', 'asda'],
  aiStages: { interpret: true, query: false, select: true },
  hasGeminiKey: true,
};

describe('settings draft', () => {
  it('starts with no changes and a blank key field', () => {
    const draft = draftFrom(saved);
    assert.equal(draft.geminiApiKey, '');
    assert.equal(countChanges(saved, draft), 0);
    assert.deepEqual(buildPatch(saved, draft), {});
  });

  it('counts each rating, diet and store that moved', () => {
    const draft: UserPreferences = {
      ...draftFrom(saved),
      foodRatings: { bread: { wholemeal: 'love', white: 'never' }, milk: { semi: 'love' } },
      diet: ['vegetarian'],
      enabledSupermarkets: ['asda', 'tesco', 'aldi'],
    };
    // bread.white, milk.semi, eggs.free_range removed; one diet; one store.
    assert.equal(countChanges(saved, draft), 5);
  });

  it('ignores order in lists and treats a missing rating as OK', () => {
    const draft = { ...draftFrom(saved), enabledSupermarkets: ['asda', 'tesco'] as UserPreferences['enabledSupermarkets'] };
    assert.equal(countChanges(saved, draft), 0);
  });

  it('sends only the changed fields, each whole', () => {
    const draft = { ...draftFrom(saved), foodRatings: { bread: { wholemeal: 'love' as const } }, preferOrganic: true, geminiApiKey: 'AIza-new' };
    assert.deepEqual(buildPatch(saved, draft), {
      foodRatings: { bread: { wholemeal: 'love' } },
      preferOrganic: true,
      geminiApiKey: 'AIza-new',
    });
  });
});
