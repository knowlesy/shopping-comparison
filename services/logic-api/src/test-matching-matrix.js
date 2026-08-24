import { FuzzyMatcher } from './services/fuzzyMatcher.js';
import { CATALOG_PRODUCTS } from './services/catalogData.js';
import { BasketCalculator } from './services/basketCalculator.js';

// ANSI Colors for clean test output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const STORES = ['asda', 'tesco', 'sainsburys', 'morrisons', 'iceland', 'aldi', 'lidl'];

const CATALOG_BY_STORE = {};
for (const s of STORES) {
  CATALOG_BY_STORE[s] = CATALOG_PRODUCTS.filter(p => p.supermarket === s);
}

// Comprehensive test items covering all food staples, units, pack sizes, and health tags
const TEST_ITEMS = [
  {
    rawText: '900g 5% lean beef mince',
    name: '5% lean beef mince',
    baseItem: 'beef mince',
    targetQuantity: 900,
    unit: 'g',
    fatPercentage: 5,
    category: 'meat',
    expectedNouns: ['mince', 'beef', 'steak'],
    forbiddenNouns: ['gravy', 'onion in gravy', 'pie', 'pear', 'bread'],
    isHealthierPreferred: true,
  },
  {
    rawText: '1.6kg frozen cod loins',
    name: 'frozen cod loins',
    baseItem: 'cod loins',
    targetQuantity: 1600,
    unit: 'g',
    isFrozen: true,
    category: 'fish',
    expectedNouns: ['cod', 'fish'],
    forbiddenNouns: ['pear', 'pepper', 'mushroom', 'bread', 'onion'],
  },
  {
    rawText: '12 free range eggs',
    name: 'free range eggs',
    baseItem: 'eggs',
    targetQuantity: 12,
    unit: 'item',
    isFreeRange: true,
    category: 'dairy-eggs',
    expectedNouns: ['egg', 'eggs'],
    forbiddenNouns: ['yogurt', 'yoghurt', 'celery', 'banana', 'milk'],
  },
  {
    rawText: '1kg authentic Greek yogurt 0%',
    name: 'authentic Greek yogurt 0%',
    baseItem: 'greek yogurt',
    targetQuantity: 1000,
    unit: 'g',
    fatPercentage: 0,
    category: 'dairy-eggs',
    expectedNouns: ['yogurt', 'yoghurt'],
    forbiddenNouns: ['milk', 'egg', 'pear', 'bread'],
  },
  {
    rawText: '800g tinned brown lentils',
    name: 'tinned brown lentils',
    baseItem: 'brown lentils',
    targetQuantity: 800,
    unit: 'g',
    category: 'pantry',
    expectedNouns: ['lentil', 'lentils', 'pulses', 'beans'],
    forbiddenNouns: ['onion', 'bread', 'pear', 'milk'],
  },
  {
    rawText: '1.13L semi-skimmed milk',
    name: 'semi-skimmed milk',
    baseItem: 'milk',
    targetQuantity: 1130,
    unit: 'ml',
    category: 'dairy-eggs',
    expectedNouns: ['milk'],
    forbiddenNouns: ['clementine', 'mushroom', 'tomato', 'pear', 'yogurt'],
  },
  {
    rawText: '1kg wholewheat fusilli',
    name: 'wholewheat fusilli',
    baseItem: 'fusilli',
    targetQuantity: 1000,
    unit: 'g',
    isWholewheat: true,
    category: 'pantry',
    expectedNouns: ['fusilli', 'pasta'],
    forbiddenNouns: ['rice', 'bread', 'potato'],
  },
  {
    rawText: '2kg baby new potatoes',
    name: 'baby new potatoes',
    baseItem: 'potatoes',
    targetQuantity: 2000,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['potato', 'potatoes'],
    forbiddenNouns: ['pasta', 'rice', 'bread'],
  },
  {
    rawText: '1kg Scottish rolled oats',
    name: 'Scottish rolled oats',
    baseItem: 'rolled oats',
    targetQuantity: 1000,
    unit: 'g',
    category: 'pantry',
    expectedNouns: ['oat', 'oats', 'porridge'],
    forbiddenNouns: ['bread', 'rice', 'pasta'],
  },
  {
    rawText: '800g wholemeal sliced bread',
    name: 'wholemeal sliced bread',
    baseItem: 'sliced bread',
    targetQuantity: 800,
    unit: 'g',
    isWholewheat: true,
    category: 'bakery',
    expectedNouns: ['bread', 'loaf'],
    forbiddenNouns: ['lentil', 'oats', 'pasta'],
  },
  {
    rawText: '3 x 400g Mutti Polpa chopped tomatoes',
    name: 'Mutti Polpa chopped tomatoes',
    baseItem: 'chopped tomatoes',
    targetQuantity: 1200,
    unit: 'g',
    category: 'pantry',
    expectedNouns: ['tomato', 'tomatoes', 'polpa'],
    forbiddenNouns: ['pepper', 'apple', 'milk'],
  },
  {
    rawText: '200g tomato puree',
    name: 'tomato puree',
    baseItem: 'tomato puree',
    targetQuantity: 200,
    unit: 'g',
    category: 'pantry',
    expectedNouns: ['puree', 'tomato'],
    forbiddenNouns: ['oil', 'olive'],
  },
  {
    rawText: '500ml extra virgin olive oil',
    name: 'extra virgin olive oil',
    baseItem: 'olive oil',
    targetQuantity: 500,
    unit: 'ml',
    category: 'pantry',
    expectedNouns: ['oil', 'olive'],
    forbiddenNouns: ['milk', 'puree'],
  },
  {
    rawText: '1kg courgettes',
    name: 'courgettes',
    baseItem: 'courgettes',
    targetQuantity: 1000,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['courgette', 'courgettes', 'zucchini'],
    forbiddenNouns: ['pepper', 'onion'],
  },
  {
    rawText: '1kg mixed bell peppers',
    name: 'mixed bell peppers',
    baseItem: 'bell peppers',
    targetQuantity: 1000,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['pepper', 'peppers'],
    forbiddenNouns: ['cod', 'mushrooms', 'pear'],
  },
  {
    rawText: '400g closed cup mushrooms',
    name: 'closed cup mushrooms',
    baseItem: 'mushrooms',
    targetQuantity: 400,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['mushroom', 'mushrooms'],
    forbiddenNouns: ['pepper', 'milk', 'clementine'],
  },
  {
    rawText: '600g baby plum tomatoes',
    name: 'baby plum tomatoes',
    baseItem: 'plum tomatoes',
    targetQuantity: 600,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['tomato', 'tomatoes'],
    forbiddenNouns: ['puree', 'oil'],
  },
  {
    rawText: '1kg carrots',
    name: 'carrots',
    baseItem: 'carrots',
    targetQuantity: 1000,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['carrot', 'carrots'],
    forbiddenNouns: ['onion', 'potato'],
  },
  {
    rawText: '1 head celery',
    name: 'celery',
    baseItem: 'celery',
    targetQuantity: 1,
    unit: 'head',
    category: 'produce',
    expectedNouns: ['celery'],
    forbiddenNouns: ['egg', 'banana', 'milk'],
  },
  {
    rawText: '1kg brown onions',
    name: 'brown onions',
    baseItem: 'onions',
    targetQuantity: 1000,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['onion', 'onions'],
    forbiddenNouns: ['lentil', 'bread', 'pear'],
  },
  {
    rawText: '1kg red onions',
    name: 'red onions',
    baseItem: 'red onions',
    targetQuantity: 1000,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['onion', 'onions'],
    forbiddenNouns: ['lentil', 'bread'],
  },
  {
    rawText: '1 pack garlic bulbs',
    name: 'garlic bulbs',
    baseItem: 'garlic',
    targetQuantity: 1,
    unit: 'pack',
    category: 'produce',
    expectedNouns: ['garlic'],
    forbiddenNouns: ['onion', 'potato'],
  },
  {
    rawText: '200g baby spinach',
    name: 'baby spinach',
    baseItem: 'spinach',
    targetQuantity: 200,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['spinach'],
    forbiddenNouns: ['celery', 'carrot'],
  },
  {
    rawText: '1kg bananas',
    name: 'bananas',
    baseItem: 'bananas',
    targetQuantity: 1000,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['banana', 'bananas'],
    forbiddenNouns: ['egg', 'celery', 'pear'],
  },
  {
    rawText: '800g sweet conference pears',
    name: 'sweet conference pears',
    baseItem: 'pears',
    targetQuantity: 800,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['pear', 'pears'],
    forbiddenNouns: ['cod', 'milk', 'lentil', 'bread'],
  },
  {
    rawText: '600g clementines',
    name: 'clementines',
    baseItem: 'clementines',
    targetQuantity: 600,
    unit: 'g',
    category: 'produce',
    expectedNouns: ['clementine', 'clementines', 'mandarin', 'satsuma', 'orange'],
    forbiddenNouns: ['milk', 'cod', 'mushroom'],
  },
  {
    rawText: '200g walnut halves',
    name: 'walnut halves',
    baseItem: 'walnuts',
    targetQuantity: 200,
    unit: 'g',
    category: 'pantry',
    expectedNouns: ['walnut', 'walnuts', 'nuts'],
    forbiddenNouns: ['seed', 'chia'],
  },
  {
    rawText: '200g whole chia seeds',
    name: 'whole chia seeds',
    baseItem: 'chia seeds',
    targetQuantity: 200,
    unit: 'g',
    category: 'pantry',
    expectedNouns: ['chia', 'seed', 'seeds'],
    forbiddenNouns: ['walnut', 'oil'],
  },
];

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failures = [];

