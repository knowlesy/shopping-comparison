/**
 * Food categories, the product types inside them, and the household's Love / OK / Never
 * ratings of those types.
 *
 * Imported by both the Logic-API (scoring, validation, migration) and the client (the
 * settings page and the preview panel), so it must stay dependency-free and pure.
 *
 * How a rating reaches a product:
 *
 *   1. A list item is *covered* by the first category whose `appliesTo` matches its text
 *      and whose `excludes` does not ("white chocolate" is not bread).
 *   2. If the list text already names one of that category's types ("wholemeal bread"),
 *      the list wins and ratings are skipped.
 *   3. Otherwise a product is classified only when its own title is also in the category,
 *      and then by the first type whose `match` hits. Array order is priority.
 *
 * Titles are classified after `ignore` phrases are removed, so "Skimmed Milk, Tastes like
 * Semi Skimmed" is skimmed milk, not semi-skimmed.
 */

export const RATINGS = ['love', 'ok', 'never'];

/** Ranking adjustment per rating. Never is a penalty, not an eligibility filter. */
export const RATING_SCORES = { love: 40, ok: 0, never: -150 };

export const MAX_TYPES_PER_CATEGORY = 6;

/** Reason code set on a match whose chosen product is a type the household rated Never. */
export const ONLY_NEVER_REASON = 'only_never_option';

// Products whose title carries no welfare claim. A negative lookahead so the type can sit
// last in the list and still be rated on its own ("Never: unlabelled eggs").
const NO_WELFARE_LABEL = /^(?!.*\b(?:free[\s-]?range|organic|higher\s+welfare|room\s+to\s+thrive|space\s+to\s+roam|rspca|corn[\s-]?fed)\b)/i;

