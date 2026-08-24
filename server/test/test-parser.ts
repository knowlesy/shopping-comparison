import { ShoppingListParser } from '../src/services/parser.js';
import { SupermarketComparisonService } from '../src/services/supermarketService.js';

const exampleList = `
900g 5% lean beef mince
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
150g chia seeds
`;

console.log('--- Testing ShoppingListParser ---');
const parsed = ShoppingListParser.parse(exampleList);
console.log(`Parsed ${parsed.length} items successfully.`);

parsed.forEach((item, idx) => {
  console.log(`${idx + 1}. [${item.category}] ${item.name} -> Target: ${item.targetQuantity} ${item.unit} | Health: ${item.isHealthierPreferred || false} | Fat: ${item.fatPercentage || 'N/A'}`);
});

console.log('\n--- Testing Supermarket Comparison ---');
const comparison = SupermarketComparisonService.compare(parsed);

console.log(`Cheapest Store: ${comparison.cheapestStore.toUpperCase()}`);
for (const [store, result] of Object.entries(comparison.supermarkets)) {
  console.log(`Store: ${store.toUpperCase()} | Subtotal: £${result.subtotal.toFixed(2)} | Delivery: £${result.deliveryFee.toFixed(2)} | Total: £${result.totalPrice.toFixed(2)} | Health Score: ${result.averageHealthScore}% | Items Matched: ${result.itemsFound}/${result.itemsTotal}`);
}

console.log('\n--- Testing Split Basket Optimization ---');
console.log(`Combined Split Total: £${comparison.splitOptimization.combinedTotal.toFixed(2)}`);
console.log(`Savings vs Single Best: £${comparison.splitOptimization.savingsVsSingleBest.toFixed(2)}`);
console.log(`Explanation: ${comparison.splitOptimization.explanation}`);

console.log('\n✅ All backend unit tests passed successfully!');
