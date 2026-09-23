import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_FOOD_RATINGS,
  FOOD_CATEGORIES,
  MAX_TYPES_PER_CATEGORY,
  applyLegacyFoodKeys,
  categoryById,
  classifyProduct,
  coveringCategories,
  coveringCategory,
  leanTypeForFat,
  namedType,
  productTypeText,
  ratingsFromLegacy,
  resolveFoodRatings,
  violatesDiet
} from '../../../../shared/foodTypes.js';

/**
 * Keyword coverage for the food types a household can rate.
 *
 * Titles are real shelf titles from data/catalog.json and tests/fixtures, copied verbatim.
 * Where the corpus holds fewer than five titles for a type, every title it does hold is
 * used and the shortfall is stated; nothing is invented to make up the number.
 */
const REAL_TITLES = {
  bread: {
    // Only three 50/50 loaves exist in the corpus.
    fifty: [
      '50/50 Bread Thick Sliced Loaf 800g',
      'Hovis Best of Both Medium Bread 800g',
      'Warburtons Half And Half Medium Bread 800G'
    ],
    wholemeal: [
      'ASDA Medium Wholemeal Bread 800g',
      'Hovis Granary Wholemeal Bread 800g',
      'Henllan Bakery Brown Thin Sliced Bread   400g',
      'Kingsmill Tasty Wholemeal Bread Medium Sliced Loaf 800g',
      'Wholemeal & Rye Sourdough Sliced Loaf 500g',
      'Warburtons Wholegrain & Rye With Sourdough 400g'
    ],
    sourdough: [
      "Jason's Recipe No 08 White Sourdough Ciabattin Bread 580g",
      'No 06 Majestic Malted Sourdough 450g',
      'No7 Sprouted Grains Sourdough 450g',
      'Wildfarmed Simply Sourdough 640g',
      "Irwin's Seven Seeds & Grains Sourdough 680g",
      "Sainsbury's 400g Green Olive & Rosemary Half Bloomer White Sourdough Bread, Taste the Difference"
    ],
    seeded: [
      'Hovis Seed Sensations Seven Seeds Bread 400g',
      'Kingsmill Multi-Seed Bread 800g',
      'Morrisons Lightly Seeded Loaf 800g',
      'Warburtons Thick Sliced Seeded Batch Bread 800g',
      'Tesco Lightly Seeded White Bread Loaf 800g',
      'Promise Gluten Free Multigrain Loaf 480g'
    ],
    white: [
      'Hovis Soft White Medium Sliced Bread 800g',
      'Kingsmill Soft White Bread Medium Sliced Loaf 800g',
      'Tesco Medium Sliced White Bread 800g',
      'Warburtons Toastie Thick Sliced White Bread 800g',
      'Iceland Thick White Sliced Bread 800g'
    ]
  },
  milk: {
    // Three plain plant drinks in the corpus; the flavoured ones are excluded on purpose.
    plant: [
      'Alpro 1L Almond No Sugar Chilled Dairy Free Drink',
      'Oatly Oat Drink Barista Edition Long Life 1L',
      "Sainsbury's Unsweetened Long Life Soya Drink 1L"
    ],
    lactose_free: [
      'Arla LactoFREE Semi Skimmed Milk Drink 1L',
      'Arla Lactofree Organic Semi Skimmed Milk 1L',
      'LactoFREE Semi Skimmed Milk Drink 1L',
      "Sainsbury's Everyday Lactose Free Semi Skimmed Dairy Drink 1L",
      'Arla 1L LactoFREE Semi Skimmed Long Life Milk Drink'
    ],
    semi: [
      'ASDA British Fresh Semi-Skimmed Milk 4 Pints (2.27L)',
      'Arla Cravendale Filtered Fresh Semi Skimmed Milk 2L Fresher for Longer',
      'Tesco British Semi Skimmed Milk 2.272L, 4 Pints',
      'Arla BOB Semi-Skimmed Milk 2L That Tastes Like Whole',
      'Yeo Valley Organic Semi-Skimmed Fresh Milk 2L'
    ],
    skimmed: [
      'ASDA British Fresh Skimmed Milk 2 Pints (1.136L)',
      "Sainsbury's British Skimmed Milk 2.27L (4 pint)",
      "Sainsbury's Skimmed Milk 4 Pints 2.27L",
      'Arla BOB Skimmed Milk 2L Tastes like Semi Skimmed',
      'Skimmed Milk 2L Tastes like Semi Skimmed'
    ],
    whole: [
      "Graham's Organic Whole Milk 1L",
      'Cravendale Filtered Fresh Whole Milk 2L Fresher for Longer',
      "Sainsbury's British Whole Milk 1.13L (2 pint)",
      'Tesco British Fresh Whole Milk 2 Pints (1.136L)',
      "Sainsbury's Whole British Milk, SO Organic 2.272L"
    ]
  },
  eggs: {
    organic: [
      'ASDA 6 Organic Free Range Eggs',
      'Birchwood Organic 6 Free Range Eggs',
      'Morrisons Organic 6 Free Range Eggs',
      'Purely Organic 10 Mixed Size Eggs',
      "Sainsbury's SO Organic Free Range Eggs x6"
    ],
    free_range: [
      '12 Large Free Range Eggs',
      'ASDA 15 Free Range Medium Eggs',
      'Happy Egg Free Range Eggs Large 6 Pack',
      "Sainsbury's British Free Range Eggs Large x12",
      'Clarence Court Burford Browns Free range Eggs 10 pack '
    ],
    unlabelled: [
      'Everyday Essentials 15 Eggs',
      'Morrisons Savers 15 Eggs',
      'Simply 15 Eggs',
      'Just Essentials by ASDA 15 Eggs',
      'Iceland 10 Large Class A British Eggs',
      'Big & Fresh Barn Eggs 6 Large'
    ]
  },
  mince: {
    lean5: [
      '5% Fat Beef Mince 500g',
      'Ashfields 100% British Lean Beef Steak Mince 5% Fat 1kg',
      'Tesco Lean Beef Steak Mince 5% Fat 500g',
      'Morrisons Turkey Mince 4% 500g',
      'Morrisons British Chicken Mince 5% Fat 500g'
    ],
    lean10: [
      '10% Fat Beef Mince 500g',
      'Morrisons Minced Beef 10% Fat',
      'ASDA British 12% Lean Beef Mince 500g',
      'Iceland Beef Steak Mince 12% Fat 375g',
      "Sainsbury's Beef Mince 12% Fat , Taste the Difference 500g"
    ],
    std15: [
      '15% Fat Beef Mince 500g',
      'Morrisons British Beef Mince 15% Fat  500g',
      'Tesco Beef Steak Mince 15% Fat 500G',
      'Tesco Organic Beef Steak Mince 15% Fat 500G',
      'Morrisons Scotch Beef Mince 15% Fat 500g'
    ],
    fat20: [
      '20% Fat Beef Mince 500g',
      'Iceland Beef Mince 23% Fat 450g',
      'Tesco Beef & Pork Mince 23% Fat 500g',
      "Sainsbury's British or Irish 25% Fat Beef Mince 500g",
      'Morrisons Savers British Pork Mince 20% Fat 500g'
    ]
  },
  chicken: {
    // The corpus holds two organic, three free range and three higher-welfare fresh chicken titles.
    organic: ['Morrisons British Organic Chicken Breast Fillets 480g', 'Tesco Organic 2 Chicken Fillets'],
    free_range: [
      "Sainsbury's 2 British Free Range Chicken Breast Fillets, Taste the Difference (Approx. 310g)",
      'Tesco Finest 2 Cornfed Free Range Chicken Breast Fillets 270G-470G',
      'Free Range Corn-Fed Norfolk Chicken Breast Fillets (Typically 0.35KG)'
    ],
    higher_welfare: [
      'Room to Thrive Chicken Breast Fillets',
      'Room to Thrive Chicken Breast Mini Fillets',
      'Morrisons Space To Roam Extra Tasty Chicken Mini Fillets 305g'
    ],
    standard: [
      'ASDA British Fresh Chicken Breast Fillets 650g',
      'Iceland Chicken Breast Fillets 1.2kg',
      'Morrisons British Chicken Diced Breast Fillets 400g',
      "Sainsbury's 1kg British Fresh Skinless & Boneless Chicken Breast Fillets",
      'Qualiko Frozen Chicken Breast Fillet Boneless & Skinless 1000g'
    ]
  },
  pasta_rice: {
    gluten_free: [
      'Freee Gluten Free Pasta Brown Rice Fusilli 400g',
      'Morrisons Free From Fusilli 500g',
      'Rummo 400g Gluten Free No 48 Fusilli Pasta',
      "Sainsbury's Free From Free from Fusilli Pasta 500g",
      'Tesco Gluten Free Red Lentil Fusilli 250g'
    ],
    microwave: [
      "Ben's Original Basmati Microwave Rice 220g",
      'Bens Original Long Grain Microwave Rice 220g',
      'Basmati Micro Rice 250g',
      'Tilda Boil in Bag Pure Basmati Rice 250g',
      'Tesco Boil In The Bag Basmati Rice 4 X 125G',
      "Sainsbury's Microwave Rice Brown Basmati 250g"
    ],
    wholegrain: [
      'Tesco 100% Wholewheat Fusilli Pasta 500g',
      'Napolina Wholewheat Spaghetti Pasta 500g',
      'Own Brand Wholegrain Brown Rice 1Kg',
      'Basmati Brown Rice 1kg',
      "Sainsbury's Wholewheat Lasagne Sheets Pasta 500g"
    ],
    // Four fresh pasta titles in the corpus.
    fresh: [
      'Tesco Fresh Lasagne Sheets 250G',
      'Tesco Fresh Tagliatelle Nests 300g',
      'Fresh Egg Lasagne Sheets 300g',
      "Sainsbury's Fresh Egg Lasagne Sheets 250g"
    ],
    basmati: [
      'Tesco Basmati Rice 1Kg',
      'Tilda Everyday Basmati Rice 1kg',
      'Laila Basmati Rice 5Kg',
      'Morrisons Easy Cook Basmati Rice',
      'Tesco Organic Basmati Rice 500G'
    ]
  }
};