export const FOOD_CATEGORIES = [
  {
    id: 'bread',
    label: 'Bread',
    common: true,
    appliesTo: /\b(?:bread|loaf|loaves|bloomer|toastie|sourdough)\b/i,
    excludes: /\b(?:flour|garlic|cakes?|fruit(?:ed)?|malt\s+loaf|banana|mix|crackers?|pizza|breaded|crumbs?|sauce|scones?)\b/i,
    types: [
      { id: 'fifty', label: '50/50 mixed', match: /(?:\b50\s*\/\s*50\b|\bbest\s+of\s+both\b|\bhalf\s*(?:&|and)\s*half\b)/i },
      { id: 'wholemeal', label: 'Wholemeal / brown', match: /\b(?:wholemeal|wholewheat|whole\s+wheat|wholegrain|brown)\b/i },
      { id: 'sourdough', label: 'Sourdough', match: /\bsourdough\b/i },
      { id: 'seeded', label: 'Seeded / granary', match: /\b(?:seeded|seeds?|multi[\s-]?seed|granary|multigrain|superseeded)\b/i },
      { id: 'white', label: 'White', match: /\bwhite\b/i }
    ]
  },
  {
    id: 'milk',
    label: 'Milk',
    common: true,
    appliesTo: /\bmilk\b|\b(?:oat|soya|soy|almond|coconut|rice|dairy(?:[\s-]?free)?)\s+drink\b/i,
    excludes: /\b(?:chocolate|choc|buttons|ice\s*cream|milkshake|banana|strawberry|flavou?r(?:ed)?|coconut\s+milk|condensed|evaporated|powder(?:ed)?|biscuits?|yog(?:h)?urt|kefir|cocoa|cheese)\b/i,
    ignore: /\btastes?\s+like\s+(?:semi[\s-]?skimmed|skimmed|whole)\b/gi,
    types: [
      { id: 'plant', label: 'Plant (oat, soya, almond…)', match: /\b(?:oat|soya|soy|almond|coconut|rice|hazelnut|cashew)\b|\bplant[\s-]?based\b/i },
      { id: 'lactose_free', label: 'Lactose-free', match: /\blact(?:o|ose)[\s-]?free\b/i },
      { id: 'semi', label: 'Semi-skimmed', match: /\bsemi[\s-]?skimmed\b/i },
      { id: 'skimmed', label: 'Skimmed', match: /\bskimmed\b/i },
      { id: 'whole', label: 'Whole', match: /\bwhole\b|\bfull[\s-]?fat\b/i }
    ]
  },
  {
    id: 'eggs',
    label: 'Eggs',
    common: true,
    appliesTo: /\beggs?\b/i,
    excludes: /\b(?:chocolate|choc|easter|surprise|kinder|creme|lasagne|pasta|noodles?|custard|pickled|scotch|savoury|mayo(?:nnaise)?|powder|dino|fried\s+rice|lindor)\b/i,
    types: [
      { id: 'organic', label: 'Organic', match: /\borganic\b/i },
      { id: 'free_range', label: 'Free range', match: /\bfree[\s-]?range\b/i },
      { id: 'unlabelled', label: 'Not free range (barn / unlabelled)', match: NO_WELFARE_LABEL }
    ]
  },
  {
    id: 'mince',
    label: 'Mince',
    common: true,
    appliesTo: /\bmince\b|\bminced\s+(?:beef|pork|lamb|turkey|chicken)\b/i,
    excludes: /\b(?:pies?|pasties|puddings?|slices?|pancakes|hot\s*pot|hotpot|onion|garlic|meat[\s-]?free|quorn|vegetarian|vegan|plant|meal|meatballs?)\b/i,
    // Bands follow UK labelling, where "12% Lean" on a pack means 12% fat.
    types: [
      { id: 'lean5', label: 'Up to 5% fat', match: /\b[0-5](?:\.\d)?\s*%|\bextra\s+lean\b/i },
      { id: 'lean10', label: 'About 10% fat (6–12%)', match: /\b(?:[6-9]|1[0-2])(?:\.\d)?\s*%/i },
      { id: 'std15', label: 'About 15% fat (13–15%)', match: /\b1[3-5](?:\.\d)?\s*%/i },
      { id: 'fat20', label: '20% fat or more', match: /\b(?:1[6-9]|[2-4]\d)(?:\.\d)?\s*%/i }
    ]
  },
  {
    id: 'chicken',
    label: 'Chicken',
    common: true,
    appliesTo: /\bchicken\b/i,
    excludes: /\b(?:stock|stockpot|gravy|soup|noodles?|nuggets?|dippers|kievs?|pies?|slices?|sandwich|wraps?|pizza|pasta|flavou?r|seasoning|crisps|dog|cat|chews|baby|pouch|months|casserole|meal|roll|korma|tikka|curry|battered|breaded|crispy|southern\s+fried|takeaway|skewers|mushroom|broth|dinner|kiev|breasteaks)\b/i,
    types: [
      { id: 'organic', label: 'Organic', match: /\borganic\b/i },
      { id: 'free_range', label: 'Free range', match: /\bfree[\s-]?range\b/i },
      {
        id: 'higher_welfare',
        label: 'Higher welfare / corn-fed',
        match: /\b(?:rspca|higher\s+welfare|room\s+to\s+thrive|space\s+to\s+roam|outdoor\s+(?:bred|reared)|corn[\s-]?fed)\b/i
      },
      { id: 'standard', label: 'Standard (no welfare label)', match: NO_WELFARE_LABEL }
    ]
  },
  {
    id: 'pasta_rice',
    label: 'Pasta & rice',
    common: true,
    appliesTo: /\b(?:pasta|spaghetti|penne|fusilli|linguine|tagliatelle|macaroni|farfalle|rigatoni|conchiglie|spirali|lasagne|rice)\b/i,
    excludes: /\b(?:sauce|pots?|sachet|meal|bake|salad|baby|months|toddler|jar|pudding|creamed|cakes?|krispies|noodles?|flour|dressing|casserole|with|pesto|cheese|tomato|chicken|carbonara|meatballs?|chorizo|mushroom|veggie|steam\s+bags?|dog|ragu\s+with)\b/i,
    types: [
      { id: 'gluten_free', label: 'Gluten-free / free from', match: /\bgluten[\s-]?free\b|\bfree\s+from\b/i },
      { id: 'microwave', label: 'Microwave / boil-in-bag', match: /\b(?:microwave|micro|boil[\s-]+in[\s-]+(?:the[\s-]+)?bag|pouch|express)\b/i },
      { id: 'wholegrain', label: 'Wholewheat / brown', match: /\b(?:wholewheat|whole\s+wheat|wholemeal|wholegrain|brown)\b/i },
      { id: 'fresh', label: 'Fresh pasta', match: /\bfresh\b/i },
      { id: 'basmati', label: 'Basmati', match: /\bbasmati\b/i }
    ]
  },
  {
    id: 'fish',
    label: 'Fish',
    common: false,
    appliesTo: /\b(?:salmon|cod|haddock|tuna|mackerel|basa|pollock|pollack|hake|plaice|sea\s*bass|seabass|trout|sardines?|prawns?|fish)\b/i,
    // Tinned fish is rated under Tinned, by what it is packed in.
    excludes: /\b(?:tins?|tinned|cans?|canned|in\s+(?:spring\s+)?water|in\s+brine|in\s+(?:sunflower|olive|vegetable|rapeseed)\s+oil|olive\s+oil|sauce|pies?|p[aâ]t[eé]|paste|sushi|cat|kitten|dog|capsules|liver|crisps|soup|sandwich|stock)\b/i,
    types: [
      { id: 'coated', label: 'Breaded / battered', match: /\b(?:breaded|battered|crumb(?:ed)?|coated|dusted|goujons|tempura|fingers?|fish\s*cakes?|fishcakes?)\b/i },
      { id: 'smoked', label: 'Smoked', match: /\bsmoked\b/i },
      { id: 'sustainable', label: 'MSC / ASC certified', match: /\b(?:msc|asc)\b|\bresponsibly\s+sourced\b/i },
      { id: 'wild', label: 'Wild caught', match: /\bwild\b/i }
    ]
  },
  {
    id: 'cheese',
    label: 'Cheese',
    common: false,
    appliesTo: /\b(?:cheddar|cheese|red\s+leicester|double\s+gloucester|mozzarella|edam|gouda|parmesan|halloumi|feta|brie|stilton)\b/i,
    excludes: /\b(?:bites|crackers?|biscuits?|sauce|pizza|toastie|straws|twists|scones?|puffs|garlic|onion|macaroni|mac|crisps|dippers|burgers?|spread|cakes?|cheesecake|quiche|pasta|sandwich|filled|bread|soups?|escalopes|parcels|salad|lasagne|mash|grapes?|apples?|chickpeas)\b/i,
    types: [
      { id: 'lighter', label: 'Lighter / reduced fat', match: /\b(?:lighter|light|reduced\s+fat|less\s+fat)\b/i },
      { id: 'grated', label: 'Grated', match: /\bgrated\b/i },
      { id: 'extra_mature', label: 'Extra mature / vintage', match: /\b(?:extra\s+mature|vintage|extra\s+strong|seriously\s+strong)\b/i },
      { id: 'mature', label: 'Mature', match: /\bmature\b/i },
      { id: 'medium', label: 'Medium', match: /\bmedium\b/i },
      { id: 'mild', label: 'Mild', match: /\bmild\b/i }
    ]
  },
  {
    id: 'yogurt',
    label: 'Yogurt',
    common: false,
    appliesTo: /\byog(?:h)?urts?\b|\bskyr\b/i,
    excludes: /\b(?:drinks?|pouch|kids|baby|months|stage|coated|coating|raisins|bars?|granola|muesli|frozen|tzatziki|dressing|sauce|mint|cakes?|actimel|corner|cheesecake|breakfast|sippers|flips|squeezies|little\s+yeos)\b/i,
    types: [
      { id: 'plant', label: 'Plant-based', match: /\b(?:dairy[\s-]?free|plant[\s-]?based|alternative|alpro|soya|oatly)\b|\bcoconut\s+yog(?:h)?urt\b/i },
      { id: 'high_protein', label: 'High protein / skyr', match: /\b(?:protein|skyr)\b/i },
      { id: 'fat_free', label: 'Fat-free (0%)', match: /(?:^|[^\d.])0\s*%|\bfat[\s-]?free\b|\blight\s*&\s*free\b/i },
      { id: 'greek', label: 'Greek / Greek style', match: /\bgreek\b/i },
      { id: 'natural', label: 'Natural / plain', match: /\b(?:natural|plain)\b/i }
    ]
  },
  {
    id: 'cereal',
    label: 'Cereal',
    common: false,
    appliesTo: /\b(?:cereal|oats|porridge|porage|granola|muesli|weetabix|cornflakes|bran|shredded\s+wheat|shreddies|cheerios|ready\s+brek)\b/i,
    excludes: /\b(?:bars?|yog(?:h)?urts?|months|baby|stage|biscuits?|flapjacks?|milk|cookies?|drinks?|overnight)\b/i,
    types: [
      { id: 'instant', label: 'Sachets / pots', match: /\b(?:sachets?|pots?|oat\s+so\s+simple|easy\s+oats|ready\s+to\s+eat)\b/i },
      { id: 'smooth', label: 'Smooth / quick oats', match: /\b(?:smooth|superfast|quick|ready\s+brek|ready\s+oats)\b/i },
      { id: 'organic', label: 'Organic', match: /\borganic\b/i },
      { id: 'jumbo', label: 'Jumbo oats', match: /\bjumbo\b/i },
      { id: 'bran', label: 'Bran / high fibre', match: /\b(?:bran|fibre)\b/i }
    ]
  },
  {
    id: 'tinned',
    label: 'Tinned',
    common: false,
    appliesTo: /\b(?:tins?|tinned|cans?|canned|chopped\s+tomatoes)\b|\bin\s+(?:spring\s+)?water\b|\bin\s+brine\b|\bin\s+(?:extra\s+virgin\s+)?(?:sunflower|olive|vegetable|rapeseed)\s+oil\b/i,
    excludes: /\b(?:loaf|bread|cat|kitten|dog|paint|opener)\b/i,
    types: [
      { id: 'organic', label: 'Organic', match: /\borganic\b/i },
      { id: 'in_oil', label: 'In oil', match: /\bin\s+(?:extra\s+virgin\s+)?(?:sunflower|olive|vegetable|rapeseed)\s+oil\b|\bin\s+oil\b/i },
      { id: 'in_brine', label: 'In brine', match: /\bin\s+brine\b/i },
      { id: 'in_water', label: 'In water', match: /\bin\s+(?:spring\s+)?water\b/i }
    ]
  },
  {
    id: 'produce',
    label: 'Fruit & veg',
    common: false,
    appliesTo: /\b(?:apples?|bananas?|pears?|oranges?|clementines|satsumas|easy\s+peelers|grapes|strawberries|blueberries|raspberries|lemons?|limes?|avocados?|melons?|pineapples?|mangoes|mangos?|kiwis?|carrots?|potato(?:es)?|onions?|garlic|broccoli|cauliflower|cabbage|spinach|lettuce|cucumbers?|tomato(?:es)?|peppers?|mushrooms?|courgettes?|aubergines?|leeks?|parsnips?|swede|celery|sweetcorn|peas|green\s+beans|kale|sprouts|beetroot|salad)\b/i,
    excludes: /\b(?:crisps|juice|soup|sauce|pies?|cakes?|months|baby|stage|yog(?:h)?urts?|chocolate|ketchup|chutney|pizza|jam|seeds?|smoothie|drinks?|pur[eé]e|tins?|tinned|canned|in\s+(?:water|juice|syrup|brine)|dried|flavou?r(?:ed)?|pickled|paste|passata|granules|powder|stuffing|quiche|rings|chips|wedges|hash\s+browns|bread|naan|chopped\s+tomatoes|salad\s+cream|dressing|oil)\b/i,
    types: [
      { id: 'organic', label: 'Organic', match: /\borganic\b/i },
      { id: 'prepared', label: 'Prepared (chopped, sliced…)', match: /\b(?:prepared|chopped|sliced|diced|spiralised|florets|batons|peeled|mash|shredded|stir[\s-]?fry|ready\s+to\s+(?:eat|cook))\b/i },
      { id: 'loose', label: 'Loose', match: /\bloose\b/i },
      { id: 'wonky', label: 'Wonky / value range', match: /\b(?:wonky|imperfect|savers|just\s+essentials|everyday\s+essentials|stamford\s+street|growers?\s+harvest|redmere)\b/i }
    ]
  },
  {
    // Frozen is often the cheaper way to buy the same food, and it cuts across fish, meat
    // and fruit & veg. So this category is rated *alongside* an item's own category
    // rather than instead of it: "frozen peas" is still Fruit & veg.
    id: 'frozen',
    label: 'Frozen or fresh',
    common: false,
    crossCutting: true,
    description: 'Applies to fish, meat, and fruit & veg on top of their own ratings. Love Frozen to let a cheaper frozen pack win.',
    appliesTo: /\b(?:peas|sweetcorn|spinach|broccoli|cauliflower|green\s+beans|carrots?|mixed\s+veg(?:etables)?|vegetables|berries|strawberries|raspberries|blueberries|mango(?:es)?|salmon|cod|haddock|pollock|basa|hake|prawns?|fish|chicken|mince|beef|pork|lamb|turkey|sausages?|burgers?)\b/i,
    excludes: /\b(?:tins?|tinned|cans?|canned|in\s+(?:spring\s+)?water|in\s+brine|in\s+(?:sunflower|olive|vegetable|rapeseed)\s+oil|stock|gravy|soup|sauce|crisps|pies?|juice|jam|yog(?:h)?urts?|ice\s*cream|chocolate|flavou?r(?:ed)?|baby|months|pouch|dog|cat|kitten|chews|dried|smoothie|seeds?)\b/i,
    types: [
      { id: 'frozen', label: 'Frozen', match: /\bfrozen\b/i },
      // Anything not labelled frozen. A list names it only by saying "fresh".
      { id: 'fresh', label: 'Fresh (chilled)', match: /^(?!.*\bfrozen\b)/i, named: /\bfresh\b/i }
    ]
  }
];

