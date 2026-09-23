import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { previewFoodChanges } from '../src/services/prefPreview.ts';
import type { ComparisonResponse, ItemMatch, ParsedItem, SupermarketName, SupermarketProduct } from '../src/types.ts';

const item = (id: string, name: string, extra: Partial<ParsedItem> = {}): ParsedItem => ({
  id,
  rawText: name,
  name,
  baseItem: name,
  category: 'general',
  targetQuantity: 1,
  unit: 'item',
  ...extra,
});

const product = (id: string, store: SupermarketName, title: string, price: number): SupermarketProduct =>
  ({ id, supermarket: store, title, price, brand: '', tier: 'standard', category: 'bakery', packageSize: 800, packageUnit: 'g', packageDisplay: '800g', unitPrice: price, unitPriceMeasure: 'kg', isHealthier: false, inStock: true, productUrl: '', imageUrl: '' }) as SupermarketProduct;

const match = (parsedItem: ParsedItem, store: SupermarketName, chosen: SupermarketProduct | null, alternatives: SupermarketProduct[] = []): ItemMatch =>
  ({ parsedItem, supermarket: store, product: chosen, packsNeeded: 1, totalQuantity: 1, totalPrice: chosen?.price ?? 0, effectiveUnitPrice: 0, weightDifferencePercent: 0, isClosestPack: true, matchScore: 80, alternatives }) as ItemMatch;

function comparisonOf(items: ParsedItem[], byStore: Partial<Record<SupermarketName, ItemMatch[]>>): ComparisonResponse {
  const supermarkets = Object.fromEntries(
    Object.entries(byStore).map(([store, matches]) => [
      store,
      { supermarket: store, info: { name: store === 'tesco' ? 'Tesco' : store === 'asda' ? 'Asda' : store }, items: matches },
    ])
  );
  return { parsedItems: items, supermarkets, timestamp: '' } as unknown as ComparisonResponse;
}

const bread = item('bread', 'bread');
const WHITE_T = product('t-white', 'tesco', 'Tesco Medium Sliced White Bread 800g', 0.75);
const WHOLE_T = product('t-whole', 'tesco', 'Tesco Wholemeal Medium Sliced Bread 800g', 0.95);
const WHITE_A = product('a-white', 'asda', 'ASDA White Medium Sliced Bread 800g', 0.7);

