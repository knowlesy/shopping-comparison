import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { FuzzyMatcher } from './fuzzyMatcher.js';
import { IngredientParser } from './ingredientParser.js';
import { PenaltyRules, SCORE_FLOOR } from './penaltyRules.js';
import { ONLY_NEVER_REASON } from '../../../../shared/foodTypes.js';

/**
 * The generic Love / OK / Never rule. Candidates within a test share price and pack size,
 * so the rating is the only thing that can separate them.
 */
const product = (id, title, extra = {}) => ({
  id,
  supermarket: 'tesco',
  title,
  price: 1.1,
  packageSize: 800,
  packageUnit: 'g',
  category: 'bakery',
  inStock: true,
  ...extra
});

const WHITE = product('white', 'Tesco Medium Sliced White Bread 800g');
const WHOLEMEAL = product('wholemeal', 'Tesco Wholemeal Medium Sliced Bread 800g');
const SEEDED = product('seeded', 'Kingsmill Multi-Seed Bread 800g');

const bread = () => IngredientParser.parseItem('Bread 1 loaf');
const pick = (item, candidates, foodRatings, extra = {}) =>
  FuzzyMatcher.matchProduct('tesco', item, candidates, { foodRatings, ...extra });

describe('Food ratings in scoring', () => {
  it('Love beats OK at the same price, whichever type is loved', () => {
    assert.equal(pick(bread(), [WHITE, WHOLEMEAL], { bread: { wholemeal: 'love' } }).product.id, 'wholemeal');
    assert.equal(pick(bread(), [WHITE, WHOLEMEAL], { bread: { white: 'love' } }).product.id, 'white');
  });

  it('adds exactly the Love bonus and nothing for OK', () => {
    const item = bread();
    const keywords = FuzzyMatcher.extractKeywords(item);
    const ok = PenaltyRules.scoreCandidate(WHOLEMEAL, item, keywords, { foodRatings: {} });
    const love = PenaltyRules.scoreCandidate(WHOLEMEAL, item, keywords, { foodRatings: { bread: { wholemeal: 'love' } } });
    assert.equal(love.score - ok.score, 40);
    assert.deepEqual(ok.foodRatings, [{ categoryId: 'bread', typeId: 'wholemeal', rating: 'ok' }]);
  });

  it('Never loses to an OK option even when the Never one is cheaper', () => {
    const cheapWhite = { ...WHITE, price: 0.5 };
    const match = pick(bread(), [cheapWhite, SEEDED], { bread: { white: 'never' } });
    assert.equal(match.product.id, 'seeded');
    assert.notEqual(match.reasonCode, ONLY_NEVER_REASON);
  });

  it('Never is a penalty, not a filter: the only option is still returned', () => {
    const item = bread();
    const match = pick(item, [WHITE], { bread: { white: 'never' } });
    assert.equal(match.product?.id, 'white', 'a store with only a Never type still returns it');
    assert.ok(match.matchScore >= SCORE_FLOOR);

    PenaltyRules.annotateFoodRating(match, item, { foodRatings: { bread: { white: 'never' } } });
    assert.equal(match.reasonCode, ONLY_NEVER_REASON);
    assert.deepEqual(match.foodRating, { categoryId: 'bread', typeId: 'white', rating: 'never' });
  });

  it('does not claim "only" when an acceptable non-Never option was passed over', () => {
    const item = bread();
    const prefs = { foodRatings: { bread: { white: 'never' } } };
    const match = {
      product: WHITE,
      scoredCandidates: [
        { product: WHITE, score: 25.1, eligible: true },
        { product: SEEDED, score: 90, eligible: true }
      ]
    };
    PenaltyRules.annotateFoodRating(match, item, prefs);
    assert.equal(match.foodRating.rating, 'never');
    assert.equal(match.reasonCode, undefined);
  });

  it('clears a stale flag when the chosen product changes', () => {
    const item = bread();
    const match = { product: WHOLEMEAL, reasonCode: ONLY_NEVER_REASON, foodRating: { rating: 'never' } };
    PenaltyRules.annotateFoodRating(match, item, { foodRatings: { bread: { white: 'never' } } });
    assert.equal(match.reasonCode, undefined);
    assert.equal(match.foodRating.rating, 'ok');
  });

  it('keeps Never types ordered among themselves', () => {
    const item = IngredientParser.parseItem('500g beef mince');
    const keywords = FuzzyMatcher.extractKeywords(item);
    const never = { foodRatings: { mince: { fat20: 'never' } } };
    const exact = product('exact', 'Tesco Beef Mince 20% Fat 500g', { packageSize: 500, category: 'meat' });
    const small = product('small', 'Tesco Beef Mince 20% Fat 250g', { packageSize: 250, category: 'meat' });
    const okExact = PenaltyRules.scoreCandidate(exact, item, keywords, {}).score;
    const okSmall = PenaltyRules.scoreCandidate(small, item, keywords, {}).score;
    assert.ok(okExact > okSmall, 'precondition: the exact pack fits better');

    const neverExact = PenaltyRules.scoreCandidate(exact, item, keywords, never).score;
    const neverSmall = PenaltyRules.scoreCandidate(small, item, keywords, never).score;
    assert.ok(neverExact > neverSmall, 'a better-fitting Never still ranks above a worse one');
    assert.ok(neverSmall >= SCORE_FLOOR);
  });

  it('lets explicit list text win: "white bread" ignores a Never on white', () => {
    const item = IngredientParser.parseItem('white bread');
    const match = pick(item, [WHITE, WHOLEMEAL], { bread: { white: 'never', wholemeal: 'love' } });
    assert.equal(match.product.id, 'white');
    assert.equal(PenaltyRules.foodRatingFor(WHITE, item, { foodRatings: { bread: { white: 'never' } } }), null);
  });

  it('lets explicit list text win: "wholemeal bread" keeps its hard constraint', () => {
    const item = IngredientParser.parseItem('wholemeal bread');
    const match = pick(item, [WHITE, WHOLEMEAL], { bread: { white: 'love' } });
    assert.equal(match.product.id, 'wholemeal');
  });

  it('only rates products that are in the category themselves', () => {
    const item = bread();
    const chocolate = product('choc', 'Milkybar White Chocolate Bar 90g');
    assert.equal(PenaltyRules.foodRatingFor(chocolate, item, { foodRatings: { bread: { white: 'love' } } }), null);
  });

  it('rates mince by fat band, from the title or the product fat field', () => {
    const item = IngredientParser.parseItem('500g beef mince');
    const ratings = { foodRatings: { mince: { lean5: 'love', fat20: 'never' } } };
    const lean = product('lean', 'Tesco Lean Beef Steak Mince 5% Fat 500g', { packageSize: 500, category: 'meat' });
    const fatty = product('fatty', 'Tesco Beef Mince 500g', { packageSize: 500, category: 'meat', fatPercentage: 20, price: 0.9 });
    assert.equal(PenaltyRules.foodRatingFor(fatty, item, ratings).typeId, 'fat20');
    assert.equal(FuzzyMatcher.matchProduct('tesco', item, [fatty, lean], ratings).product.id, 'lean');
  });

  it('still honours the legacy flags when no ratings are sent', () => {
    assert.equal(pick(bread(), [WHITE, WHOLEMEAL], undefined, { preferWholewheat: true }).product.id, 'wholemeal');
  });
});