export const DIETS = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gluten_free', label: 'Gluten-free' },
  { id: 'dairy_free', label: 'Dairy-free' },
  { id: 'halal', label: 'Halal' }
];
export const DIET_IDS = DIETS.map((d) => d.id);

const MEAT_FISH = /\b(?:beef|pork|lamb|mutton|chicken|turkey|duck|goose|veal|venison|bacon|ham|gammon|sausages?|salami|chorizo|pepperoni|prosciutto|pancetta|mince|steaks?|burgers?|meatballs?|fish|cod|haddock|salmon|tuna|mackerel|sardines?|anchov(?:y|ies)|prawns?|shrimps?|crab|lobster|mussels?|squid|scampi|gelatine|gelatin|lard|suet|meat)\b/i;
const MEAT_FREE = /\b(?:vegetarian|vegan|meat[\s-]?free|plant[\s-]?based|meatless|quorn|veggie|vegetable\s+suet)\b/i;
const DAIRY = /\b(?:milk|cheese|butter|cream|yog(?:h)?urt|whey|ghee|custard|cr[eè]me\s+fra[iî]che|mozzarella|cheddar|parmesan|feta|halloumi|dairy)\b/i;
const DAIRY_FREE = /\b(?:vegan|plant[\s-]?based|dairy[\s-]?free|milk[\s-]?free)\b|\b(?:oat|soya|soy|almond|coconut|rice|cashew|hazelnut|pea)\s+(?:milk|drink|yog(?:h)?urt|cream|butter|spread)\b|\b(?:peanut|nut|almond|cashew|cocoa|shea)\s+butter\b|\bbutter\s*beans?\b/i;
const ANIMAL_NON_DAIRY = /\b(?:eggs?|honey|mayonnaise|mayo)\b/i;
const GLUTEN = /\b(?:wheat|bread|flour|pasta|spaghetti|penne|fusilli|linguine|tagliatelle|macaroni|lasagne|couscous|bulgur|barley|rye|spelt|semolina|noodles?|biscuits?|crackers?|cakes?|pastry|pizza|wraps?|tortillas?|pitta|naan|bagels?|croissants?|crumpets?|muffins?|breaded|battered|beer|malt|seitan|cereal|oats?)\b/i;
const GLUTEN_FREE = /\bgluten[\s-]?free\b|\bgf\b/i;
const NOT_HALAL = /\b(?:pork|bacon|ham|gammon|lard|gelatine|gelatin|pancetta|prosciutto|chorizo|salami|pepperoni|wine|beer|cider|rum|brandy|whisky|vodka)\b/i;
const HALAL_MEAT = /\b(?:beef|lamb|mutton|chicken|turkey|goat|veal|duck|mince|steaks?|sausages?|burgers?)\b/i;

