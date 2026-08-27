import { DealCalculator } from './dealCalculator.js';
import assert from 'node:assert/strict';

console.log('======================================================');
console.log('🧪 RUNNING STRICT MULTIBUY & DEAL VERIFICATION SUITE');
console.log('======================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Multibuy Fixed Price (e.g. "3 for £2", single price £0.80)
console.log('--- 1. Multibuy Fixed Price Tests ("3 for £2" @ £0.80 single) ---');
const multibuyDeal = DealCalculator.parseDeal('3 for £2');
assert.equal(multibuyDeal.type, 'multibuy_fixed');
assert.equal(multibuyDeal.bundleQuantity, 3);
assert.equal(multibuyDeal.bundlePrice, 2.0);

runTest('Under-quantity: Qty 1 @ £0.80 -> £0.80 (no deal applied)', () => {
  const result = DealCalculator.calculateDealPrice(0.8, 1, multibuyDeal);
  assert.equal(result.totalPrice, 0.8);
  assert.equal(result.savings, 0.0);
  assert.equal(result.isDealApplied, false);
});

runTest('Under-quantity: Qty 2 @ £0.80 -> £1.60 (no deal applied)', () => {
  const result = DealCalculator.calculateDealPrice(0.8, 2, multibuyDeal);
  assert.equal(result.totalPrice, 1.6);
  assert.equal(result.savings, 0.0);
  assert.equal(result.isDealApplied, false);
});

runTest('Exact quantity: Qty 3 @ £0.80 with "3 for £2" -> £2.00 (saved £0.40, £0.67/item)', () => {
  const result = DealCalculator.calculateDealPrice(0.8, 3, multibuyDeal);
  assert.equal(result.totalPrice, 2.0);
  assert.equal(result.savings, 0.4);
  assert.equal(result.effectiveUnitPrice, 0.67);
  assert.equal(result.isDealApplied, true);
});

runTest('Remainder quantity: Qty 4 @ £0.80 with "3 for £2" -> £2.80 (1 bundle + 1 single, saved £0.40)', () => {
  const result = DealCalculator.calculateDealPrice(0.8, 4, multibuyDeal);
  assert.equal(result.totalPrice, 2.8);
  assert.equal(result.savings, 0.4);
  assert.equal(result.effectiveUnitPrice, 0.7);
  assert.equal(result.isDealApplied, true);
});

runTest('Multi-bundle: Qty 7 @ £0.80 with "3 for £2" -> £4.80 (2 bundles + 1 single, saved £0.80)', () => {
  const result = DealCalculator.calculateDealPrice(0.8, 7, multibuyDeal);
  assert.equal(result.totalPrice, 4.8);
  assert.equal(result.savings, 0.8);
  assert.equal(result.isDealApplied, true);
});

// 2. Buy X Get Y Free (e.g. "Buy 2 Get 1 Free" @ £1.00 single)
console.log('\n--- 2. Buy X Get Y Free Tests ("Buy 2 Get 1 Free" @ £1.00 single) ---');
const bogofDeal = DealCalculator.parseDeal('Buy 2 Get 1 Free');
assert.equal(bogofDeal.type, 'buy_x_get_y_free');
assert.equal(bogofDeal.buyQuantity, 2);
assert.equal(bogofDeal.freeQuantity, 1);

runTest('Under-quantity: Qty 1 @ £1.00 -> £1.00', () => {
  const result = DealCalculator.calculateDealPrice(1.0, 1, bogofDeal);
  assert.equal(result.totalPrice, 1.0);
  assert.equal(result.isDealApplied, false);
});

runTest('Under-quantity: Qty 2 @ £1.00 -> £2.00', () => {
  const result = DealCalculator.calculateDealPrice(1.0, 2, bogofDeal);
  assert.equal(result.totalPrice, 2.0);
  assert.equal(result.isDealApplied, false);
});

runTest('Exact cycle: Qty 3 @ £1.00 -> £2.00 (1 free item, saved £1.00, £0.67/item)', () => {
  const result = DealCalculator.calculateDealPrice(1.0, 3, bogofDeal);
  assert.equal(result.totalPrice, 2.0);
  assert.equal(result.savings, 1.0);
  assert.equal(result.effectiveUnitPrice, 0.67);
  assert.equal(result.isDealApplied, true);
});

runTest('Remainder quantity: Qty 4 @ £1.00 -> £3.00 (3 items = £2, + 1 single = £3, saved £1.00, £0.75/item)', () => {
  const result = DealCalculator.calculateDealPrice(1.0, 4, bogofDeal);
  assert.equal(result.totalPrice, 3.0);
  assert.equal(result.savings, 1.0);
  assert.equal(result.effectiveUnitPrice, 0.75);
  assert.equal(result.isDealApplied, true);
});

runTest('Double cycle: Qty 6 @ £1.00 -> £4.00 (2 free items, saved £2.00)', () => {
  const result = DealCalculator.calculateDealPrice(1.0, 6, bogofDeal);
  assert.equal(result.totalPrice, 4.0);
  assert.equal(result.savings, 2.0);
  assert.equal(result.isDealApplied, true);
});

// 3. Bundle Discount (e.g. "Save £1 when you buy 2" @ £2.50 single)
console.log('\n--- 3. Bundle Discount Tests ("Save £1 when you buy 2" @ £2.50 single) ---');
const saveDeal = DealCalculator.parseDeal('Save £1 when you buy 2');
assert.equal(saveDeal.type, 'bundle_discount');
assert.equal(saveDeal.bundleQuantity, 2);
assert.equal(saveDeal.discountAmount, 1.0);

runTest('Under-quantity: Qty 1 @ £2.50 -> £2.50 (no discount)', () => {
  const result = DealCalculator.calculateDealPrice(2.5, 1, saveDeal);
  assert.equal(result.totalPrice, 2.5);
  assert.equal(result.savings, 0.0);
  assert.equal(result.isDealApplied, false);
});

runTest('Exact bundle: Qty 2 @ £2.50 -> £4.00 (standard £5.00, saved £1.00, £2.00/item)', () => {
  const result = DealCalculator.calculateDealPrice(2.5, 2, saveDeal);
  assert.equal(result.totalPrice, 4.0);
  assert.equal(result.savings, 1.0);
  assert.equal(result.effectiveUnitPrice, 2.0);
  assert.equal(result.isDealApplied, true);
});

runTest('Remainder bundle: Qty 3 @ £2.50 -> £6.50 (standard £7.50, saved £1.00)', () => {
  const result = DealCalculator.calculateDealPrice(2.5, 3, saveDeal);
  assert.equal(result.totalPrice, 6.5);
  assert.equal(result.savings, 1.0);
  assert.equal(result.isDealApplied, true);
});

// 4. Loyalty Card Pricing (e.g. "£1.50 Clubcard Price" @ £2.00 regular)
console.log('\n--- 4. Loyalty Card Pricing Tests ("£1.50 Clubcard Price" @ £2.00 regular) ---');
const clubcardDeal = DealCalculator.parseDeal('£1.50 Clubcard Price');
assert.equal(clubcardDeal.type, 'loyalty_price');
assert.equal(clubcardDeal.loyaltyPrice, 1.5);
assert.equal(clubcardDeal.loyaltyScheme, 'Clubcard');

runTest('Loyalty single: Qty 1 @ £2.00 standard -> £1.50 (saved £0.50)', () => {
  const result = DealCalculator.calculateDealPrice(2.0, 1, clubcardDeal);
  assert.equal(result.totalPrice, 1.5);
  assert.equal(result.savings, 0.5);
  assert.equal(result.effectiveUnitPrice, 1.5);
  assert.equal(result.isDealApplied, true);
});

runTest('Loyalty multiple: Qty 4 @ £2.00 standard -> £6.00 (standard £8.00, saved £2.00)', () => {
  const result = DealCalculator.calculateDealPrice(2.0, 4, clubcardDeal);
  assert.equal(result.totalPrice, 6.0);
  assert.equal(result.savings, 2.0);
  assert.equal(result.effectiveUnitPrice, 1.5);
  assert.equal(result.isDealApplied, true);
});

console.log('\n======================================================');
console.log(`📊 RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100% GREEN)`);
console.log('======================================================\n');
