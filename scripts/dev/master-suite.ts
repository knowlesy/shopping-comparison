import { ShoppingListParser } from '../server/src/services/parser.js';
import { SupermarketComparisonService } from '../server/src/services/supermarketService.js';
import { DatabaseService } from '../server/src/services/db.js';
import { CATALOG_PRODUCTS, SUPERMARKETS_INFO, DEFAULT_INGREDIENT_IDEAS } from '../server/src/services/catalogData.js';
import { ParsedItem, UserPreferences, SupermarketName } from '../server/src/types.js';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  details?: string;
  durationMs: number;
}

const results: TestResult[] = [];

function assert(condition: boolean, suite: string, name: string, details?: string) {
  const start = Date.now();
  results.push({
    suite,
    name,
    passed: Boolean(condition),
    details,
    durationMs: Date.now() - start,
  });
  if (!condition) {
    console.error(`  ❌ FAIL: [${suite}] ${name}${details ? ` -> ${details}` : ''}`);
  } else {
    console.log(`  ✅ PASS: [${suite}] ${name}`);
  }
}

async function runMasterTestSuite() {
  console.log('═════════════════════════════════════════════════════════════════════');
  console.log('       🛒 SHOPPINGWISE UK — FULL MASTER TEST SUITE (A TO Z)          ');
  console.log('═════════════════════════════════════════════════════════════════════\n');

  // ==========================================
  // SUITE 1: NLP & SHOPPING LIST PARSER
  // ==========================================
  console.log('📦 SUITE 1: Natural Language Processing & Shopping List Parser');
  
  // 1.1 Simple item
  const p1 = ShoppingListParser.parseLine('1kg carrots');
  assert(p1.targetQuantity === 1 && p1.unit === 'kg' && p1.baseItem === 'carrots', 'Parser', 'Parse standard quantity & unit (1kg carrots)');

  // 1.2 Compound Multiplier
  const p2 = ShoppingListParser.parseLine('3 x 400g Mutti Polpa chopped tomatoes');
  assert(p2.multiplier === 3 && p2.targetQuantity === 1200 && p2.unit === 'g' && p2.brandPreference === 'Mutti Polpa', 'Parser', 'Parse multiplier & brand (3 x 400g Mutti Polpa)');

  // 1.3 Dietary health attributes: 5% lean beef mince
  const p3 = ShoppingListParser.parseLine('900g 5% lean beef mince');
  assert(p3.fatPercentage === 5 && p3.isHealthierPreferred === true && p3.category === 'meat', 'Parser', 'Parse fat percentage & healthy preference (900g 5% lean)');

  // 1.4 Wholewheat and Greek Yogurt
  const p4 = ShoppingListParser.parseLine('1kg authentic Greek yogurt 0%');
  assert(p4.fatPercentage === 0 && p4.category === 'dairy-eggs', 'Parser', 'Parse 0% Greek yogurt');

  const p5 = ShoppingListParser.parseLine('1kg wholewheat fusilli');
  assert(p5.isWholewheat === true && p5.category === 'pantry', 'Parser', 'Parse wholewheat tag and pasta category');

  // 1.5 Liquid volumes
  const p6 = ShoppingListParser.parseLine('1.13L semi-skimmed milk');
  assert(p6.targetQuantity === 1.13 && p6.unit === 'l' && p6.category === 'dairy-eggs', 'Parser', 'Parse decimal volume (1.13L semi-skimmed milk)');

  const p7 = ShoppingListParser.parseLine('500ml extra virgin olive oil');
  assert(p7.targetQuantity === 500 && p7.unit === 'ml' && p7.category === 'pantry', 'Parser', 'Parse ml volume (500ml olive oil)');

  // 1.6 Produce units: heads, bunches, bulbs, packs
  const p8 = ShoppingListParser.parseLine('1 head celery');
  assert(p8.targetQuantity === 1 && p8.unit === 'head', 'Parser', 'Parse head unit (1 head celery)');

  const p9 = ShoppingListParser.parseLine('1 bunch bananas');
  assert(p9.targetQuantity === 1 && p9.unit === 'bunch', 'Parser', 'Parse bunch unit (1 bunch bananas)');

  const p10 = ShoppingListParser.parseLine('1 pack garlic bulbs');
  assert(p10.targetQuantity === 1 && p10.unit === 'pack', 'Parser', 'Parse pack unit (1 pack garlic bulbs)');

  // 1.7 Free range eggs
  const p11 = ShoppingListParser.parseLine('15 free range eggs');
  assert(p11.targetQuantity === 15 && p11.isFreeRange === true, 'Parser', 'Parse free range eggs');

  // 1.8 Bullet points, checkbox prefixes, numbered prefixes
  const p12 = ShoppingListParser.parseLine('1. 800g wholemeal sliced bread');
  assert(p12.targetQuantity === 800 && p12.unit === 'g' && p12.isWholewheat === true, 'Parser', 'Strip numbered prefix ("1. ") correctly');

  const p13 = ShoppingListParser.parseLine('- [x] 240g fresh baby spinach');
  assert(p13.targetQuantity === 240 && p13.unit === 'g', 'Parser', 'Strip markdown checkbox prefix ("- [x] ") correctly');

  // 1.9 Parse full 28-item example text
  const SAMPLE_LIST = `900g 5% lean beef mince
1.6kg frozen cod loins
15 free range eggs
1kg authentic Greek yogurt 0%
800g tinned brown lentils
1.13L semi-skimmed milk
1kg wholewheat fusilli
2kg baby new potatoes
1kg Scottish rolled oats
800g wholemeal sliced bread
3 x 400g Mutti Polpa chopped tomatoes
200g tomato puree
500ml extra virgin olive oil
1kg courgettes
1kg mixed bell peppers
400g closed cup mushrooms
600g baby plum tomatoes
1kg carrots
1 head celery
1kg brown onions
1kg red onions
1 pack garlic bulbs
240g fresh baby spinach
1 bunch bananas
800g conference pears
600g clementines
200g walnut halves and whole almonds
150g chia seeds`;

  const parsedAll = ShoppingListParser.parse(SAMPLE_LIST);
  assert(parsedAll.length === 28, 'Parser', 'Parse full 28-item grocery list', `Parsed count: ${parsedAll.length}`);

  console.log('\n---------------------------------------------------------------------');

  // ==========================================
  // SUITE 2: SUPERMARKET CATALOG & PRICING ENGINE
  // ==========================================
  console.log('🏷️  SUITE 2: Supermarket Catalog & Closest-Pack Matching Engine');

  assert(CATALOG_PRODUCTS.length >= 100, 'Catalog', `Catalog contains rich product database (${CATALOG_PRODUCTS.length} products)`);

  const stores: SupermarketName[] = ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland'];
  for (const s of stores) {
    const storeProds = CATALOG_PRODUCTS.filter(p => p.supermarket === s);
    assert(storeProds.length >= 20, 'Catalog', `${SUPERMARKETS_INFO[s].name} has active product items (${storeProds.length} items)`);
  }

  // Test Closest Pack Match: 900g mince -> 750g or 2x500g
  const defaultPrefs: UserPreferences = {
    healthierDefault: true,
    fatPercentagePreference: 5,
    preferWholewheat: true,
    preferFreeRange: true,
    preferOrganic: false,
    brandTierPriority: 'standard',
    packSizingPolicy: 'closest',
    enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland'],
  };

  const minceMatch = SupermarketComparisonService.findBestProductMatch('asda', p3, defaultPrefs);
  assert(minceMatch.product !== null, 'Matching Engine', 'Asda matches 900g 5% lean beef mince');
  assert(minceMatch.product?.fatPercentage === 5, 'Matching Engine', 'Asda mince match respects 5% lean fat preference');
  assert(minceMatch.packsNeeded >= 1, 'Matching Engine', `Calculates required pack count (${minceMatch.packsNeeded} packs)`);

  // Test full comparison matrix
  const comparison = SupermarketComparisonService.compare(parsedAll, defaultPrefs);
  assert(Boolean(comparison.cheapestStore), 'Comparison Matrix', `Identifies cheapest store (${comparison.cheapestStore.toUpperCase()})`);
  assert(comparison.supermarkets.asda.itemsFound === 28, 'Comparison Matrix', 'Asda matches all 28/28 items');
  assert(comparison.supermarkets.tesco.itemsFound === 28, 'Comparison Matrix', 'Tesco matches all 28/28 items');
  assert(comparison.supermarkets.sainsburys.itemsFound === 28, 'Comparison Matrix', "Sainsbury's matches all 28/28 items");
  assert(comparison.supermarkets.morrisons.itemsFound === 28, 'Comparison Matrix', 'Morrisons matches all 28/28 items');
  assert(comparison.supermarkets.iceland.itemsFound === 28, 'Comparison Matrix', 'Iceland matches all 28/28 items');

  // Verify delivery fee logic
  assert(comparison.supermarkets.asda.deliveryFee === 0, 'Delivery Engine', 'Asda grants free delivery over £40 threshold');

  // Verify Split Basket Optimization
  assert(comparison.splitOptimization.combinedTotal < comparison.supermarkets[comparison.cheapestStore].totalPrice, 'Split Optimizer', `Split basket (£${comparison.splitOptimization.combinedTotal.toFixed(2)}) is cheaper than single best (£${comparison.supermarkets[comparison.cheapestStore].totalPrice.toFixed(2)})`);
  assert(comparison.splitOptimization.savingsVsSingleBest > 0, 'Split Optimizer', `Calculates positive savings (£${comparison.splitOptimization.savingsVsSingleBest.toFixed(2)})`);

  console.log('\n---------------------------------------------------------------------');

  // ==========================================
  // SUITE 3: DATABASE & PERSISTENCE
  // ==========================================
  console.log('💾 SUITE 3: Database & Local Persistence Layer');

  DatabaseService.init();
  const initialPrefs = DatabaseService.getPreferences();
  assert(Boolean(initialPrefs), 'Database', 'Initializes and loads user preferences');

  // Save shop to archive
  const savedShop = DatabaseService.addHistoryShop({
    name: 'Master Suite Test Shop',
    rawList: SAMPLE_LIST,
    itemCount: 28,
    totals: {
      asda: comparison.supermarkets.asda.totalPrice,
      sainsburys: comparison.supermarkets.sainsburys.totalPrice,
      tesco: comparison.supermarkets.tesco.totalPrice,
      morrisons: comparison.supermarkets.morrisons.totalPrice,
      iceland: comparison.supermarkets.iceland.totalPrice,
    },
    cheapestStore: comparison.cheapestStore,
    lowestPrice: comparison.supermarkets[comparison.cheapestStore].totalPrice,
    highestPrice: comparison.supermarkets[comparison.highestStore].totalPrice,
    savings: comparison.supermarkets[comparison.cheapestStore].savingsVsHighest,
    items: parsedAll.map(i => ({
      name: i.name,
      targetQuantity: `${i.targetQuantity} ${i.unit}`,
      prices: { asda: 0, sainsburys: 0, tesco: 0, morrisons: 0, iceland: 0 },
    })),
  });

  assert(Boolean(savedShop.id), 'Database', `Saves shop to archive (${savedShop.id})`);
  const history = DatabaseService.getHistory();
  assert(history.some(h => h.id === savedShop.id), 'Database', 'Retrieves saved shop from history archive');

  // Test Favorites & Idea Chips
  const ideas = DatabaseService.getIngredientIdeas();
  assert(ideas.length >= 20, 'Database', `Ingredient idea chips loaded (${ideas.length} ideas)`);

  console.log('\n---------------------------------------------------------------------');

  // ==========================================
  // SUMMARY REPORT
  // ==========================================
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log('═════════════════════════════════════════════════════════════════════');
  console.log(`📊 MASTER TEST RESULTS: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  if (failed === 0) {
    console.log('🎉 ALL BACKEND & ENGINE SUITES PASSED WITH ZERO ERRORS!');
  } else {
    console.log(`❌ ${failed} TESTS FAILED.`);
    process.exit(1);
  }
  console.log('═════════════════════════════════════════════════════════════════════\n');
}

runMasterTestSuite().catch(err => {
  console.error('Master test suite runtime exception:', err);
  process.exit(1);
});