// The "More categories" block. Same rule: real titles only, shortfalls stated.
Object.assign(REAL_TITLES, {
  fish: {
    coated: [
      'Birds Eye 4 Battered Cod Fillets 400g',
      'Tesco 2 Breaded Chunky Cod Fillets 350G',
      'Tesco Lightly Dusted Cod Fillets 255G',
      'Hearty Food Co. Breaded Cod Fillets 2 Pack 300g',
      'Tesco Battered Cod Fillet Bites 200G'
    ],
    smoked: [
      'Tesco Hot Smoked Salmon Fillets 180G',
      'Leap Wild MSC Sockeye Smoked Salmon 100g',
      'Morrisons The Best Lightly Smoked Scottish Salmon 240g',
      'Morrisons Smoked Salmon Slices',
      'Morrisons Ready To Eat Smoked Salmon Slices'
    ],
    sustainable: [
      "Sainsbury's Skin on ASC Scottish Salmon Fillets x2 240g",
      'Stamford Street Co. ASC Salmon Fillets x2 240g',
      "Sainsbury's 500g Skin on ASC Scottish Salmon Fillet",
      "Sainsbury's King Prawns ASC in Garlic & Parsley ASC 150g",
      "Sainsbury's Lemon & Herb Steamed ASC Scottish Salmon Portions x2 180g (Ready to eat)"
    ],
    wild: [
      'Tesco Finest 2 Wild Caught Sockeye Salmon Fillets 230G',
      'Tesco 4 Wild Salmon Fillets 330G',
      'Leap Wild 220g Keta Salmon Fillets',
      'Morrisons 3 Skin on & Boneless Wild Pink Salmon Fillets 330g',
      'Marvellous Wild Alaskan Salmon Side 600g'
    ]
  },
  cheese: {
    lighter: [
      'Creamfields Lighter Mature Cheese 400G',
      'Cathedral City Lighter Mature Cheddar Cheese 350 G',
      'Cathedral City Mature Lighter Cheddar Cheese 550G',
      "Sainsbury's Lighter Mature Cheese 400g",
      'Iceland British Lighter Mature Cheddar Cheese 400g'
    ],
    grated: [
      'Tesco British Mature Grated Cheddar Cheese 250 G',
      'Creamfields Grated Cheddar 500G',
      'Stamford Street Co. Grated Cheddar 500g',
      "Sainsbury's Grated Cheddar & Mozzarella Mix 250g",
      'Morrisons Savers Grated Mature Cheddar Cheese 250g'
    ],
    extra_mature: [
      'Pilgrims Choice Extra Mature Cheddar Cheese 350 G',
      'Tesco Extra Mature Cheddar 700G',
      'Tesco Finest Vintage Cheddar Cheese 500g',
      'Davidstow Crackler Extra Mature Cornish Cheddar Cheese 320g',
      "Sainsbury's Vintage Reserve Cheddar, Taste the Difference 350g"
    ],
    mature: [
      'Tesco Mature Cheddar 700G',
      'Cathedral City Mature Cheddar Cheese 550 G',
      'Creamfields Mature White Cheddar 400G',
      'Pilgrims Choice Mature Cheddar Cheese 350 G',
      "Sainsbury's British Mature Cheddar Cheese 400g"
    ],
    medium: [
      'Tesco Medium Cheddar 400G',
      "Sainsbury's British Medium Cheddar Cheese 400g",
      'Medium Scottish Coloured Cheddar Cheese 500g',
      'Our Medium Cheddar 350g',
      'Iceland British Medium Cheddar 400g'
    ],
    mild: [
      'Tesco British Mild Cheddar Cheese 400G',
      'Creamfields Mild White Cheddar 400G',
      "Sainsbury's British Mild Cheddar Cheese 400g",
      'Stamford Street Co. Mild Cheddar Slices x10 200g',
      'Our Mild Cheddar 350g'
    ]
  },
  yogurt: {
    // Four plant-based yogurts in the corpus.
    plant: [
      'Alpro Greek Style Plain Dairy Free Yoghurt Alternative 400g',
      'The Coconut Collab Natural Coconut Yoghurt 350g',
      'Alpro No Bits Strawberry-Banana & Peach-Pear Yoghurt Alternative 4x125g',
      'Plant Based High Protein Banana Biscuit Yoghurt Alternative 200g'
    ],
    high_protein: [
      'Arla Skyr Natural Icelandic Style Yogurt 450g',
      'Arla Protein Strawberry Yogurt 200g',
      'Arla Protein 200g Raspberry Yogurt',
      'Skyr High Protein Natural Icelandic Style Yogurt 450g',
      'Skyr High Protein Natural Icelandic Style Yogurt 1kg'
    ],
    fat_free: [
      'Tesco 0% Fat Authentic Greek Yogurt 1kg',
      'ASDA Fat Free Authentic Greek Yogurt 1kg',
      'Morrisons 0% Fat Authentic Greek Strained Yogurt 1kg',
      'Iceland Fat Free Greek Style Yogurt 500g',
      'Fage Total 0% Fat Authentic Greek Yogurt 500g'
    ],
    greek: [
      'Fage Total 5% Authentic Greek Yogurt 500g',
      'Fage Total 2% Authentic Greek Yogurt 500g',
      'ASDA Greek Style Natural Yogurt 1kg',
      'Tesco Greek Style Natural Yogurt 1kg',
      'Brooklea Greek Style Natural Yogurt 1kg'
    ],
    // Four plain natural yogurts outside the Greek and fat-free ranges.
    natural: [
      'Yeo Valley Organic Kefir Natural Yogurt 350g',
      'Yeo Valley Organic Natural Yogurt 450g',
      'Morrisons Low Fat Natural Yogurt',
      'Natural Yogurt 500g'
    ]
  },
  cereal: {
    instant: [
      'Quaker Oat So Simple Original Porridge Sachets 12x27g',
      'Tesco Easy Oats Original Porridge 10 X27g',
      'FUEL10K High Protein Chocolate Porridge Oat Cereal Pot 70g',
      'Golden Syrup Flavour Porridge Sachets 8 x 36g (288g)',
      'Oat So Simple Golden Syrup Porridge Sachets 10x36g'
    ],
    smooth: [
      'Mornflake Mighty Oats Creamy Superfast Oats 1.25kg',
      'Ready Brek Smooth Porridge Oats Original 450g',
      "Sainsbury's Ready Oats 750g",
      'Morrisons Super Smooth Porridge Original Oats',
      'Smooth Porridge Oats Original 750g'
    ],
    organic: [
      'Flahavans Irish Organic Porridge 1Kg',
      'Tesco Organic Oats 750G',
      "Flahavan's Irish Organic Jumbo Oats 1Kg",
      "Sainsbury's Porridge Oats, SO Organic 750g",
      "Flahavan's Organic Porridge Oats 1kg"
    ],
    jumbo: [
      'Quaker Jumbo Porridge Oats 1kg',
      "Sainsbury's 1kg Scottish Whole Rolled Jumbo Oats, Taste the Difference",
      'Quaker Jumbo Porridge Oats',
      'Mornflake Mighty Oats Scottish Jumbo Oats',
      'Jumbo British Porridge Oats 1kg'
    ],
    bran: [
      'Tesco Sultana Bran Cereal 750G',
      "Kellogg's Sultana Bran Breakfast Cereal 500g",
      "Kellogg's Sultana Bran 500g",
      "Sainsbury's Sultana Bran 750g",
      'Sultana Bran 550g'
    ]
  },
  tinned: {
    organic: [
      'Tesco Organic Red Kidney Beans In Water 400G',
      'Tesco Organic Chickpeas In Water 400g',
      'Morrisons Organic Butter Beans In Water 400g',
      'Tesco Organic Italian Chopped Tomatoes 390G',
      'Organic Chickpeas in Brine'
    ],
    in_oil: [
      'Parmentier Sardines in Extra Virgin Olive Oil 135g',
      'John West Anchovy Fillets In Olive Oil 95G',
      "Sainsbury's Mackerel Fillets in Olive Oil 125g (88g*)",
      "Sainsbury's Tuna Chunks in Olive Oil 145g",
      "Sainsbury's Albacore Tuna Steak In Extra Virgin Olive Oil, Taste the Difference 160g"
    ],
    in_brine: [
      'Morrisons Sardines In Brine 120g',
      'Roasted Red Peppers in Brine 480g',
      'Cucumber in Brine 700g',
      'Village Quality Products Chickpeas in Brine 540g',
      'Chickpeas in Brine 540g'
    ],
    in_water: [
      'Tesco Brown Lentils in Water 400g',
      'ASDA Green / Brown Lentils in Water 400g',
      'Napolina Brown Lentils in Water 400g',
      'Growers Harvest New Potatoes In Water 567G',
      'Tesco Butter Beans In Water 400G'
    ]
  },
  // Cross-cutting: rated on top of the item's own category.
  frozen: {
    frozen: [
      'Tesco Frozen Cod Loins 400g',
      'ASDA Extra Large Frozen Atlantic Cod Fillets 800g',
      'Tesco Frozen Chopped Spinach 1kg',
      'Tesco Frozen Broccoli Florets 900G',
      'Iceland Frozen Lean Beef Steak Mince 5% Fat 1kg',
      'Tesco British Frozen Chicken Breast Fillets 1kg'
    ],
    fresh: [
      'Tesco Fresh British Skinless Cod Fillets 280g',
      'Tesco Lean Beef Steak Mince 5% Fat 500g',
      'ASDA British Fresh Chicken Breast Fillets 650g',
      'TESCO BROCCOLI FLORETS 400g',
      "Sainsbury's Skin on ASC Scottish Salmon Fillets x2 240g"
    ]
  },
  produce: {
    organic: [
      'Tesco Organic White Potatoes 1.5Kg',
      'Tesco Fairtrade Organic Bananas 5 Pack',
      'Tesco Organic Broccoli 335G',
      'Morrisons Organic Brown Onions 500g',
      'Fyffes Organic Fairtrade Bananas 6 Pack'
    ],
    prepared: [
      'TESCO BROCCOLI FLORETS 400g',
      'Tesco Carrot Batons 400G',
      'Tesco Sliced Carrots Peeled & Cut 1Kg',
      "Aunt Bessie's Carrot & Swede Mash 500G",
      'Morrisons Shredded Iceberg Lettuce 130g'
    ],
    loose: [
      'Tesco Large Baking Potatoes Loose',
      'Tesco Bananas Loose',
      'Tesco Broccoli Loose',
      'Large Gala Apples Loose Class 1',
      'Tesco Carrots Loose'
    ],
    wonky: [
      'Tesco Perfectly Imperfect Carrots 1.5Kg',
      'Stamford Street Co. Mini Apples x6',
      'Morrisons British Naturally Wonky Potatoes 2.5Kg',
      'Morrisons Wonky Peppers',
      'Morrisons Wonky Carrots 1.45kg'
    ]
  }
});

