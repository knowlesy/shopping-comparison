/**
 * AI Intent Helper & Rule-Based Matcher Evaluation Harness
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IngredientParser } from '../services/logic-api/src/services/ingredientParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REAL_52_LINE_LIST = `
Chicken breast fillets 1.4 kg
Beef mince 5% 1.9 kg
Pork sausages 12-pack
Salmon fillets 4 portions
Cod loin 500 g
Tinned tuna in spring water 4 x 160 g
Tofu firm 400 g
Eggs large free range 18
Greek yogurt 0% fat 1 kg
Whole milk 4 pints
Cheddar cheese mature 400 g
Butter salted 250 g
Mozzarella 2 x 125 g
Oat milk barista 2 L
Broccoli 2 heads
Carrots 1 kg
Brown onions 1 kg
Garlic 3 bulbs
Baby spinach 250 g
Red bell peppers 3
Cucumber 1
Avocados ripe 4-pack
Mushrooms chestnut 400 g
Baking potatoes 2.5 kg
Sweet potatoes 1 kg
Bananas 6
Apples Pink Lady 6-pack
Lemons 4
Fresh blueberries 200 g
Satsumas or easy peelers 600 g
Basmati rice 1 kg
Rolled porridge oats 1 kg
Penne pasta 1 kg
Tinned chopped tomatoes 4 x 400 g
Tinned chickpeas in water 2 x 400 g
Tinned black beans 2 x 400 g
Red split lentils 500 g
Olive oil extra virgin 750 ml
Rapeseed oil 1 L
Soy sauce reduced salt 150 ml
Peanut butter crunchy 1 kg
Wholewheat sliced bread 800 g
Sourdough loaf 1
Tortilla wraps 8-pack
Ground cumin 40 g
Smoked paprika 45 g
Dried oregano 25 g
Vegetable stock cubes 8-pack
Dark chocolate 70% 100 g
Honey clear 340 g
Walnuts 200 g
Frozen garden peas 1 kg
`.trim();

async function runAiEval() {
  console.log('===============================================================================');
  console.log('   AI INTENT HELPER & RULE-BASED MATCHER EVALUATION HARNESS                     ');
  console.log('===============================================================================\n');

  const lines = REAL_52_LINE_LIST.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed = IngredientParser.parseList(REAL_52_LINE_LIST);

  console.log(`Evaluating ${lines.length} raw shopping entries against rule-based parser & intent engine...`);

  let validCount = 0;
  const results = [];

  for (const item of parsed) {
    const hasValidName = Boolean(item.name && item.name.length > 0);
    const hasValidCategory = Boolean(item.category && item.category !== 'unknown');
    const hasValidQuantity = item.targetQuantity > 0;
    const isSuccess = hasValidName && hasValidCategory && hasValidQuantity;

    if (isSuccess) validCount++;

    results.push({
      input: item.name,
      baseItem: item.baseItem,
      targetQuantity: item.targetQuantity,
      unit: item.unit,
      category: item.category,
      fatPercentage: item.fatPercentage,
      isFreeRange: item.isFreeRange,
      status: isSuccess ? 'pass' : 'fail'
    });
  }

  const accuracy = Number(((validCount / parsed.length) * 100).toFixed(1));

  console.log(`\nResults Summary:`);
  console.log(`- Raw Input Lines: ${lines.length}`);
  console.log(`- Parsed Output Items: ${parsed.length}`);
  console.log(`- Valid Intent Extractions: ${validCount}/${parsed.length} (${accuracy}% accuracy)`);

  const reportDir = path.resolve(__dirname, '../test-results');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, 'ai-eval-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    totalInputs: lines.length,
    totalParsed: parsed.length,
    validIntentCount: validCount,
    accuracyPercentage: accuracy,
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n✅ Saved evaluation report to: ${reportPath}\n`);
}

runAiEval().catch((err) => {
  console.error('AI eval harness error:', err);
  process.exit(1);
});
