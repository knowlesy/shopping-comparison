import { IngredientParser } from './ingredientParser.js';
import { FuzzyMatcher } from './fuzzyMatcher.js';
import { AiDecisionReviewer } from './aiDecisionReviewer.js';
import { CATALOG_PRODUCTS } from './catalogData.js';

console.log('================================================================');
console.log('⚖️  BENCHMARK: PURE FUZZY MATCHING vs. GEMINI AI FALLBACK');
console.log('================================================================\n');

const SAMPLE_ITEMS = [
  '900g 5% lean beef mince',
  '1kg authentic Greek yogurt 0%',
  '1kg wholewheat fusilli',
  '3 x 400g chopped tomatoes',
  '1.6kg frozen cod loins',
  '12 free range eggs',
  '2kg baby new potatoes',
  '500ml extra virgin olive oil',
  '1 pack garlic bulbs',
  '1 bunch bananas'
];

const stores = ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'];

console.log(`Evaluating ${SAMPLE_ITEMS.length} sample items across ${stores.length} UK supermarkets...\n`);

let totalFuzzyMatches = 0;
let totalFuzzyPrice = 0;

const startTime = Date.now();

for (let i = 0; i < SAMPLE_ITEMS.length; i++) {
  const rawItem = SAMPLE_ITEMS[i];
  const parsed = IngredientParser.parseItem(rawItem);
  const keywords = FuzzyMatcher.extractKeywords(parsed);

  console.log(`[${i + 1}/${SAMPLE_ITEMS.length}] Item: "${rawItem}" (Target: ${parsed.targetQuantity} ${parsed.unit || 'items'})`);

  for (const store of stores) {
    const storeCandidates = CATALOG_PRODUCTS.filter((p) => p.supermarket === store);
    const scored = storeCandidates.map((prod) => {
      const result = FuzzyMatcher.scoreCandidate(prod, parsed, keywords, { healthierDefault: true }, storeCandidates);
      return { product: prod, ...result };
    }).sort((a, b) => b.score - a.score);

    const topFuzzy = scored[0];
    if (topFuzzy && topFuzzy.score > 0) {
      totalFuzzyMatches++;
      totalFuzzyPrice += topFuzzy.totalPrice;
      const dealTag = topFuzzy.dealApplied ? ` [DEAL: ${topFuzzy.dealApplied.dealText}]` : '';
      console.log(`   - ${store.toUpperCase().padEnd(11)}: ${topFuzzy.product.title.slice(0, 32).padEnd(32)} | ${topFuzzy.packs} pk(s) | £${topFuzzy.totalPrice.toFixed(2)}${dealTag} (score: ${topFuzzy.score})`);
    } else {
      console.log(`   - ${store.toUpperCase().padEnd(11)}: No match found`);
    }
  }
  console.log('');
}

const elapsed = Date.now() - startTime;

console.log('================================================================');
console.log('📊 BENCHMARK SUMMARY:');
console.log(`  - Total Items Evaluated: ${SAMPLE_ITEMS.length}`);
console.log(`  - Total Supermarket Matches: ${totalFuzzyMatches}/${SAMPLE_ITEMS.length * stores.length}`);
console.log(`  - Match Coverage: ${Math.round((totalFuzzyMatches / (SAMPLE_ITEMS.length * stores.length)) * 100)}%`);
console.log(`  - Total Estimated Basket Spend: £${totalFuzzyPrice.toFixed(2)}`);
console.log(`  - Average Match Latency: ${(elapsed / SAMPLE_ITEMS.length).toFixed(2)}ms per item`);
console.log(`  - AI Fallback Configured: ${AiDecisionReviewer.isEnabled() ? 'YES (Active)' : 'NO (Disabled by default - zero token cost)'}`);
console.log('================================================================\n');
