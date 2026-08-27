import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DealCalculator } from './dealCalculator.js';

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
});