/** Real titles that share a word with a category but are not in it. */
const NOT_IN_CATEGORY = {
  bread: [
    'Tesco 10 Garlic Bread Slices 260G',
    'Hovis Baking Strong White Bread Flour 1kg',
    'Peter\'s Yard Rosemary & Sea Salt Sourdough Crackers 90g',
    'Morrisons The Best Sourdough Breaded Cod ',
    'Crosta & Mollica Margherita Sourdough Pizza Tomato, Mozzarella & Oregano 403g',
    'Soreen Sliced Fruited Malt Loaf 290g',
    "Sainsbury's Walnut Loaf Cake 306g",
    'Tesco White Wine Vinegar 350Ml',
    'Aspall Classic White Wine Vinegar 350ml',
    // Not in the corpus: the everyday names the spec calls out.
    'Milkybar White Chocolate Bar 90g',
    'HP Brown Sauce 450g'
  ],
  milk: [
    'Cadbury Dark Milk Chocolate Buttons Bag 100G',
    'Moo Milk Banana Flavour British Milk 1 Litre',
    'Yazoo Banana Milk Drink 1L',
    'Cadbury Dairy Milk Mint Ice Cream 4 x 90ml (360ml)'
  ],
  eggs: [
    'Kinder Bueno Chocolate Eggs 80G',
    'Fresh Egg Lasagne Sheets 300g',
    'GARNERS PICKLED EGGS 440g',
    'Market Street 2 Egg Custard Tarts',
    'Iceland 18 (Approx.) Cumberland Mini Savoury Eggs 216g'
  ],
  mince: [
    'Dicksons 2 Minced Beef and Onion Pies',
    'Minced Garlic Paste 210g',
    'Fray Bentos Minced Beef & Onion 425g',
    'Iceland 8 (Approx.) Minced Beef Crispy Pancakes 500g'
  ],
  chicken: [
    'Knorr Chicken Stock Cubes 20 x 10g',
    'Pot Noodle Chicken & Mushroom 4x90g',
    'BAKERS Joint Delicious Large Chicken Dog Chews 240g',
    'Iceland 4 Garlic & Herb Butter Chicken Breast Kievs 500g',
    "Ella's Kitchen Organic Chicken Roast Dinner Baby Food Pouch 7+ Months 130g"
  ],
  fish: [
    'John West Tuna Chunks in Spring Water 4 x 145g',
    "Sainsbury's Tuna Chunks in Olive Oil 145g",
    'PURINA ONE Kitten Mini Fillets Salmon and Chicken Wet Cat Food 8x85g',
    "Ella's Kitchen Organic Fish Pie Baby Food Pouch 7+ Months"
  ],
  cheese: [
    'Heinz Broccoli & Stilton Soup 400G',
    'Cathedral City Mature Cheddar & Mozzarella Breaded Bites 300g',
    'Iceland 6 Garlic & Cheese Slices 200g',
    "Sainsbury's Butternut & Goats Cheese Lasagne, Limited Edition, Taste the Difference 400g"
  ],
  yogurt: [
    'Tesco 5 Banana Bites With A Yogurt Coating 125G',
    'Crucials Yogurt & Mint Sauce 500Ml',
    'Actimel Kids Strawberry Banana Yoghurt Drink Lunchbox Snack 4x100g',
    'Organic Mango & Peach Yoghurt Stage 1 +6m Smooth 100g'
  ],
  cereal: [
    'Eat Natural 3 x 40g Almonds, Cranberries & Coconut Dark Chocolate Cereal Bars',
    'Oatly Oat Drink Barista Edition Long Life 1L',
    'Quaker Blueberry Overnight Oats 350g',
    'Activia Fibre Walnut & Oats Gut Health Breakfast Yoghurt Multipack'
  ],
  tinned: [
    "Sainsbury's Wholemeal Tin Loaf, SO Organic 400g",
    'Tesco Sweet Baby Plum Tomatoes 300g'
  ],
  frozen: [
    'Knorr Chicken Stock Cubes 20 x 10g',
    'John West Tuna Chunks in Spring Water 4 x 145g',
    'Chill Berry Frozen Raspberries in Double Chocolate White + Dark 220g',
    'Heinz Broccoli & Stilton Soup 400G',
    "Ella's Kitchen Organic Chicken Roast Dinner Baby Food Pouch 7+ Months 130g"
  ],
  produce: [
    'Stamford Street Co. Garlic Granules 70g',
    'Tesco 10 Garlic Bread Slices 260G',
    'Baresa Chopped Tomatoes 400g',
    'Heinz Broccoli & Stilton Soup 400G',
    'Del Monte Mandarin Segments in Juice 300g'
  ],
  pasta_rice: [
    'Dolmio Bolognese Onion and Garlic Pasta Sauce 450g',
    'Ambrosia Creamed Rice Sultanas & Nutmeg 400G Tin',
    "Batchelors Pasta 'n' Sauce - Cheese & Broccoli 99g",
    "McDougalls Speciality '00' Extra Fine Pasta Pizza Plain Flour 1kg",
    'Richmond Sausage Pasta Bake with a Rich Tomato & Red Pepper Sauce 400g'
  ]
};

