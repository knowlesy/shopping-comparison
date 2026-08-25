import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isContaminated, CONTAMINATION_RULES } from './contaminationRules.js';

describe('contaminationRules', () => {
  it('should export valid data-driven rules table', () => {
    assert.ok(Array.isArray(CONTAMINATION_RULES));
    assert.ok(CONTAMINATION_RULES.length >= 7);
    for (const rule of CONTAMINATION_RULES) {
      assert.ok(rule.category, 'Rule missing category');
      assert.equal(typeof rule.matchQuery, 'function');
      assert.ok(rule.prohibited instanceof RegExp);
    }
  });

  describe('Eggs queries', () => {
    const query = '6 free range eggs';

    it('should prohibit processed egg contaminations', () => {
      assert.equal(isContaminated(query, 'Tesco Scotch Eggs 2 Pack'), true);
      assert.equal(isContaminated(query, 'Egg Mayonnaise Sandwich Filler 250g'), true);
      assert.equal(isContaminated(query, 'Ambrosia Egg Custard Tart 2x'), true);
      assert.equal(isContaminated(query, 'Cadbury Creme Egg 5 Pack'), true);
      assert.equal(isContaminated(query, 'Medium Egg Noodles 500g'), true);
      assert.equal(isContaminated(query, 'Easter Chocolate Egg 150g'), true);
      assert.equal(isContaminated(query, 'Haribo Fried Eggs Sweets 160g'), true);
    });

    it('should allow authentic fresh cooking eggs', () => {
      assert.equal(isContaminated(query, 'ASDA 6 Free Range Large Eggs'), false);
      assert.equal(isContaminated(query, 'Tesco 12 British Free Range Medium Eggs'), false);
      assert.equal(isContaminated(query, 'Merevale 15 British Free Range Medium Eggs'), false);
      assert.equal(isContaminated(query, 'Organic 6 British Free Range Eggs'), false);
      assert.equal(isContaminated(query, 'Everyday Essentials 15 Eggs'), false);
    });
  });

  describe('Potatoes queries', () => {
    const query = '2kg baby new potatoes';

    it('should prohibit potato crisps, chips, and snacks', () => {
      assert.equal(isContaminated(query, 'Walkers Ready Salted Potato Crisps 6x25g'), true);
      assert.equal(isContaminated(query, 'McCain Home Chips Straight Cut 1kg'), true);
      assert.equal(isContaminated(query, 'Birdseye Potato Waffles 12 pack'), true);
      assert.equal(isContaminated(query, 'Potato Croquettes 500g'), true);
      assert.equal(isContaminated(query, 'Potato Salad with Mayonnaise 300g'), true);
    });

    it('should allow fresh cooking potatoes', () => {
      assert.equal(isContaminated(query, 'ASDA Baby New Potatoes 1kg'), false);
      assert.equal(isContaminated(query, 'Tesco British Maris Piper Potatoes 2.5kg'), false);
      assert.equal(isContaminated(query, 'King Edward Roasting Potatoes 2kg'), false);
      assert.equal(isContaminated(query, 'Baking Potatoes 4 Pack'), false);
      assert.equal(isContaminated(query, 'Charlotte Salad Potatoes 1kg'), false);
    });
  });

  describe('Milk queries', () => {
    const query = '2 pints semi-skimmed milk';

    it('should prohibit milkshakes, chocolate milk, and condensed milk', () => {
      assert.equal(isContaminated(query, 'Frijj Chocolate Fudge Milkshake 400ml'), true);
      assert.equal(isContaminated(query, 'Nestle Carnation Sweetened Condensed Milk 397g'), true);
      assert.equal(isContaminated(query, 'Marvel Dried Skimmed Milk Powder 340g'), true);
      assert.equal(isContaminated(query, 'YAZOO Strawberry Flavoured Milk 400ml'), true);
    });

    it('should allow fresh milk varieties', () => {
      assert.equal(
        isContaminated(query, 'ASDA British Fresh Semi-Skimmed Milk 2 Pints (1.136L)'),
        false
      );
      assert.equal(isContaminated(query, 'Tesco British Whole Milk 4 Pints (2.27L)'), false);
      assert.equal(isContaminated(query, 'Cravendale Filtered Whole Milk 2L'), false);
      assert.equal(isContaminated(query, 'Organic Semi-Skimmed Milk 1L'), false);
    });
  });

  describe('Greek Yogurt queries', () => {
    const query = '1kg authentic Greek yogurt 0%';

    it('should prohibit dessert pots, drinks, and children snacks', () => {
      assert.equal(
        isContaminated(query, 'Muller Corner Vanilla Chocolate Balls Yogurt 6x130g'),
        true
      );
      assert.equal(isContaminated(query, 'Frubes Strawberry Yogurt Tubes 9x37g'), true);
      assert.equal(isContaminated(query, 'Actimel Strawberry Yogurt Drink 8x100g'), true);
      assert.equal(isContaminated(query, 'Nestle Munch Bunch Split Pot 4x90g'), true);
      assert.equal(isContaminated(query, 'Ambrosia Devon Custard Pot 150g'), true);
    });

    it('should allow authentic Greek yogurts and plain styles', () => {
      assert.equal(
        isContaminated(query, 'Fage Total 0% Fat Free Authentic Greek Yogurt 500g'),
        false
      );
      assert.equal(isContaminated(query, 'Fage Total 5% Greek Yogurt 1kg'), false);
      assert.equal(isContaminated(query, 'ASDA 0% Fat Free Authentic Greek Yogurt 500g'), false);
      assert.equal(
        isContaminated(query, 'Yeo Valley Organic Greek Style Natural Yogurt 450g'),
        false
      );
      assert.equal(isContaminated(query, 'Brooklea Greek Style Yogurt 500g'), false);
    });
  });

  describe('Raw Meat queries', () => {
    const query = '500g 5% lean beef mince';

    it('should prohibit canned meat in gravy and pet food', () => {
      assert.equal(isContaminated(query, 'Princes Minced Beef in Gravy 392g Tin'), true);
      assert.equal(isContaminated(query, 'Tinned Beef Stew & Gravy 400g'), true);
      assert.equal(isContaminated(query, 'Fray Bentos Steak & Kidney Pie'), true);
      assert.equal(isContaminated(query, 'Felix Wet Cat Food Beef in Gravy 12x100g'), true);
    });

    it('should allow fresh raw beef mince', () => {
      assert.equal(isContaminated(query, 'ASDA 5% Fat Beef Steak Mince 500g'), false);
      assert.equal(isContaminated(query, 'Tesco Lean British Beef Steak Mince 5% Fat 500g'), false);
      assert.equal(
        isContaminated(query, 'Ashfields 100% British Lean Beef Steak Mince 5% Fat 1kg'),
        false
      );
    });
  });

  describe('Garlic and Spinach queries', () => {
    it('should prohibit garlic bread for fresh garlic bulb queries', () => {
      assert.equal(isContaminated('3 pack garlic bulbs', 'ASDA Garlic Baguette 2 Pack'), true);
      assert.equal(isContaminated('3 pack garlic bulbs', 'Pizza Express Garlic Doughballs'), true);
      assert.equal(isContaminated('3 pack garlic bulbs', 'ASDA 3 Pack Garlic Bulbs'), false);
    });

    it('should prohibit pasta bakes and pies for fresh spinach queries', () => {
      assert.equal(
        isContaminated('250g fresh baby spinach', 'Spinach & Ricotta Pasta Bake 400g'),
        true
      );
      assert.equal(isContaminated('250g fresh baby spinach', 'Spinach and Feta Pie 350g'), true);
      assert.equal(
        isContaminated('250g fresh baby spinach', 'ASDA Baby Spinach Leaves 250g'),
        false
      );
    });
  });
});