describe('previewFoodChanges', () => {
  it('reports nothing when no rating changed', () => {
    const comparison = comparisonOf([bread], { tesco: [match(bread, 'tesco', WHITE_T, [WHOLE_T])] });
    const ratings = { bread: { white: 'love' as const } };
    const result = previewFoodChanges({ items: [bread], comparison, savedRatings: ratings, draftRatings: ratings });
    assert.equal(result.changedItems, 0);
    assert.deepEqual(result.items, []);
  });

  it('shows the switch and its price change when a loaded alternative wins', () => {
    const comparison = comparisonOf([bread], { tesco: [match(bread, 'tesco', WHITE_T, [WHOLE_T])] });
    const result = previewFoodChanges({
      items: [bread],
      comparison,
      savedRatings: {},
      draftRatings: { bread: { wholemeal: 'love' } },
    });
    assert.equal(result.changedItems, 1);
    const [effect] = result.items;
    assert.equal(effect.itemName, 'bread');
    assert.equal(effect.newType, 'Wholemeal / brown');
    assert.deepEqual(effect.stores[0], {
      store: 'tesco',
      storeName: 'Tesco',
      status: 'switch',
      fromTitle: WHITE_T.title,
      fromType: 'White',
      toTitle: WHOLE_T.title,
      toType: 'Wholemeal / brown',
      priceDelta: 0.2,
    });
  });

  it('says "applies on next compare" when a newly loved type was not loaded', () => {
    const comparison = comparisonOf([bread], { asda: [match(bread, 'asda', WHITE_A, [])] });
    const result = previewFoodChanges({ items: [bread], comparison, savedRatings: {}, draftRatings: { bread: { wholemeal: 'love' } } });
    assert.equal(result.items[0].stores[0].status, 'next_compare');
  });

  it('flags a store where only a Never type exists in the loaded data', () => {
    const comparison = comparisonOf([bread], {
      tesco: [match(bread, 'tesco', WHITE_T, [WHOLE_T])],
      asda: [match(bread, 'asda', WHITE_A, [])],
    });
    const result = previewFoodChanges({ items: [bread], comparison, savedRatings: {}, draftRatings: { bread: { white: 'never' } } });
    const byStore = Object.fromEntries(result.items[0].stores.map((s) => [s.store, s]));
    assert.equal(byStore.tesco.status, 'switch');
    assert.equal(byStore.tesco.toTitle, WHOLE_T.title);
    assert.equal(byStore.asda.status, 'only_never');
  });

  it('leaves items alone when the list already names the type', () => {
    const white = item('wb', 'white bread');
    const comparison = comparisonOf([white], { tesco: [match(white, 'tesco', WHITE_T, [WHOLE_T])] });
    const result = previewFoodChanges({ items: [white], comparison, savedRatings: {}, draftRatings: { bread: { white: 'never' } } });
    assert.equal(result.changedItems, 0);
  });

  it('never classifies a product outside the category (white chocolate is not bread)', () => {
    const choc = product('t-choc', 'tesco', 'Milkybar White Chocolate Bar 90g', 1);
    const comparison = comparisonOf([bread], { tesco: [match(bread, 'tesco', choc, [])] });
    const result = previewFoodChanges({ items: [bread], comparison, savedRatings: {}, draftRatings: { bread: { white: 'never' } } });
    assert.equal(result.items[0].stores[0].status, 'next_compare');
  });

  it('marks a removed Love as "applies on next compare", not a guessed switch', () => {
    const comparison = comparisonOf([bread], { tesco: [match(bread, 'tesco', WHOLE_T, [WHITE_T])] });
    const result = previewFoodChanges({ items: [bread], comparison, savedRatings: { bread: { wholemeal: 'love' } }, draftRatings: {} });
    assert.equal(result.items[0].stores[0].status, 'next_compare');
  });

  it('lists affected items that are not in the loaded comparison', () => {
    const eggs = item('eggs', '12 eggs');
    const comparison = comparisonOf([bread], { tesco: [match(bread, 'tesco', WHITE_T, [WHOLE_T])] });
    const result = previewFoodChanges({ items: [bread, eggs], comparison, savedRatings: {}, draftRatings: { eggs: { free_range: 'love' } } });
    assert.equal(result.changedItems, 1);
    assert.equal(result.items[0].itemName, '12 eggs');
    assert.equal(result.items[0].notCompared, true);
  });

  it('works with no comparison at all', () => {
    const result = previewFoodChanges({ items: [bread], comparison: null, savedRatings: {}, draftRatings: { bread: { white: 'love' } } });
    assert.equal(result.hasComparison, false);
    assert.equal(result.items[0].notCompared, true);
  });

  it('swaps a product that breaks a newly added diet for a loaded one that does not', () => {
    const mince = item('m', 'mince');
    const beef = product('beef', 'tesco', 'Tesco Lean Beef Steak Mince 5% Fat 500g', 2.5);
    const quorn = product('quorn', 'tesco', 'Quorn Vegetarian Mince 500g', 3);
    const comparison = comparisonOf([mince], { tesco: [match(mince, 'tesco', beef, [quorn])], asda: [match(mince, 'asda', { ...beef, id: 'ab', supermarket: 'asda' }, [])] });
    const result = previewFoodChanges({ items: [mince], comparison, savedDiet: [], draftDiet: ['vegetarian'] });
    const byStore = Object.fromEntries(result.items[0].stores.map((s) => [s.store, s]));
    assert.equal(byStore.tesco.status, 'switch');
    assert.equal(byStore.tesco.toTitle, quorn.title);
    assert.equal(byStore.tesco.priceDelta, 0.5);
    assert.equal(byStore.asda.status, 'excluded');
  });

  it('shows the saving when Love Frozen makes a cheaper frozen pack win', () => {
    const cod = item('c', 'cod fillets');
    const fresh = product('fresh', 'tesco', 'Tesco Fresh British Skinless Cod Fillets 400g', 5.5);
    const frozen = product('frozen', 'tesco', 'Tesco Frozen Skinless Cod Fillets 400g', 3.75);
    const comparison = comparisonOf([cod], { tesco: [match(cod, 'tesco', fresh, [frozen])] });
    const result = previewFoodChanges({ items: [cod], comparison, savedRatings: {}, draftRatings: { frozen: { frozen: 'love' } } });
    const [effect] = result.items;
    assert.equal(effect.categoryLabel, 'Frozen or fresh');
    assert.equal(effect.newType, 'Frozen');
    assert.equal(effect.stores[0].status, 'switch');
    assert.equal(effect.stores[0].priceDelta, -1.75);
  });

  it('leaves "frozen peas" alone: the list already chose frozen', () => {
    const peas = item('p', 'frozen peas');
    const bag = product('peas', 'tesco', 'Tesco Frozen Garden Peas 1kg', 1.2);
    const comparison = comparisonOf([peas], { tesco: [match(peas, 'tesco', bag, [])] });
    const result = previewFoodChanges({ items: [peas], comparison, savedRatings: {}, draftRatings: { frozen: { frozen: 'never' } } });
    assert.equal(result.changedItems, 0);
  });
});