describe('Food type keywords classify real shelf titles', () => {
  for (const [categoryId, types] of Object.entries(REAL_TITLES)) {
    const category = categoryById(categoryId);
    for (const [typeId, titles] of Object.entries(types)) {
      it(`${categoryId}.${typeId}`, () => {
        for (const title of titles) {
          assert.equal(classifyProduct(category, title)?.id, typeId, `"${title}"`);
        }
      });
    }
  }

  it('covers every declared type with at least one real title', () => {
    for (const category of FOOD_CATEGORIES) {
      for (const type of category.types) {
        assert.ok(REAL_TITLES[category.id]?.[type.id]?.length > 0, `${category.id}.${type.id} has no real titles`);
      }
    }
  });
});

describe('Food type keywords reject look-alikes', () => {
  for (const [categoryId, titles] of Object.entries(NOT_IN_CATEGORY)) {
    it(`${categoryId} leaves out products that only share a word`, () => {
      const category = categoryById(categoryId);
      for (const title of titles) {
        assert.equal(classifyProduct(category, title), null, `"${title}" must not be ${categoryId}`);
      }
    });
  }

  it('does not treat white chocolate, wine vinegar or brown sauce as a covered list item', () => {
    for (const text of ['white chocolate', 'white wine vinegar', 'brown sauce', 'sourdough crackers']) {
      assert.equal(coveringCategory(text), null, text);
    }
  });
});