/**
 * Best effort, from the product title only. A title that does not mention an ingredient
 * says nothing about whether the product contains it, so this never claims safety.
 */
export function violatesDiet(dietId, title) {
  const text = String(title || '');
  switch (dietId) {
    case 'vegetarian':
      return MEAT_FISH.test(text) && !MEAT_FREE.test(text);
    case 'vegan':
      if (/\bvegan\b/i.test(text)) return false;
      return (
        (MEAT_FISH.test(text) && !MEAT_FREE.test(text)) ||
        (DAIRY.test(text) && !DAIRY_FREE.test(text)) ||
        ANIMAL_NON_DAIRY.test(text)
      );
    case 'dairy_free':
      return DAIRY.test(text) && !DAIRY_FREE.test(text);
    case 'gluten_free':
      return GLUTEN.test(text) && !GLUTEN_FREE.test(text);
    case 'halal':
      if (NOT_HALAL.test(text)) return true;
      return HALAL_MEAT.test(text) && !/\bhalal\b/i.test(text) && !MEAT_FREE.test(text);
    default:
      return false;
  }
}

export function categoryById(id) {
  return FOOD_CATEGORIES.find((c) => c.id === id) || null;
}

function stripIgnored(category, text) {
  const value = String(text || '');
  return category.ignore ? value.replace(category.ignore, ' ') : value;
}

