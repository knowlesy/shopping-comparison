import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IngredientParser, detectItemCategory } from './ingredientParser.js';

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

  it('should parse name-first trailing quantity items (e.g. Walnuts 200 g, Beef mince 5% 1.9 kg)', () => {
    const item1 = IngredientParser.parseItem('Walnuts 200 g');
    assert.equal(item1.targetQuantity, 200);
    assert.equal(item1.unit, 'g');
    assert.equal(item1.baseItem, 'Walnuts');
    assert.equal(item1.category, 'pantry');

    const item2 = IngredientParser.parseItem('Beef mince 5% 1.9 kg');
    assert.equal(item2.targetQuantity, 1.9);
    assert.equal(item2.unit, 'kg');
    assert.equal(item2.fatPercentage, 5);
    assert.equal(item2.baseItem, 'Beef mince');
    assert.equal(item2.category, 'meat');

    const item3 = IngredientParser.parseItem('Potatoes 1.8kg');
    assert.equal(item3.targetQuantity, 1.8);
    assert.equal(item3.unit, 'kg');
    assert.equal(item3.baseItem, 'Potatoes');

    const item4 = IngredientParser.parseItem('Semi-skimmed milk 4 pints');
    assert.equal(item4.targetQuantity, 4);
    assert.equal(item4.unit, 'pints');
    assert.equal(item4.baseItem, 'Semi-skimmed milk');
  });

  it('should parse mid-line multipliers and pack notations', () => {
    const item1 = IngredientParser.parseItem('Tinned sardines in olive oil 2 x 120 g');
    assert.equal(item1.multiplier, 2);
    assert.equal(item1.targetQuantity, 240);
    assert.equal(item1.unit, 'g');
    assert.equal(item1.category, 'fish');

    const item2 = IngredientParser.parseItem('Butter beans in water 2 x 400 g');
    assert.equal(item2.multiplier, 2);
    assert.equal(item2.targetQuantity, 800);
    assert.equal(item2.unit, 'g');
    assert.equal(item2.category, 'pantry'); // NOT dairy

    const item3 = IngredientParser.parseItem('Little gem lettuce 2-pack');
    assert.equal(item3.targetQuantity, 2);
    assert.equal(item3.unit, 'pack');
    assert.equal(item3.baseItem, 'Little gem lettuce');
  });

  it('should parse bare trailing counts and container units', () => {
    const item1 = IngredientParser.parseItem('Large eggs 17');
    assert.equal(item1.targetQuantity, 17);
    assert.equal(item1.unit, 'item');
    assert.equal(item1.baseItem, 'Large eggs');

    const item2 = IngredientParser.parseItem('Bananas 10');
    assert.equal(item2.targetQuantity, 10);
    assert.equal(item2.unit, 'item');

    const item3 = IngredientParser.parseItem('Celery 1 head');
    assert.equal(item3.targetQuantity, 1);
    assert.equal(item3.unit, 'head');

    const item4 = IngredientParser.parseItem('Garlic 1 bulb');
    assert.equal(item4.targetQuantity, 1);
    assert.equal(item4.unit, 'bulb');

    const item5 = IngredientParser.parseItem('Tomato paste 1 tube');
    assert.equal(item5.targetQuantity, 1);
    assert.equal(item5.unit, 'tube');
  });

  it('should extract parenthetical notes and "X or Y" alternatives', () => {
    const item1 = IngredientParser.parseItem('Dark chocolate (adults only, 85%) 200 g');
    assert.equal(item1.targetQuantity, 200);
    assert.equal(item1.unit, 'g');
    assert.deepEqual(item1.notes, ['adults only, 85%']);
    assert.equal(item1.baseItem, 'Dark chocolate');

    const item2 = IngredientParser.parseItem('Baby food pouches (infant) 4');
    assert.equal(item2.targetQuantity, 4);
    assert.deepEqual(item2.notes, ['infant']);
    assert.equal(item2.baseItem, 'Baby food pouches');

    const item3 = IngredientParser.parseItem('Plums or pears 600 g');
    assert.equal(item3.targetQuantity, 600);
    assert.equal(item3.unit, 'g');
    assert.equal(item3.baseItem, 'Plums');
    assert.deepEqual(item3.alternateTerms, ['pears']);
  });

  it('should prevent compound word category misclassifications', () => {
    assert.equal(detectItemCategory('butter beans in water'), 'pantry');
    assert.equal(detectItemCategory('smooth peanut butter'), 'pantry');
    assert.equal(detectItemCategory('coconut milk tin'), 'pantry');
    assert.equal(detectItemCategory('egg noodles'), 'pantry');
    assert.equal(detectItemCategory('garlic bread baguette'), 'bakery');
    assert.equal(detectItemCategory('butternut squash'), 'produce');
  });

  it('should ignore non-contextual percentages for fat percentage', () => {
    const item = IngredientParser.parseItem('100% peanuts 200g');
    assert.equal(item.fatPercentage, undefined);
    assert.equal(item.targetQuantity, 200);
  });

  it('should split multi-item comma lines into individual items', () => {
    const herbsLine = ['Oregano, thyme, rosemary, basil, parsley, sage, mint'];
    const parsed = IngredientParser.parseList(herbsLine);
    assert.equal(parsed.length, 7);
    assert.equal(parsed[0].name, 'Oregano');
    assert.equal(parsed[1].name, 'thyme');
    assert.equal(parsed[6].name, 'mint');
  });

  it('should correctly parse the full real 52-line list from report5.md', () => {
    const real52List = [
      'Beef mince 5% 1.9 kg',
      'Walnuts 200 g',
      'Large eggs 17',
      'Semi-skimmed milk 4 pints',
      'Tinned sardines in olive oil 2 x 120 g',
      'Little gem lettuce 2-pack',
      'Celery 1 head',
      'Garlic 1 bulb',
      'Tomato paste 1 tube',
      'Potatoes 1.8kg',
      'Bananas 10',
      'Apples 250 g',
      'Hummus 200 g',
      'Sultanas 500 g',
      'Lasagne sheets 500 g',
      'Red peppers 4',
      'Red wine vinegar',
      'Frozen peas 1 kg',
      'Butter beans in water 2 x 400 g',
      'Smooth peanut butter 300 g',
      'Plums or pears 600 g',
      'Oregano, thyme, rosemary, basil, parsley, sage, mint',
      'Olive oil',
      'Carrots 1 kg',
      'Onions 1 kg',
      'Broccoli 500 g',
      'Cucumber 1',
      'Oranges 6',
      'Chicken breast fillets 1 kg',
      'Salmon fillets 4',
      'Frozen cod fillets 1.5 kg',
      'Greek yogurt 0% 1 kg',
      'Cheddar cheese 400 g',
      'Wholewheat fusilli 1 kg',
      'Basmati rice 1 kg',
      'Porridge oats 1 kg',
      'Red lentils 500 g',
      'Chia seeds 200 g',
      'Wholemeal bread 1 loaf',
      'Plain flour 1.5 kg',
      'Dark chocolate (adults only, 85%) 200 g',
      'Baby food pouches (infant) 4',
      'Chopped tomatoes 4 x 400 g',
      'Kidney beans 400 g',
      'Chickpeas 400 g',
      'Spinach 250 g',
      'Mushrooms 300 g',
      'Courgettes 500 g',
      'Lemons 4',
      'Vegetable stock cubes 8',
      'Fairy washing up liquid 433 ml',
      'Kitchen roll 2 pack'
    ];

    const parsed = IngredientParser.parseList(real52List);
    // Since herbs line expands to 7 items, 51 lines + 7 = 58 items
    assert.equal(parsed.length, 58);

    const findByName = (n) => parsed.find(i => i.baseItem.toLowerCase().includes(n.toLowerCase()));

    // Assert key items
    const mince = findByName('Beef mince');
    assert.equal(mince.targetQuantity, 1.9);
    assert.equal(mince.unit, 'kg');
    assert.equal(mince.fatPercentage, 5);

    const walnuts = findByName('Walnuts');
    assert.equal(walnuts.targetQuantity, 200);
    assert.equal(walnuts.unit, 'g');

    const eggs = findByName('Large eggs');
    assert.equal(eggs.targetQuantity, 17);
    assert.equal(eggs.unit, 'item');

    const milk = findByName('Semi-skimmed milk');
    assert.equal(milk.targetQuantity, 4);
    assert.equal(milk.unit, 'pints');

    const sardines = findByName('sardines');
    assert.equal(sardines.targetQuantity, 240);
    assert.equal(sardines.multiplier, 2);
    assert.equal(sardines.unit, 'g');

    const lettuce = findByName('lettuce');
    assert.equal(lettuce.targetQuantity, 2);
    assert.equal(lettuce.unit, 'pack');

    const potatoes = findByName('Potatoes');
    assert.equal(potatoes.targetQuantity, 1.8);
    assert.equal(potatoes.unit, 'kg');

    const oil = parsed.find(i => i.baseItem.toLowerCase() === 'olive oil');
    assert.equal(oil.targetQuantity, 1); // No qty ok

    const butterBeans = findByName('Butter beans');
    assert.equal(butterBeans.category, 'pantry');
    assert.equal(butterBeans.targetQuantity, 800);

    const peanutButter = findByName('peanut butter');
    assert.equal(peanutButter.category, 'pantry');
    assert.equal(peanutButter.targetQuantity, 300);
  });
});

