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

  describe('Novelty eggs, Peppers, Produce snacks, and Dried fruit', () => {
    it('should prohibit novelty, toy, and chocolate eggs for fresh egg queries', () => {
      assert.equal(isContaminated('Large eggs 17', 'Character Surprise Egg 10G'), true);
      assert.equal(isContaminated('Large eggs 17', 'Kinder Bueno Chocolate Eggs 80G'), true);
      assert.equal(isContaminated('Large eggs 17', 'Dr.Oetker Egg White Powder Multipack Sachet 4X5g'), true);
      assert.equal(isContaminated('Large eggs 17', 'GARNERS PICKLED EGGS 440g'), true);
      assert.equal(isContaminated('Large eggs 17', 'Big & Fresh Barn Eggs 6 Large'), false);
    });

    it('should prohibit chillies, jalapenos, and prepared food for fresh red pepper queries', () => {
      assert.equal(isContaminated('Red peppers 4', 'Aleyna Sliced Red Jalapeno Peppers 480G'), true);
      assert.equal(isContaminated('Red peppers 4', 'Aleyna Hot Chilli Peppers 470g'), true);
      assert.equal(isContaminated('Red peppers 4', 'Tesco Red Pepper & 3 Bean Chilli 392G'), true);
      assert.equal(isContaminated('Red peppers 4', 'Aleyna Roasted Red Peppers 480G'), true);
      assert.equal(isContaminated('Red peppers 4', 'Aleyna Specialities Roasted Red Pepper and Artichoke Bruschetta Topping 190g'), true);
      assert.equal(isContaminated('Red peppers 4', 'Tesco Red Peppers Each'), false);
    });

    it('should prohibit dried snacks and crisps for fresh apple queries', () => {
      assert.equal(isContaminated('Apples 250 g', 'Tesco Apple Snack Pack 80G'), true);
      assert.equal(isContaminated('Apples 250 g', 'Scrapples Crunchy Plain Apple Crisps Multipack (5x12g)'), true);
      assert.equal(isContaminated('Apples 250 g', 'Rosedene Farms Small Apple 6 Pack'), false);
    });

    it('should prohibit baked goods, cereals, and desserts for plain sultana queries', () => {
      assert.equal(isContaminated('Sultanas 500 g', 'Tesco Sultana Scones 6 Pack'), true);
      assert.equal(isContaminated('Sultanas 500 g', "Kellogg's Sultana Bran Breakfast Cereal 500g"), true);
      assert.equal(isContaminated('Sultanas 500 g', 'Ambrosia Creamed Rice Sultanas & Nutmeg 400G Tin'), true);
      assert.equal(isContaminated('Sultanas 500 g', 'Tesco Sultana & Oat Cookies 200G'), true);
    });
  });

  describe('Step 25: Generalized produce derivatives and flavour signals', () => {
    it('should prohibit desserts and derivatives for produce requests', () => {
      assert.equal(isContaminated('strawberries', 'Hartleys Strawberry Jelly 135G'), true);
      assert.equal(isContaminated('pears', 'Kubus Pear & Apple Mousse 100g'), true);
      assert.equal(isContaminated('blueberries', 'Tesco Blueberry Muffins 4 Pack'), true);
      assert.equal(isContaminated('mango', 'Tesco Mango Flavour Ice Lollies 4x73ml'), true);
      assert.equal(isContaminated('raspberries', 'Tesco Raspberry Flavoured Milkshake Powder 500g'), true);
    });

    it('should treat flavour and flavoured in product titles as contamination signal for produce', () => {
      assert.equal(isContaminated('peaches', 'Tesco Peach Flavour Water 500ml'), true);
      assert.equal(isContaminated('cherries', 'Tesco Cherry Flavoured Yogurt 150g'), true);
      assert.equal(isContaminated('limes', 'Tesco Lime Flavour Cordial 1L'), true);
    });

    it('should allow genuine fresh produce', () => {
      assert.equal(isContaminated('strawberries', 'Tesco Strawberries 400G'), false);
      assert.equal(isContaminated('blueberries', 'Tesco Blueberries 200G'), false);
      assert.equal(isContaminated('mango', 'Tesco Mango Each'), false);
      assert.equal(isContaminated('pears', 'Tesco Conference Pears 600G'), false);
      assert.equal(isContaminated('raspberries', 'Tesco Raspberries 150G'), false);
      assert.equal(isContaminated('peaches', 'Tesco Peaches 4 Pack'), false);
      assert.equal(isContaminated('yogurt', 'Tesco Greek Style Yogurt 500G'), false);
    });

    it('should allow requested derivative products when explicitly asked for', () => {
      assert.equal(isContaminated('orange juice', 'Tesco Pure Orange Juice 1L'), false);
      assert.equal(isContaminated('strawberry jam', 'Tesco Strawberry Jam 454G'), false);
    });
  });
});