/** True when `text` is in the category: it matches `appliesTo` and not `excludes`. */
export function inCategory(category, text) {
  const value = String(text || '');
  return category.appliesTo.test(value) && !(category.excludes && category.excludes.test(value));
}

/** The first ordinary category covering this text, or null. */
export function coveringCategory(text) {
  return FOOD_CATEGORIES.find((c) => !c.crossCutting && inCategory(c, text)) || null;
}

/**
 * Every category whose rating applies to this text: its ordinary category, if any, then
 * each cross-cutting one (Frozen or fresh) that also covers it.
 */
export function coveringCategories(text) {
  const primary = coveringCategory(text);
  const cross = FOOD_CATEGORIES.filter((c) => c.crossCutting && inCategory(c, text));
  return primary ? [primary, ...cross] : cross;
}

/** The text a product is classified by: its title plus the attributes stores send as fields. */
export function productTypeText(product) {
  const parts = [product?.title || ''];
  if (product?.fatPercentage !== undefined && product?.fatPercentage !== null) parts.push(`${product.fatPercentage}% fat`);
  if (product?.isFrozen) parts.push('frozen');
  return parts.join(' ');
}

/** The first type of `category` whose pattern matches `text`, or null. */
export function classifyType(category, text) {
  const value = stripIgnored(category, text);
  return category.types.find((t) => t.match.test(value)) || null;
}