describe('List text', () => {
  it('finds the category a plain list item belongs to', () => {
    assert.equal(coveringCategory('bread')?.id, 'bread');
    assert.equal(coveringCategory('4 pints milk')?.id, 'milk');
    assert.equal(coveringCategory('12 eggs')?.id, 'eggs');
    assert.equal(coveringCategory('500g beef mince')?.id, 'mince');
    assert.equal(coveringCategory('chicken breasts')?.id, 'chicken');
    assert.equal(coveringCategory('basmati rice')?.id, 'pasta_rice');
    assert.equal(coveringCategory('chicken stock cubes'), null);
    assert.equal(coveringCategory('salmon fillets')?.id, 'fish');
    assert.equal(coveringCategory('tinned tuna')?.id, 'tinned', 'tinned fish is rated by what it is packed in');
    assert.equal(coveringCategory('mature cheddar')?.id, 'cheese');
    assert.equal(coveringCategory('greek yogurt')?.id, 'yogurt');
    assert.equal(coveringCategory('porridge oats')?.id, 'cereal');
    assert.equal(coveringCategory('oat milk')?.id, 'milk');
    assert.equal(coveringCategory('chopped tomatoes')?.id, 'tinned');
    assert.equal(coveringCategory('frozen peas')?.id, 'produce');
    assert.equal(coveringCategory('carrots')?.id, 'produce');
  });

  it('adds Frozen or fresh on top of an item\'s own category, never instead of it', () => {
    const ids = (text) => coveringCategories(text).map((c) => c.id);
    assert.deepEqual(ids('frozen peas'), ['produce', 'frozen']);
    assert.deepEqual(ids('cod fillets'), ['fish', 'frozen']);
    assert.deepEqual(ids('500g beef mince'), ['mince', 'frozen']);
    assert.deepEqual(ids('bread'), ['bread']);
    assert.deepEqual(ids('chicken stock cubes'), []);
    assert.equal(coveringCategory('frozen peas')?.id, 'produce');
  });

  it('lets the list name frozen or fresh, but not by leaving it out', () => {
    const frozen = categoryById('frozen');
    assert.equal(namedType(frozen, 'frozen peas')?.id, 'frozen');
    assert.equal(namedType(frozen, 'fresh salmon fillets')?.id, 'fresh');
    assert.equal(namedType(frozen, 'salmon fillets'), null);
  });

  it('reads the frozen flag stores send as a field', () => {
    const frozen = categoryById('frozen');
    const title = productTypeText({ title: 'Tesco Cod Fillets 400g', isFrozen: true });
    assert.equal(classifyProduct(frozen, title)?.id, 'frozen');
  });

  it('recognises a type the list already names, so ratings step aside', () => {
    assert.equal(namedType(categoryById('bread'), 'white bread')?.id, 'white');
    assert.equal(namedType(categoryById('bread'), 'wholemeal bread')?.id, 'wholemeal');
    assert.equal(namedType(categoryById('milk'), 'semi skimmed milk')?.id, 'semi');
    assert.equal(namedType(categoryById('eggs'), 'free range eggs')?.id, 'free_range');
    assert.equal(namedType(categoryById('mince'), '5% beef mince')?.id, 'lean5');
    assert.equal(namedType(categoryById('bread'), 'bread'), null);
    // A catch-all type is not something a list can name.
    assert.equal(namedType(categoryById('eggs'), '12 eggs'), null);
    assert.equal(namedType(categoryById('chicken'), 'chicken breast'), null);
  });
});