describe('Frozen or fresh', () => {
  // Same cod, same pack size: frozen is cheaper, as it usually is.
  const fish = (id, title, price, extra = {}) => product(id, title, { packageSize: 400, category: 'fish', price, ...extra });
  const FRESH = fish('fresh', 'Tesco Fresh British Skinless Cod Fillets 400g', 5.5);
  const FROZEN = fish('frozen', 'Tesco Frozen Skinless Cod Fillets 400g', 3.75);
  const cod = () => IngredientParser.parseItem('400g cod fillets');
  const pickCod = (candidates, foodRatings) => FuzzyMatcher.matchProduct('tesco', cod(), candidates, { foodRatings }).product?.id;

  it('Love Frozen lets the cheaper frozen pack win', () => {
    assert.equal(pickCod([FRESH, FROZEN], { frozen: { frozen: 'love' } }), 'frozen');
  });

  it('Love Frozen wins even when frozen is the dearer one', () => {
    const dearFrozen = { ...FROZEN, price: 6.5 };
    assert.equal(pickCod([FRESH, dearFrozen], { frozen: { frozen: 'love' } }), 'frozen');
  });

  it('Never Frozen keeps a cheaper frozen pack out while fresh exists', () => {
    assert.equal(pickCod([FRESH, FROZEN], { frozen: { frozen: 'never' } }), 'fresh');
  });

  it('adds to the item\'s own category rating rather than replacing it', () => {
    const item = cod();
    const keywords = FuzzyMatcher.extractKeywords(item);
    const smokedFrozen = fish('sf', 'Tesco Frozen Smoked Cod Fillets 400g', 4);
    const ratings = PenaltyRules.scoreCandidate(smokedFrozen, item, keywords, {
      foodRatings: { fish: { smoked: 'love' }, frozen: { frozen: 'love' } }
    }).foodRatings;
    assert.deepEqual(ratings.map((r) => `${r.categoryId}.${r.typeId}:${r.rating}`), ['fish.smoked:love', 'frozen.frozen:love']);
    const ok = PenaltyRules.scoreCandidate(smokedFrozen, item, keywords, { foodRatings: {} }).score;
    const both = PenaltyRules.scoreCandidate(smokedFrozen, item, keywords, {
      foodRatings: { fish: { smoked: 'love' }, frozen: { frozen: 'love' } }
    }).score;
    assert.equal(both - ok, 80);
  });

  it('uses the store\'s frozen flag when the title does not say so', () => {
    const flagged = fish('flag', 'Tesco Skinless Cod Fillets 400g', 3.75, { isFrozen: true });
    const frozen = PenaltyRules.foodRatingsFor(flagged, cod(), { foodRatings: {} }).find((r) => r.categoryId === 'frozen');
    assert.equal(frozen?.typeId, 'frozen');
  });

  it('lets "frozen peas" or "fresh cod" on the list win over the rating', () => {
    const item = IngredientParser.parseItem('400g fresh cod fillets');
    assert.equal(
      PenaltyRules.foodRatingsFor(FRESH, item, { foodRatings: { frozen: { fresh: 'never' } } }).some((r) => r.categoryId === 'frozen'),
      false
    );
  });
});

describe('Diet filter in eligibility', () => {
  it('excludes a product that breaks the household diet, whatever its price', () => {
    const item = IngredientParser.parseItem('500g mince');
    const beef = product('beef', 'Tesco Lean Beef Steak Mince 5% Fat 500g', { packageSize: 500, category: 'meat', price: 0.5 });
    const quorn = product('quorn', 'Quorn Vegetarian Mince 500g', { packageSize: 500, category: 'meat', price: 3 });

    const eligibility = PenaltyRules.checkEligibility(beef, item, [], { diet: ['vegetarian'] });
    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.reason, 'diet_excluded');

    const match = FuzzyMatcher.matchProduct('tesco', item, [beef, quorn], { diet: ['vegetarian'] });
    assert.equal(match.product?.id, 'quorn');
  });

  it('ignores unknown diet ids rather than excluding everything', () => {
    const item = bread();
    assert.equal(PenaltyRules.checkEligibility(WHITE, item, [], { diet: ['keto'] }).eligible, true);
  });
});