/**
 * The type a list item already names, if any. A type with a `named` pattern is named by
 * that ("fresh salmon"); catch-all types (no welfare label) cannot be named, so "eggs"
 * names nothing.
 */
export function namedType(category, itemText) {
  const value = stripIgnored(category, itemText);
  return (
    category.types.find((t) => {
      const pattern = 'named' in t ? t.named : t.match === NO_WELFARE_LABEL ? null : t.match;
      return Boolean(pattern && pattern.test(value));
    }) || null
  );
}

/** A product title's category type, if the title is in that category at all. */
export function classifyProduct(category, title) {
  if (!inCategory(category, title)) return null;
  return classifyType(category, title);
}

export function ratingOf(ratings, categoryId, typeId) {
  const value = ratings?.[categoryId]?.[typeId];
  return value === 'love' || value === 'never' ? value : 'ok';
}

/** Mince fat band for a legacy `fatPercentagePreference` value. */
export function leanTypeForFat(fat) {
  const n = Number(fat);
  if (!Number.isFinite(n) || n <= 5) return 'lean5';
  if (n <= 12) return 'lean10';
  if (n <= 15) return 'std15';
  return 'fat20';
}

export const LEGACY_FOOD_KEYS = ['preferWholewheat', 'preferFreeRange', 'fatPercentagePreference'];