describe('Legacy food settings conversion', () => {
  it('maps the old fat preference onto mince bands', () => {
    assert.equal(leanTypeForFat(0), 'lean5');
    assert.equal(leanTypeForFat(5), 'lean5');
    assert.equal(leanTypeForFat(10), 'lean10');
    assert.equal(leanTypeForFat(12), 'lean10');
    assert.equal(leanTypeForFat(15), 'std15');
    assert.equal(leanTypeForFat(20), 'fat20');
  });

  it('gives a fresh install the behaviour of the old defaults', () => {
    assert.deepEqual(DEFAULT_FOOD_RATINGS, {
      bread: { wholemeal: 'love' },
      eggs: { free_range: 'love' },
      chicken: { free_range: 'love' },
      mince: { lean5: 'love' }
    });
  });

  it('converts each flag and keeps unrelated ratings', () => {
    assert.deepEqual(
      ratingsFromLegacy({ preferWholewheat: false, preferFreeRange: false, fatPercentagePreference: 20 }),
      { mince: { fat20: 'love' } }
    );
    const start = { bread: { white: 'never', wholemeal: 'love' }, mince: { lean5: 'love' } };
    assert.deepEqual(applyLegacyFoodKeys(start, { preferWholewheat: false, fatPercentagePreference: 15 }), {
      bread: { white: 'never' },
      mince: { std15: 'love' }
    });
  });

  it('lets scorers read legacy flags only when no ratings are set', () => {
    assert.deepEqual(resolveFoodRatings({ foodRatings: {}, preferWholewheat: true }), {});
    assert.equal(resolveFoodRatings({ preferWholewheat: true }).bread.wholemeal, 'love');
    assert.deepEqual(resolveFoodRatings({}), {});
  });
});

