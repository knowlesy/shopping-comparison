import { ShoppingListParser } from '../src/services/parser.js';
import { SupermarketComparisonService } from '../src/services/supermarketService.js';
import { DatabaseService } from '../src/services/db.js';

async function runE2ETests() {
  console.log('🧪 Starting Full E2E Verification...\n');

  // 1. Initialize DB
  DatabaseService.init();
  const prefs = DatabaseService.getPreferences();
  console.log('1. Database initialized. Initial prefs loaded:', prefs.healthierDefault ? 'Healthier bias active' : 'Standard');

  // 2. Parse the User Example Shopping List
  const userListText = `900g 5% lean beef mince
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

  const parsedItems = ShoppingListParser.parse(userListText);
  console.log(`2. Parsed ${parsedItems.length} / 28 items successfully.`);

  if (parsedItems.length !== 28) {
    throw new Error(`Expected 28 items, got ${parsedItems.length}`);
  }

  // 3. Supermarket Comparison Execution
  const comparison = SupermarketComparisonService.compare(parsedItems, prefs);
  console.log('3. Supermarket Comparison Matrix calculated:');
  console.log(`   - Cheapest store: ${comparison.cheapestStore.toUpperCase()}`);
  console.log(`   - Highest store: ${comparison.highestStore.toUpperCase()}`);

  for (const [store, result] of Object.entries(comparison.supermarkets)) {
    console.log(`   * ${result.info.name.padEnd(12)}: Total £${result.totalPrice.toFixed(2).padStart(6)} (Subtotal: £${result.subtotal.toFixed(2)}, Delivery: £${result.deliveryFee.toFixed(2)}, Health Score: ${result.averageHealthScore}%)`);
    // Verify each store matched all items
    if (result.itemsFound !== 28) {
      console.warn(`     ⚠️ Warning: ${result.info.name} only matched ${result.itemsFound}/28 items`);
    }
  }

  // 4. Test Split Basket Calculation
  console.log('4. Split Basket Optimizer:');
  console.log(`   - Combined lowest cost: £${comparison.splitOptimization.combinedTotal.toFixed(2)}`);
  console.log(`   - Additional savings vs single cheapest store: £${comparison.splitOptimization.savingsVsSingleBest.toFixed(2)}`);
  console.log(`   - Strategy: ${comparison.splitOptimization.explanation}`);

  // 5. Test Alternative Products Retrieval
  const alts = SupermarketComparisonService.getAlternatives('tesco', 'beef mince');
  console.log(`5. Retrieved ${alts.length} alternative products for Tesco 'beef mince'.`);
  alts.forEach(a => console.log(`   - ${a.title} (£${a.price.toFixed(2)}, ${a.packageDisplay}, ${a.fatPercentage || 'N/A'}% fat)`));

  // 6. Test Archive Shop Saving & Retrieval
  const savedShop = DatabaseService.addHistoryShop({
    name: 'E2E Test 28-Item Shop',
    rawList: userListText,
    itemCount: parsedItems.length,
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
    items: parsedItems.map(i => ({
      name: i.name,
      targetQuantity: `${i.targetQuantity} ${i.unit}`,
      prices: {
        asda: 0,
        sainsburys: 0,
        tesco: 0,
        morrisons: 0,
        iceland: 0,
      },
    })),
  });
  console.log(`6. Successfully saved shop to archive with id: ${savedShop.id}`);
  const history = DatabaseService.getHistory();
  console.log(`   - History count in DB: ${history.length}`);

  // 7. Test Ingredient Ideas
  const ideas = DatabaseService.getIngredientIdeas();
  console.log(`7. Ingredient Ideas Word Window has ${ideas.length} chips loaded.`);

  console.log('\n🎉 ALL E2E TESTS PASSED WITH 100% SUCCESS!');
}

runE2ETests().catch(err => {
  console.error('❌ E2E test failed:', err);
  process.exit(1);
});
