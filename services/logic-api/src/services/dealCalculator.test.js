import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DealCalculator } from './dealCalculator.js';
import { PackSelector } from './packSelector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('DealCalculator Strict Multibuy & Promotion Engine', () => {
  describe('1. Multibuy Fixed Price (e.g. "3 for £2" @ £0.80 single)', () => {
    const multibuyDeal = DealCalculator.parseDeal('3 for £2');

    it('should correctly parse multibuy_fixed metadata', () => {
      assert.equal(multibuyDeal.type, 'multibuy_fixed');
      assert.equal(multibuyDeal.bundleQuantity, 3);
      assert.equal(multibuyDeal.bundlePrice, 2.0);
    });

    it('Under-quantity: Qty 1 @ £0.80 -> £0.80 (no deal applied)', () => {
      const result = DealCalculator.calculateDealPrice(0.8, 1, multibuyDeal);
      assert.equal(result.totalPrice, 0.8);
      assert.equal(result.savings, 0.0);
      assert.equal(result.isDealApplied, false);
    });

    it('Under-quantity: Qty 2 @ £0.80 -> £1.60 (no deal applied)', () => {
      const result = DealCalculator.calculateDealPrice(0.8, 2, multibuyDeal);
      assert.equal(result.totalPrice, 1.6);
      assert.equal(result.savings, 0.0);
      assert.equal(result.isDealApplied, false);
    });

    it('Exact quantity: Qty 3 @ £0.80 with "3 for £2" -> £2.00 (saved £0.40, £0.67/item)', () => {
      const result = DealCalculator.calculateDealPrice(0.8, 3, multibuyDeal);
      assert.equal(result.totalPrice, 2.0);
      assert.equal(result.savings, 0.4);
      assert.equal(result.effectiveUnitPrice, 0.67);
      assert.equal(result.isDealApplied, true);
    });

    it('Remainder quantity: Qty 4 @ £0.80 with "3 for £2" -> £2.80 (1 bundle + 1 single, saved £0.40)', () => {
      const result = DealCalculator.calculateDealPrice(0.8, 4, multibuyDeal);
      assert.equal(result.totalPrice, 2.8);
      assert.equal(result.savings, 0.4);
      assert.equal(result.effectiveUnitPrice, 0.7);
      assert.equal(result.isDealApplied, true);
    });

    it('Multi-bundle: Qty 7 @ £0.80 with "3 for £2" -> £4.80 (2 bundles + 1 single, saved £0.80)', () => {
      const result = DealCalculator.calculateDealPrice(0.8, 7, multibuyDeal);
      assert.equal(result.totalPrice, 4.8);
      assert.equal(result.savings, 0.8);
      assert.equal(result.isDealApplied, true);
    });
  });

  describe('2. Buy X Get Y Free (e.g. "Buy 2 Get 1 Free" @ £1.00 single)', () => {
    const bogofDeal = DealCalculator.parseDeal('Buy 2 Get 1 Free');

    it('should correctly parse buy_x_get_y_free metadata', () => {
      assert.equal(bogofDeal.type, 'buy_x_get_y_free');
      assert.equal(bogofDeal.buyQuantity, 2);
      assert.equal(bogofDeal.freeQuantity, 1);
    });

    it('Under-quantity: Qty 1 @ £1.00 -> £1.00', () => {
      const result = DealCalculator.calculateDealPrice(1.0, 1, bogofDeal);
      assert.equal(result.totalPrice, 1.0);
      assert.equal(result.isDealApplied, false);
    });

    it('Under-quantity: Qty 2 @ £1.00 -> £2.00', () => {
      const result = DealCalculator.calculateDealPrice(1.0, 2, bogofDeal);
      assert.equal(result.totalPrice, 2.0);
      assert.equal(result.isDealApplied, false);
    });

    it('Exact cycle: Qty 3 @ £1.00 -> £2.00 (1 free item, saved £1.00, £0.67/item)', () => {
      const result = DealCalculator.calculateDealPrice(1.0, 3, bogofDeal);
      assert.equal(result.totalPrice, 2.0);
      assert.equal(result.savings, 1.0);
      assert.equal(result.effectiveUnitPrice, 0.67);
      assert.equal(result.isDealApplied, true);
    });

    it('Remainder quantity: Qty 4 @ £1.00 -> £3.00 (3 items = £2, + 1 single = £3, saved £1.00, £0.75/item)', () => {
      const result = DealCalculator.calculateDealPrice(1.0, 4, bogofDeal);
      assert.equal(result.totalPrice, 3.0);
      assert.equal(result.savings, 1.0);
      assert.equal(result.effectiveUnitPrice, 0.75);
      assert.equal(result.isDealApplied, true);
    });

    it('Double cycle: Qty 6 @ £1.00 -> £4.00 (2 free items, saved £2.00)', () => {
      const result = DealCalculator.calculateDealPrice(1.0, 6, bogofDeal);
      assert.equal(result.totalPrice, 4.0);
      assert.equal(result.savings, 2.0);
      assert.equal(result.isDealApplied, true);
    });
  });

  describe('3. Bundle Discount (e.g. "Save £1 when you buy 2" @ £2.50 single)', () => {
    const saveDeal = DealCalculator.parseDeal('Save £1 when you buy 2');

    it('should correctly parse bundle_discount metadata', () => {
      assert.equal(saveDeal.type, 'bundle_discount');
      assert.equal(saveDeal.bundleQuantity, 2);
      assert.equal(saveDeal.discountAmount, 1.0);
    });

    it('Under-quantity: Qty 1 @ £2.50 -> £2.50 (no discount)', () => {
      const result = DealCalculator.calculateDealPrice(2.5, 1, saveDeal);
      assert.equal(result.totalPrice, 2.5);
      assert.equal(result.savings, 0.0);
      assert.equal(result.isDealApplied, false);
    });

    it('Exact bundle: Qty 2 @ £2.50 -> £4.00 (standard £5.00, saved £1.00, £2.00/item)', () => {
      const result = DealCalculator.calculateDealPrice(2.5, 2, saveDeal);
      assert.equal(result.totalPrice, 4.0);
      assert.equal(result.savings, 1.0);
      assert.equal(result.effectiveUnitPrice, 2.0);
      assert.equal(result.isDealApplied, true);
    });

    it('Remainder bundle: Qty 3 @ £2.50 -> £6.50 (standard £7.50, saved £1.00)', () => {
      const result = DealCalculator.calculateDealPrice(2.5, 3, saveDeal);
      assert.equal(result.totalPrice, 6.5);
      assert.equal(result.savings, 1.0);
      assert.equal(result.isDealApplied, true);
    });
  });

  describe('4. Loyalty Card Pricing (e.g. "£1.50 Clubcard Price" @ £2.00 regular)', () => {
    const clubcardDeal = DealCalculator.parseDeal('£1.50 Clubcard Price');

    it('should correctly parse loyalty_price metadata', () => {
      assert.equal(clubcardDeal.type, 'loyalty_price');
      assert.equal(clubcardDeal.loyaltyPrice, 1.5);
      assert.equal(clubcardDeal.loyaltyScheme, 'Clubcard');
    });

    it('Loyalty single: Qty 1 @ £2.00 standard -> £1.50 (saved £0.50)', () => {
      const result = DealCalculator.calculateDealPrice(2.0, 1, clubcardDeal);
      assert.equal(result.totalPrice, 1.5);
      assert.equal(result.savings, 0.5);
      assert.equal(result.effectiveUnitPrice, 1.5);
      assert.equal(result.isDealApplied, true);
    });

    it('Loyalty multiple: Qty 4 @ £2.00 standard -> £6.00 (standard £8.00, saved £2.00)', () => {
      const result = DealCalculator.calculateDealPrice(2.0, 4, clubcardDeal);
      assert.equal(result.totalPrice, 6.0);
      assert.equal(result.savings, 2.0);
      assert.equal(result.effectiveUnitPrice, 1.5);
      assert.equal(result.isDealApplied, true);
    });
  });

  describe('5. Real Promo Strings Corpus from deal-strings.json', () => {
    const corpusPath = path.resolve(__dirname, '../../../../tests/fixtures/deal-strings.json');
    const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));

    it('should correctly process all valid and garbage promo strings in corpus', () => {
      for (const entry of corpus) {
        const parsed = DealCalculator.parseDeal(entry.rawText);
        if (entry.expectedType) {
          assert.ok(parsed, `Valid string "${entry.rawText}" must produce parsed deal object`);
          assert.equal(parsed.type, entry.expectedType);
        }

        for (const tc of entry.testCases || []) {
          const res = DealCalculator.calculateDealPrice(tc.unitPrice, tc.qty, entry.rawText);
          assert.equal(
            res.totalPrice,
            tc.expectedTotal,
            `deal="${entry.rawText}" price=${tc.unitPrice} qty=${tc.qty} totalPrice expected ${tc.expectedTotal}, got ${res.totalPrice}`
          );
          assert.equal(
            res.isDealApplied,
            tc.dealApplied,
            `deal="${entry.rawText}" qty=${tc.qty} isDealApplied expected ${tc.dealApplied}, got ${res.isDealApplied}`
          );
        }
      }
    });
  });

  describe('6. Deal Provenance & Leak Isolation (Own Deal Invariant)', () => {
    it('should assert applied deal belongs strictly to matched product without candidate deal leak', () => {
      const candidateWithDeal = {
        id: 'tesco-soup-deal',
        supermarket: 'tesco',
        title: 'Tesco Tomato Soup 400g',
        price: 1.00,
        packageSize: 400,
        packageUnit: 'g',
        category: 'store-cupboard',
        deal: { rawText: '3 for £2', type: 'multibuy_fixed', bundleQuantity: 3, bundlePrice: 2.00 }
      };

      const candidateNoDeal = {
        id: 'tesco-soup-plain',
        supermarket: 'tesco',
        title: 'Tesco Vegetable Soup 400g',
        price: 0.90,
        packageSize: 400,
        packageUnit: 'g',
        category: 'store-cupboard'
      };

      // Item specifically targets vegetable soup -> candidateNoDeal wins
      const vegItem = { name: 'vegetable soup 400g', baseItem: 'vegetable soup', targetQuantity: 1200, unit: 'g' };
      const vegMatch = PackSelector.calculatePacks(candidateNoDeal, vegItem, { includeDeals: true });

      // Invariant: chosen candidate has no deal, so no deal must leak from candidateWithDeal
      assert.equal(Boolean(vegMatch.dealApplied), false, 'Un-dealed candidate must never leak deal from another candidate');
      assert.equal(vegMatch.totalPrice, 2.70, 'Must charge 3 x 0.90 = 2.70 without deal leak');

      // Item targets tomato soup -> candidateWithDeal wins and applies its own deal
      const tomatoItem = { name: 'tomato soup 400g', baseItem: 'tomato soup', targetQuantity: 1200, unit: 'g' };
      const tomatoMatch = PackSelector.calculatePacks(candidateWithDeal, tomatoItem, { includeDeals: true });
      assert.ok(tomatoMatch.dealApplied, 'Candidate with deal must apply its own deal when quantity threshold met');
      assert.equal(tomatoMatch.totalPrice, 2.00, '3 x 1.00 with 3 for £2 deal must equal 2.00');

      // Below threshold check: qty 1 of tomato soup shows raw price
      const singleItem = { name: 'tomato soup 400g', baseItem: 'tomato soup', targetQuantity: 400, unit: 'g' };
      const singleMatch = PackSelector.calculatePacks(candidateWithDeal, singleItem, { includeDeals: true });
      assert.equal(Boolean(singleMatch.dealApplied), false, 'Under-quantity purchase must have dealApplied: null/falsey');
      assert.equal(singleMatch.totalPrice, 1.00, 'Single pack must be raw price 1.00');
    });
  });
});
