import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IngredientParser } from './ingredientParser.js';

describe('IngredientParser', () => {
  it('should parse simple weight and produce name', () => {
    const item = IngredientParser.parseItem('1kg carrots');
    assert.equal(item.targetQuantity, 1);
    assert.equal(item.unit, 'kg');
    assert.equal(item.baseItem, 'carrots');
    assert.equal(item.category, 'produce');
  });

  it('should parse liquid volume in Litres and ml', () => {
    const item1 = IngredientParser.parseItem('2L semi-skimmed milk');
    assert.equal(item1.targetQuantity, 2);
    assert.equal(item1.unit, 'l');
    assert.equal(item1.category, 'dairy-eggs');

    const item2 = IngredientParser.parseItem('500ml extra virgin olive oil');
    assert.equal(item2.targetQuantity, 500);
    assert.equal(item2.unit, 'ml');
  });

  it('should parse British pints into quantity and unit', () => {
    const item = IngredientParser.parseItem('4 pints whole milk');
    assert.equal(item.targetQuantity, 4);
    assert.equal(item.unit, 'pints');
    assert.equal(item.baseItem, 'whole milk');
  });

  it('should parse compound multiplier items (e.g. 3 x 400g chopped tomatoes)', () => {
    const item = IngredientParser.parseItem('3 x 400g tinned chopped tomatoes');
    assert.equal(item.multiplier, 3);
    assert.equal(item.targetQuantity, 1200);
    assert.equal(item.unit, 'g');
  });

  it('should extract health preferences and fat percentage', () => {
    const item1 = IngredientParser.parseItem('900g 5% lean beef mince');
    assert.equal(item1.fatPercentage, 5);
    assert.equal(item1.isHealthierPreferred, true);
    assert.equal(item1.category, 'meat');

    const item2 = IngredientParser.parseItem('1kg authentic Greek yogurt 0%');
    assert.equal(item2.fatPercentage, 0);
    assert.equal(item2.isHealthierPreferred, true);

    const item3 = IngredientParser.parseItem('1kg wholewheat fusilli pasta');
    assert.equal(item3.isWholewheat, true);

    const item4 = IngredientParser.parseItem('15 free range eggs');
    assert.equal(item4.isFreeRange, true);
    assert.equal(item4.targetQuantity, 15);
    assert.equal(item4.unit, 'item');
  });

  it('should parse a multi-line shopping list', () => {
    const rawList = [
      '1kg fresh chicken breast fillets',
      '500g 5% beef mince',
      '12 free range eggs',
      '2L whole milk'
    ];
    const parsed = IngredientParser.parseList(rawList);
    assert.equal(parsed.length, 4);
    assert.equal(parsed[0].category, 'meat');
    assert.equal(parsed[1].fatPercentage, 5);
    assert.equal(parsed[2].isFreeRange, true);
    assert.equal(parsed[3].unit, 'l');
  });
});
