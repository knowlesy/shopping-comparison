import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PenaltyRules } from './penaltyRules.js';
import { FuzzyMatcher } from './fuzzyMatcher.js';
import { KeywordExtractor } from './keywordExtractor.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const SYNTHETIC = path.join(ROOT, 'tests/fixtures/matching-boundaries.synthetic.json');

/**
 * Boundary coverage for the hard variety and composition rules.
 *
 * The cases are read from tests/fixtures/matching-boundaries.synthetic.json, which is hand-written
 * and labelled synthetic. Every rule is pinned from both sides: the product it must refuse and a
 * neighbouring product it must still accept, so a rule cannot be widened into a blunt instrument
 * without a test failing. Production code holds no expected-product table.
 */
describe('PenaltyRules.checkEligibility — variety and composition boundaries', () => {
  const set = JSON.parse(fs.readFileSync(SYNTHETIC, 'utf8'));
  assert.equal(set.synthetic, true, 'this corpus must stay labelled as synthetic');

  for (const testCase of set.cases) {
    it(`${testCase.id}: ${testCase.expect}s "${testCase.candidate.title}" for "${testCase.query}"`, () => {
      const keywords = KeywordExtractor.extractKeywords(testCase.item);
      const { eligible, reason } = PenaltyRules.checkEligibility(
        testCase.candidate,
        testCase.item,
        keywords,
        {}
      );
      assert.equal(
        eligible,
        testCase.expect === 'accept',
        `${testCase.why}${reason ? ` (rule fired: ${reason})` : ''}`
      );
      if (testCase.expect === 'refuse') {
        assert.equal(reason, testCase.rule, 'the refusal must come from the rule under test');
      }
    });
  }

  it('an ineligible blend is not merely outranked — the matcher never returns it', () => {
    const item = { name: 'Basmati rice', baseItem: 'Basmati rice', category: 'pantry', targetQuantity: 1, unit: 'kg' };
    const candidates = [
      { id: 'blend', supermarket: 'tesco', title: 'Own Brand Basmati & Quinoa Rice 250g', price: 0.10, packageSize: 250, packageUnit: 'g', source: 'direct' },
      { id: 'plain', supermarket: 'tesco', title: 'Own Brand Basmati Rice 1Kg', price: 1.79, packageSize: 1, packageUnit: 'kg', source: 'direct' }
    ];

    const match = FuzzyMatcher.matchProduct('tesco', item, candidates, {});
    assert.equal(match.product?.id, 'plain', 'the far cheaper blend must not win on price');
  });

  it('with only the blend on the shelf the matcher declines rather than substituting it', () => {
    const item = { name: 'Basmati rice', baseItem: 'Basmati rice', category: 'pantry', targetQuantity: 1, unit: 'kg' };
    const candidates = [
      { id: 'blend', supermarket: 'tesco', title: 'Own Brand Basmati & Quinoa Rice 250g', price: 0.10, packageSize: 250, packageUnit: 'g', source: 'direct' }
    ];

    const match = FuzzyMatcher.matchProduct('tesco', item, candidates, {});
    assert.equal(match.product, null, 'an honest no-match beats a wrong product');
  });
});
