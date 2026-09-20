import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MatchResultBuilder } from './matchResultBuilder.js';

describe('MatchResultBuilder Canonical Match Results Suite', () => {
  const sampleItem = {
    rawText: 'Greek yogurt 1 kg',
    name: 'Greek yogurt',
    baseItem: 'Greek yogurt',
    category: 'dairy-eggs',
    targetQuantity: 1000,
    unit: 'g'
  };

  const prod500 = {
    id: 'tesco-yog-500',
    title: 'Tesco Greek Style Yogurt 500g',
    price: 1.50,
    packageSize: 500,
    packageUnit: 'g',
    category: 'dairy-eggs',
    supermarket: 'tesco',
    source: 'direct'
  };

  const prod250 = {
    id: 'tesco-yog-250',
    title: 'Tesco Greek Style Yogurt 250g',
    price: 0.80,
    packageSize: 250,
    packageUnit: 'g',
    category: 'dairy-eggs',
    supermarket: 'tesco',
    source: 'direct'
  };

  const prodCat250 = {
    id: 'cat-yog-250',
    title: 'Tesco Greek Style Yogurt 250g',
    price: 0.85,
    packageSize: 250,
    packageUnit: 'g',
    category: 'dairy-eggs',
    supermarket: 'tesco',
    source: 'catalog'
  };

  it('Condition 1: Switching from 2x500g to 4x250g produces matching product IDs, four packs, 1000g, correct price/lines and recomposed confidence', () => {
    // Initial rules match: 2x 500g pack
    const initialMatch = MatchResultBuilder.buildMatchResult({
      item: sampleItem,
      supermarket: 'tesco',
      product: prod500,
      preferences: { includeDeals: true }
    });

    assert.equal(initialMatch.product.id, 'tesco-yog-500');
    assert.equal(initialMatch.packsNeeded, 2);
    assert.equal(initialMatch.totalQuantity, 1000);
    assert.equal(initialMatch.totalPrice, 3.00);
    assert.equal(initialMatch.lines[0].product.id, 'tesco-yog-500');
    assert.equal(initialMatch.lines[0].packs, 2);

    // AI selection switches to 250g pack
    const aiSelection = {
      product: prod250,
      selectedIndex: 1,
      matchConfidence: 0.95,
      matchSource: 'ai',
      aiReasoning: '250g pack is on rollback deal'
    };

    const updatedMatch = MatchResultBuilder.applySelection(initialMatch, aiSelection, {
      item: sampleItem,
      supermarket: 'tesco',
      preferences: { includeDeals: true }
    });

    // 1. Matching product IDs between match.product and lines
    assert.equal(updatedMatch.product.id, 'tesco-yog-250');
    assert.equal(updatedMatch.lines[0].product.id, 'tesco-yog-250');
    assert.equal(updatedMatch.lines.length, 1);

    // 2. Four packs needed to satisfy 1000g
    assert.equal(updatedMatch.packsNeeded, 4);
    assert.equal(updatedMatch.lines[0].packs, 4);

    // 3. 1000g total delivered quantity
    assert.equal(updatedMatch.totalQuantity, 1000);

    // 4. Correct price: 4 x 0.80 = £3.20
    assert.equal(updatedMatch.totalPrice, 3.20);
    assert.equal(updatedMatch.lines[0].subtotal, 3.20);

    // 5. Recomposed confidence
    assert.equal(updatedMatch.matchSource, 'ai');
    assert.equal(updatedMatch.matchConfidence, 0.95);
    assert.equal(updatedMatch.confidenceSource, 'direct');
    assert.equal(updatedMatch.dataConfidence, 0.90);
    // 0.90 * 0.95 = 0.855
    assert.equal(updatedMatch.confidenceScore, 0.855);
    assert.equal(updatedMatch.aiReasoning, '250g pack is on rollback deal');
  });

  it('Condition 2: AI decline produces a coherent no-match with no stale product, deal or nonzero total', () => {
    const prodWithDeal = {
      ...prod500,
      deal: { rawText: 'Buy 1 Get 1 Free', badge: 'Buy 1 Get 1 Free', type: 'buy_x_get_y_free', buyQuantity: 1, freeQuantity: 1 }
    };

    const initialMatch = MatchResultBuilder.buildMatchResult({
      item: sampleItem,
      supermarket: 'tesco',
      product: prodWithDeal,
      preferences: { includeDeals: true }
    });

    assert.ok(initialMatch.product);
    assert.ok(initialMatch.dealApplied);
    assert.ok(initialMatch.totalPrice > 0);

    // AI decline
    const decline = {
      product: null,
      selectedIndex: null,
      reasoning: 'None of the candidates satisfy organic requirement',
      matchSource: 'ai'
    };

    const declinedMatch = MatchResultBuilder.applySelection(initialMatch, decline, {
      item: sampleItem,
      supermarket: 'tesco'
    });

    // Asserts: coherent no-match
    assert.equal(declinedMatch.product, null, 'Must have product null');
    assert.equal(declinedMatch.dealApplied, undefined, 'Must not retain stale deal');
    assert.equal(declinedMatch.totalPrice, 0, 'Must have totalPrice 0');
    assert.equal(declinedMatch.totalQuantity, 0, 'Must have totalQuantity 0');
    assert.equal(declinedMatch.effectiveUnitPrice, 0, 'Must have effectiveUnitPrice 0');
    assert.equal(declinedMatch.lines.length, 0, 'Must have empty lines');
    assert.equal(declinedMatch.variantRoute.length, 0, 'Must have empty variantRoute');
    assert.equal(declinedMatch.confidenceScore, 0, 'Must have confidenceScore 0');
    assert.equal(declinedMatch.confidenceSource, 'none');
    assert.equal(declinedMatch.matchSource, 'ai');
    assert.equal(declinedMatch.aiReasoning, 'None of the candidates satisfy organic requirement');
    assert.equal(declinedMatch.explanation, 'None of the candidates satisfy organic requirement');
  });

  it('Condition 3: Reviewing the same product still updates legitimate match-confidence metadata; model failure does not falsely claim AI approval', () => {
    // Initial rules match
    const initialMatch = MatchResultBuilder.buildMatchResult({
      item: sampleItem,
      supermarket: 'tesco',
      product: prod500,
      matchScore: 78
    });

    assert.equal(initialMatch.matchSource, 'fuzzy');
    assert.equal(initialMatch.matchConfidence, 0.78);

    // AI selects the SAME product with higher confidence
    const aiSameSelection = {
      product: prod500,
      selectedIndex: 0,
      matchConfidence: 0.98,
      matchSource: 'ai',
      aiReasoning: 'Optimal fat and weight match'
    };

    const reviewedMatch = MatchResultBuilder.applySelection(initialMatch, aiSameSelection, {
      item: sampleItem,
      supermarket: 'tesco'
    });

    assert.equal(reviewedMatch.product.id, 'tesco-yog-500');
    assert.equal(reviewedMatch.matchSource, 'ai', 'Must update matchSource to ai');
    assert.equal(reviewedMatch.matchConfidence, 0.98, 'Must update matchConfidence to AI confidence');
    assert.equal(reviewedMatch.aiReasoning, 'Optimal fat and weight match');
    assert.match(reviewedMatch.confidence, /Gemini AI Match/);

    // Model failure fallback: returns raw candidate without AI approval
    const modelFailure = {
      product: prod500,
      score: 78,
      fallback: true
    };

    const fallbackMatch = MatchResultBuilder.applySelection(initialMatch, modelFailure, {
      item: sampleItem,
      supermarket: 'tesco'
    });

    assert.equal(fallbackMatch.matchSource, 'fuzzy', 'Model failure must not claim AI approval');
    assert.notEqual(fallbackMatch.matchSource, 'ai');
  });

  it('Condition 4: Variant routes, deals-off and estimated provenance remain consistent. A direct-to-catalog change cannot retain direct confidence', () => {
    // 1. Direct-to-catalog change
    const directMatch = MatchResultBuilder.buildMatchResult({
      item: sampleItem,
      supermarket: 'tesco',
      product: prod500 // direct
    });
    assert.equal(directMatch.confidenceSource, 'direct');
    assert.equal(directMatch.dataConfidence, 0.90);

    const aiCatalogSelection = {
      product: prodCat250, // catalog product
      selectedIndex: 0,
      matchConfidence: 0.99,
      matchSource: 'ai',
      aiReasoning: 'Catalog match'
    };

    const catalogResult = MatchResultBuilder.applySelection(directMatch, aiCatalogSelection, {
      item: sampleItem,
      supermarket: 'tesco'
    });

    assert.equal(catalogResult.confidenceSource, 'catalog', 'Must drop to catalog source');
    assert.equal(catalogResult.dataConfidence, 0.40, 'Data confidence must be capped at 0.40');
    assert.ok(catalogResult.confidenceScore <= 0.40, 'Overall confidence score cannot exceed data tier 0.40');
    assert.equal(catalogResult.isEstimated, true, 'Catalog product must be flagged as estimated');

    // 2. Deals-off toggle
    const dealProduct = {
      id: 'tesco-deal-prod',
      title: 'Tesco Greek Style Yogurt 500g',
      price: 2.00,
      packageSize: 500,
      packageUnit: 'g',
      deal: { rawText: 'Buy 1 Get 1 Free', badge: 'Buy 1 Get 1 Free', type: 'buy_x_get_y_free', buyQuantity: 1, freeQuantity: 1 }
    };

    const withDeals = MatchResultBuilder.buildMatchResult({
      item: sampleItem,
      supermarket: 'tesco',
      product: dealProduct,
      preferences: { includeDeals: true }
    });
    assert.ok(withDeals.dealApplied, 'Deal must be applied when includeDeals is true');
    assert.equal(withDeals.totalPrice, 2.00, 'Buy 1 Get 1 Free: 2 packs for £2.00');

    const dealsOff = MatchResultBuilder.buildMatchResult({
      item: sampleItem,
      supermarket: 'tesco',
      product: dealProduct,
      preferences: { includeDeals: false }
    });
    assert.equal(dealsOff.dealApplied, undefined, 'Deal must NOT be applied when includeDeals is false');
    assert.equal(dealsOff.totalPrice, 4.00, '2 packs at full price £2.00 = £4.00');

    // 3. User pack override hook (Task 05 hook)
    const overridden = MatchResultBuilder.buildMatchResult({
      item: sampleItem,
      supermarket: 'tesco',
      product: prod500,
      packOverrides: { packs: 6 },
      preferences: { includeDeals: true }
    });
    assert.equal(overridden.packsNeeded, 6);
    assert.equal(overridden.totalQuantity, 3000);
    assert.equal(overridden.totalPrice, 9.00);
    assert.equal(overridden.lines[0].packs, 6);
  });
});