// The values an old install ran with when a key was never written.
const LEGACY_DEFAULTS = { preferWholewheat: true, preferFreeRange: true, fatPercentagePreference: 5, healthierDefault: true };

function setRating(ratings, categoryId, typeId, rating) {
  const next = { ...ratings, [categoryId]: { ...(ratings[categoryId] || {}) } };
  if (rating === 'ok') delete next[categoryId][typeId];
  else next[categoryId][typeId] = rating;
  if (Object.keys(next[categoryId]).length === 0) delete next[categoryId];
  return next;
}

/**
 * Apply the legacy flat food settings present in `legacy` on top of `ratings`.
 * Only keys actually present are applied, so a patch naming one legacy key changes one
 * thing. `healthierDefault` gates the mince band, as it gated the old fat preference.
 */
export function applyLegacyFoodKeys(ratings, legacy) {
  let next = { ...(ratings || {}) };
  if ('preferWholewheat' in legacy) {
    next = setRating(next, 'bread', 'wholemeal', legacy.preferWholewheat ? 'love' : 'ok');
  }
  if ('preferFreeRange' in legacy) {
    const rating = legacy.preferFreeRange ? 'love' : 'ok';
    next = setRating(next, 'eggs', 'free_range', rating);
    next = setRating(next, 'chicken', 'free_range', rating);
  }
  if ('fatPercentagePreference' in legacy) {
    for (const t of categoryById('mince').types) {
      if (next.mince?.[t.id] === 'love') next = setRating(next, 'mince', t.id, 'ok');
    }
    if (legacy.healthierDefault !== false) {
      next = setRating(next, 'mince', leanTypeForFat(legacy.fatPercentagePreference), 'love');
    }
  }
  return next;
}

/** Ratings for a settings object written before food ratings existed. */
export function ratingsFromLegacy(settings = {}) {
  const legacy = { ...LEGACY_DEFAULTS };
  for (const key of [...LEGACY_FOOD_KEYS, 'healthierDefault']) {
    if (settings[key] !== undefined) legacy[key] = settings[key];
  }
  return applyLegacyFoodKeys({}, legacy);
}

/** What a fresh install starts with: the behaviour the old defaults gave. */
export const DEFAULT_FOOD_RATINGS = ratingsFromLegacy({});

/**
 * The ratings a scorer should use: `foodRatings` when set, otherwise converted from any
 * legacy keys, otherwise none. Scripts and older callers still pass the flat keys.
 */
export function resolveFoodRatings(preferences = {}) {
  if (preferences && typeof preferences.foodRatings === 'object' && preferences.foodRatings !== null) {
    return preferences.foodRatings;
  }
  const hasLegacy = LEGACY_FOOD_KEYS.some((k) => preferences?.[k] !== undefined);
  return hasLegacy ? ratingsFromLegacy(preferences) : {};
}

/** @returns {string|null} a problem description, or null when valid. */
export function validateFoodRatings(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'must be an object';
  for (const [categoryId, types] of Object.entries(value)) {
    const category = categoryById(categoryId);
    if (!category) return `has unknown category: ${categoryId}`;
    if (typeof types !== 'object' || types === null || Array.isArray(types)) {
      return `.${categoryId} must be an object`;
    }
    for (const [typeId, rating] of Object.entries(types)) {
      if (!category.types.some((t) => t.id === typeId)) return `.${categoryId} has unknown type: ${typeId}`;
      if (rating !== 'love' && rating !== 'never') {
        return `.${categoryId}.${typeId} must be "love" or "never" (leave a type out for OK)`;
      }
    }
  }
  return null;
}

/** @returns {string|null} a problem description, or null when valid. */
export function validateDiet(value) {
  if (!Array.isArray(value)) return 'must be an array';
  for (const entry of value) {
    if (!DIET_IDS.includes(entry)) return `has unknown diet: ${entry}. Known: ${DIET_IDS.join(', ')}`;
  }
  if (new Set(value).size !== value.length) return 'must not repeat a diet';
  return null;
}