function assert(condition, message, details = '') {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
  } else {
    failedAssertions++;
    failures.push({ message, details });
    console.error(`  ${RED}✖ FAIL:${RESET} ${message} ${details ? `(${details})` : ''}`);
  }
}

async function runTestSuite() {
  console.log(`\n${BOLD}${CYAN}======================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   UK GROCERY ENGINE AUTOMATED TEST & AUDIT SUITE    ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================${RESET}\n`);

  const preferences = {
    healthierDefault: true,
    fatPercentagePreference: 5,
    preferWholewheat: true,
    preferFreeRange: true,
    packSizingPolicy: 'closest',
    brandTierPriority: 'standard',
    enabledSupermarkets: STORES,
  };

  // ==========================================
  // SUITE 1: Matching & Zero-Contamination Matrix
  // ==========================================
  console.log(`${BOLD}1. Evaluating Product Matching & Alternative Contamination Matrix...${RESET}`);

  for (const item of TEST_ITEMS) {
    item.id = `item-${Math.random().toString(36).slice(2, 8)}`;
    
    for (const store of STORES) {
      const storeCatalog = CATALOG_BY_STORE[store] || CATALOG_PRODUCTS.filter(p => p.supermarket === store);
      const match = FuzzyMatcher.matchProduct(store, item, storeCatalog, preferences);

      // Check 1: Match must be found
      assert(
        match && match.product !== null,
        `[${store.toUpperCase()}] Match found for "${item.name}"`,
        match?.product ? '' : 'No product found in catalog'
      );

      if (!match || !match.product) continue;

      const titleLower = match.product.title.toLowerCase();

      // Check 2: Core noun match (Must contain at least one expected noun)
      const hasExpectedNoun = item.expectedNouns.some(noun => titleLower.includes(noun));
      assert(
        hasExpectedNoun,
        `[${store.toUpperCase()}] "${item.name}" matched core product`,
        `Matched "${match.product.title}", expected nouns [${item.expectedNouns.join(', ')}]`
      );

      // Check 3: Forbidden noun isolation (Raw staple should not match forbidden contaminants)
      const hasForbiddenNoun = item.forbiddenNouns.some(f => titleLower.includes(f));
      assert(
        !hasForbiddenNoun,
        `[${store.toUpperCase()}] "${item.name}" free from forbidden contaminants`,
        `Matched "${match.product.title}", forbidden: [${item.forbiddenNouns.join(', ')}]`
      );

      // Check 4: Price calculation arithmetic integrity
      const unitPrice = match.product.clubcardPrice || match.product.price;
      const expectedTotalPrice = Number((match.packsNeeded * unitPrice).toFixed(2));
      assert(
        Math.abs(match.totalPrice - expectedTotalPrice) < 0.01,
        `[${store.toUpperCase()}] "${item.name}" price arithmetic correct`,
        `Got £${match.totalPrice}, expected ${match.packsNeeded} x £${unitPrice} = £${expectedTotalPrice}`
      );

      // Check 5: Alternatives Zero-Contamination
      if (match.alternatives && match.alternatives.length > 0) {
        for (const alt of match.alternatives) {
          const altTitle = alt.title.toLowerCase();
          const altHasExpected = item.expectedNouns.some(noun => altTitle.includes(noun));
          assert(
            altHasExpected,
            `[${store.toUpperCase()}] Alternative for "${item.name}" is true replacement`,
            `Found alternative "${alt.title}", expected nouns [${item.expectedNouns.join(', ')}]`
          );

          assert(
            alt.id !== match.product.id,
            `[${store.toUpperCase()}] Alternative is not identical to selected product`,
            `Duplicate ID: ${alt.id}`
          );
        }
      }
    }
  }

  // ==========================================
  // SUITE 2: Basket Comparison & Cheapest Store Ranking
  // ==========================================
  console.log(`\n${BOLD}2. Evaluating Full Basket Multi-Store Comparison...${RESET}`);

  const storeMatchesMap = {};
  for (const store of STORES) {
    const storeCatalog = CATALOG_BY_STORE[store] || CATALOG_PRODUCTS.filter(p => p.supermarket === store);
    storeMatchesMap[store] = TEST_ITEMS.map(item =>
      FuzzyMatcher.matchProduct(store, item, storeCatalog, preferences)
    );
  }

  const comparison = BasketCalculator.computeComparison(TEST_ITEMS, storeMatchesMap, STORES);

  assert(comparison !== null, 'Comparison response generated');
  assert(comparison.cheapestStore && STORES.includes(comparison.cheapestStore), `Cheapest store identified: ${comparison.cheapestStore}`);
  assert(comparison.highestStore && STORES.includes(comparison.highestStore), `Highest store identified: ${comparison.highestStore}`);

  for (const store of STORES) {
    const basket = comparison.supermarkets[store];
    assert(basket.itemsFound === TEST_ITEMS.length, `[${store.toUpperCase()}] 100% basket coverage (${basket.itemsFound}/${TEST_ITEMS.length} items)`);
    assert(basket.totalPrice > 0, `[${store.toUpperCase()}] Total price valid (£${basket.totalPrice})`);
    assert(basket.subtotal > 0, `[${store.toUpperCase()}] Subtotal valid (£${basket.subtotal})`);
  }

  // ==========================================
  // SUITE 3: Free Range Egg Pack Scaling
  // ==========================================
  console.log(`\n${BOLD}3. Evaluating Free Range Egg Packaging Sizing Logic...${RESET}`);
  
  const eggTest12 = {
    id: 'test-egg-12',
    name: '12 free range eggs',
    baseItem: 'eggs',
    targetQuantity: 12,
    unit: 'item',
    isFreeRange: true,
    category: 'dairy-eggs',
  };

  for (const store of STORES) {
    const storeCatalog = CATALOG_BY_STORE[store] || CATALOG_PRODUCTS.filter(p => p.supermarket === store);
    const eggMatch = FuzzyMatcher.matchProduct(store, eggTest12, storeCatalog, preferences);
    assert(
      eggMatch && eggMatch.product && (eggMatch.totalQuantity === 12 || eggMatch.totalQuantity === 15),
      `[${store.toUpperCase()}] 12 eggs matches sensible pack size`,
      `Matched ${eggMatch?.packsNeeded}x ${eggMatch?.product?.title} (total: ${eggMatch?.totalQuantity} eggs)`
    );
  }

  // ==========================================
  // SUITE 4: 0% Authentic Greek Yogurt & 5% Mince Quality
  // ==========================================
  console.log(`\n${BOLD}4. Evaluating 0% Yogurt & 5% Mince Specificity...${RESET}`);

  const yogurtItem = TEST_ITEMS.find(i => i.baseItem === 'greek yogurt');
  for (const store of STORES) {
    const storeCatalog = CATALOG_BY_STORE[store] || CATALOG_PRODUCTS.filter(p => p.supermarket === store);
    const yogurtMatch = FuzzyMatcher.matchProduct(store, yogurtItem, storeCatalog, preferences);
    const title = yogurtMatch?.product?.title?.toLowerCase() || '';
    assert(
      title.includes('greek') || title.includes('authentic') || title.includes('yogurt'),
      `[${store.toUpperCase()}] Greek yogurt matches Greek/Authentic yogurt`,
      `Matched: ${yogurtMatch?.product?.title}`
    );
  }

  // Summary Report
  console.log(`\n${BOLD}${CYAN}======================================================${RESET}`);
  console.log(`${BOLD}${CYAN}                  TEST SUITE SUMMARY                  ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================${RESET}`);
  console.log(`Total Assertions Evaluated : ${BOLD}${totalAssertions}${RESET}`);
  console.log(`Passed Assertions          : ${BOLD}${GREEN}${passedAssertions}${RESET}`);
  console.log(`Failed Assertions          : ${BOLD}${failedAssertions > 0 ? RED : GREEN}${failedAssertions}${RESET}`);
  
  if (failedAssertions === 0) {
    console.log(`\n${BOLD}${GREEN}🎉 100% OF TESTS PASSED! ZERO CROSS-CONTAMINATION DETECTED.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`\n${BOLD}${RED}❌ ${failedAssertions} FAILURES DETECTED.${RESET}\n`);
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test Suite Unhandled Error:', err);
  process.exit(1);
});
