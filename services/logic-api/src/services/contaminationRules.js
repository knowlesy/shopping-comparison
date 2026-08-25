/**
 * Data-driven food form contamination rules table.
 * Maps query categories to exclusion patterns.
 */
export const CONTAMINATION_RULES = [
  {
    category: 'eggs',
    matchQuery: (q) =>
      /\b(?:egg|eggs)\b/i.test(q) && !/\b(?:scotch|mayo|salad in mayo|custard|noodle)\b/i.test(q),
    prohibited:
      /\b(?:scotch|mayo|salad in mayo|mayonnaise|custard|creme egg|easter|chocolate egg|noodles?|sandwich|fried egg sweets|sweets)\b/i
  },
  {
    category: 'potatoes',
    matchQuery: (q) =>
      /\b(?:potato|potatoes)\b/i.test(q) && !/\b(?:crisp|crisps|chip|chips|waffle)\b/i.test(q),
    prohibited:
      /\b(?:crisps?|chips?|waffles?|croquettes?|salad in mayo|mayonnaise|ready meal|snack)\b/i
  },
  {
    category: 'milk',
    matchQuery: (q) =>
      /\b(?:milk)\b/i.test(q) &&
      !/\b(?:chocolate|milkshake|condensed|evaporated|powder)\b/i.test(q),
    prohibited: /\b(?:chocolate milk|milkshake|condensed|evaporated|powder|powdered|flavoured)\b/i
  },
  {
    category: 'yogurt',
    matchQuery: (q) => /\b(?:yogurt|yoghurt|authentic greek)\b/i.test(q),
    prohibited: /\b(?:drink|corner|split pot|frubes|munch bunch|dessert|custard)\b/i
  },
  {
    category: 'raw-meat',
    matchQuery: (q) =>
      /\b(?:mince|steak|beef|chicken|pork|lamb|turkey|breast|fillet)\b/i.test(q) &&
      !/\b(?:canned|tinned|gravy|pie|stew|meal)\b/i.test(q),
    prohibited:
      /\b(?:in gravy|& gravy|and gravy|& onions|and onions|canned|tinned|pie filling|pie\b|cat food|dog food|pet food)\b/i
  },
  {
    category: 'garlic',
    matchQuery: (q) =>
      /\b(?:garlic|garlic bulb|cloves of garlic)\b/i.test(q) &&
      !/\b(?:bread|baguette|butter|sauce|dip)\b/i.test(q),
    prohibited:
      /\b(?:garlic bread|baguette|garlic doughballs?|garlic mayonnaise|garlic sauce|garlic dip|garlic butter|crisps)\b/i
  },
  {
    category: 'spinach',
    matchQuery: (q) =>
      /\b(?:spinach|baby spinach|spinach leaves)\b/i.test(q) &&
      !/\b(?:pasta|pie|bake|soup)\b/i.test(q),
    prohibited: /\b(?:pasta bake|lasagne|ricotta tortelloni|spinach.*pie|spinach soup|dip)\b/i
  }
];

/**
 * Checks if a product title is contaminated for a given user query.
 * @param {string} query - The search query / item name
 * @param {string} productTitle - The title of the product candidate
 * @returns {boolean} true if contaminated/prohibited, false otherwise
 */
export function isContaminated(query, productTitle) {
  if (!query || !productTitle) return false;
  const qLower = String(query).toLowerCase();
  const tLower = String(productTitle).toLowerCase();

  for (const rule of CONTAMINATION_RULES) {
    if (rule.matchQuery(qLower)) {
      if (rule.prohibited.test(tLower)) {
        return true;
      }
    }
  }
  return false;
}