describe('Diet filters are best effort from titles', () => {
  const cases = [
    ['vegetarian', 'Tesco Lean Beef Steak Mince 5% Fat 500g', true],
    ['vegetarian', 'Quorn Vegetarian Mince 300g', false],
    ['vegetarian', 'Tesco British Semi Skimmed Milk 2.272L, 4 Pints', false],
    ['vegan', 'Tesco British Semi Skimmed Milk 2.272L, 4 Pints', true],
    ['vegan', 'Oatly Oat Drink Barista Edition Long Life 1L', false],
    ['vegan', '12 Large Free Range Eggs', true],
    ['vegan', 'Pip & Nut Smooth Almond Butter 170g', false],
    ['dairy_free', 'Alpro 1L Almond No Sugar Chilled Dairy Free Drink', false],
    ['dairy_free', 'Arla Lactofree Mature Cheddar Cheese 200g', true],
    ['gluten_free', 'Tesco Medium Sliced White Bread 800g', true],
    ['gluten_free', 'Promise Gluten Free Multigrain Loaf 480g', false],
    ['gluten_free', 'Tesco Basmati Rice 1Kg', false],
    ['halal', 'Tariq Halal British Beef Mince 500g', false],
    ['halal', 'Tesco Lean Beef Steak Mince 5% Fat 500g', true],
    ['halal', 'Tesco Beef & Pork Mince 23% Fat 500g', true],
    ['halal', 'Tesco Basmati Rice 1Kg', false]
  ];
  for (const [diet, title, violates] of cases) {
    it(`${diet}: ${title} -> ${violates ? 'excluded' : 'allowed'}`, () => {
      assert.equal(violatesDiet(diet, title), violates);
    });
  }
});

describe('Food type definitions', () => {
  it(`keep ids unique and at most ${MAX_TYPES_PER_CATEGORY} types per category`, () => {
    const ids = FOOD_CATEGORIES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const c of FOOD_CATEGORIES) {
      assert.ok(c.types.length <= MAX_TYPES_PER_CATEGORY, c.id);
      assert.equal(new Set(c.types.map((t) => t.id)).size, c.types.length, c.id);
    }
  });
});
