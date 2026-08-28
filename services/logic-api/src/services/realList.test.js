import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IngredientParser } from './ingredientParser.js';
import { FuzzyMatcher } from './fuzzyMatcher.js';

describe('Real 52-Line List Reality Fixtures & Match Fidelity', () => {
  const REAL_52_LIST = [
    'Chicken breast fillets 1.4 kg',
    'Beef mince 5% 1.9 kg',
    'Pork sausages 12-pack',
    'Salmon fillets 4 portions',
    'Cod loin 500 g',
    'Tinned tuna in spring water 4 x 160 g',
    'Tofu firm 400 g',
    'Eggs large free range 18',
    'Greek yogurt 0% fat 1 kg',
    'Whole milk 4 pints',
    'Cheddar cheese mature 400 g',
    'Butter salted 250 g',
    'Mozzarella 2 x 125 g',
    'Oat milk barista 2 L',
    'Broccoli 2 heads',
    'Carrots 1 kg',
    'Brown onions 1 kg',
    'Garlic 3 bulbs',
    'Baby spinach 250 g',
    'Red bell peppers 3',
    'Cucumber 1',
    'Avocados ripe 4-pack',
    'Mushrooms chestnut 400 g',
    'Maris Piper potatoes 1.8 kg',
    'Sweet potatoes 1 kg',
    'Bananas 6',
    'Apples Pink Lady 6-pack',
    'Lemons 4',
    'Fresh blueberries 200 g',
    'Satsumas or easy peelers 600 g',
    'Basmati rice 1 kg',
    'Rolled porridge oats 1 kg',
    'Penne pasta 1 kg',
    'Tinned chopped tomatoes 4 x 400 g',
    'Tinned chickpeas in water 2 x 400 g',
    'Tinned black beans 2 x 400 g',
    'Red split lentils 500 g',
    'Olive oil extra virgin 750 ml',
    'Rapeseed oil 1 L',
    'Soy sauce reduced salt 150 ml',
    'Peanut butter crunchy 1 kg',
    'Wholewheat sliced bread 800 g',
    'Sourdough loaf 1',
    'Tortilla wraps 8-pack',
    'Ground cumin 40 g',
    'Smoked paprika 45 g',
    'Dried oregano 25 g',
    'Reduced-salt stock cubes 8-pack',
    'Dark chocolate 70% 100 g',
    'Honey clear 340 g',
    'Walnuts 200 g',
    'Frozen garden peas 1 kg',
    'Tinned sardines in olive oil 2 x 120 g'
  ];

  it('should correctly parse all sentinel items from the real list', () => {
    // Sentinel 1: Maris Piper potatoes 1.8
    const potatoes = IngredientParser.parseItem('Maris Piper potatoes 1.8 kg');
    assert.ok(potatoes.name.toLowerCase().includes('maris piper potatoes') || potatoes.baseItem.toLowerCase().includes('potatoes'));
    assert.equal(potatoes.targetQuantity, 1.8);
    assert.equal(potatoes.unit, 'kg');
    assert.equal(potatoes.category, 'produce');

    // Sentinel 2: Tinned sardines in olive oil 2 x 120
    const sardines = IngredientParser.parseItem('Tinned sardines in olive oil 2 x 120 g');
    assert.ok(sardines.name.toLowerCase().includes('sardines'));
    assert.equal(sardines.multiplier, 2);
    assert.equal(sardines.targetQuantity, 240);
    assert.equal(sardines.unit, 'g');

    // Sentinel 3: Reduced-salt stock cubes
    const stockCubes = IngredientParser.parseItem('Reduced-salt stock cubes 8-pack');
    assert.ok(stockCubes.name.toLowerCase().includes('stock cubes'));
    assert.equal(stockCubes.targetQuantity, 8);
  });

  it('should parse all real-world lines with valid names and positive quantities', () => {
    const parsed = IngredientParser.parseList(REAL_52_LIST.join('\n'));
    assert.equal(parsed.length, REAL_52_LIST.length);

    for (const item of parsed) {
      assert.ok(item.name && item.name.length > 0, `Empty name for ${item.rawText}`);
      assert.ok(item.targetQuantity > 0, `Invalid quantity for ${item.rawText}`);
      assert.ok(item.category, `Missing category for ${item.rawText}`);
    }
  });

  it('should reject nonsense matches and prevent cross-category contamination', () => {
    // Apples 250 g must NOT match spinach or other unrelated categories
    const appleItem = IngredientParser.parseItem('Apples 250 g');
    const spinachMatch = FuzzyMatcher.matchProduct('custom_store', appleItem, [
      { id: 't-spinach', title: 'Tesco Baby Spinach 250g', price: 1.10, category: 'produce' }
    ]);
    assert.equal(spinachMatch.product, null, 'Apples 250g must not match Baby Spinach 250g');

    // Walnuts 200 g must NOT match tomato puree
    const walnutItem = IngredientParser.parseItem('Walnuts 200 g');
    const pureeMatch = FuzzyMatcher.matchProduct('custom_store', walnutItem, [
      { id: 't-puree', title: 'Tesco Tomato Puree 200g', price: 0.65, category: 'store-cupboard' }
    ]);
    assert.equal(pureeMatch.product, null, 'Walnuts 200g must not match Tomato Puree 200g');
  });

  it('should match covered staples to genuine products in catalog', () => {
    const milkItem = IngredientParser.parseItem('Whole milk 4 pints');
    const milkMatch = FuzzyMatcher.matchProduct('tesco', milkItem);
    assert.ok(milkMatch.product, 'Whole milk should find a genuine match in Tesco catalog');
    assert.ok(milkMatch.product.title.toLowerCase().includes('milk'));

    const bananaItem = IngredientParser.parseItem('Bananas 6');
    const bananaMatch = FuzzyMatcher.matchProduct('tesco', bananaItem);
    assert.ok(bananaMatch.product, 'Bananas should match in Tesco catalog');
    assert.ok(bananaMatch.product.title.toLowerCase().includes('banana'));
  });
});
