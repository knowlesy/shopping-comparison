import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PackSelector } from './packSelector.js';
import { DealCalculator } from './dealCalculator.js';

describe('PackSelector', () => {
  it('should calculate pack count and deal pricing correctly', () => {
    const item = { targetQuantity: 900, unit: 'g' };
    const prod = {
      packageSize: 500,
      packageUnit: 'g',
      price: 4.50
    };

    const res = PackSelector.calculatePacks(prod, item, { packSizingPolicy: 'closest' });
    assert.equal(res.packs, 2);
    assert.equal(res.totalQty, 1000);
    assert.equal(res.totalPrice, 9.00);
  });

  it('should detect weight shortfall when delivered quantity is less than requested', () => {
    const item = { targetQuantity: 1.6, unit: 'kg' };
    const shortfall = PackSelector.detectShortfall(item, 1500);

    assert.ok(shortfall);
    assert.equal(shortfall.requested, 1.6);
    assert.equal(shortfall.supplied, 1.5);
    assert.equal(shortfall.unit, 'kg');
  });

  it('should apply multibuy deal when includeDeals is true (default)', () => {
    const item = { targetQuantity: 3, unit: 'item' };
    const prod = {
      packageSize: 1,
      packageUnit: 'item',
      price: 0.80,
      deal: DealCalculator.parseDeal('3 for £2')
    };

    const res = PackSelector.calculatePacks(prod, item, { includeDeals: true });
    assert.equal(res.packs, 3);
    assert.equal(res.totalPrice, 2.00);
    assert.ok(res.dealApplied);
    assert.equal(res.dealApplied.savings, 0.40);
  });

  it('should ignore multibuy and loyalty deals when includeDeals is false', () => {
    const item = { targetQuantity: 3, unit: 'item' };
    const prod = {
      packageSize: 1,
      packageUnit: 'item',
      price: 0.80,
      clubcardPrice: 0.60,
      deal: DealCalculator.parseDeal('3 for £2')
    };

    const res = PackSelector.calculatePacks(prod, item, { includeDeals: false });
    assert.equal(res.packs, 3);
    assert.equal(res.totalPrice, 2.40); // 3 * £0.80 regular base price
    assert.equal(res.dealApplied, undefined);
  });

  describe('Catalog Dealed Products End-to-End Invariants', () => {
    it('should correctly apply multibuy_fixed deal on Asda Mutti tomatoes and revert on raw mode', () => {
      const prod = {
        id: 'asda-mutti-polpa-400g',
        price: 1.35,
        packageSize: 400,
        packageUnit: 'g',
        deal: { rawText: '3 for £2', type: 'multibuy_fixed', bundleQuantity: 3, bundlePrice: 2.00 }
      };
      const item = { targetQuantity: 1200, unit: 'g' };

      const withDeals = PackSelector.calculatePacks(prod, item, { includeDeals: true });
      assert.equal(withDeals.packs, 3);
      assert.equal(withDeals.totalPrice, 2.00);
      assert.ok(withDeals.dealApplied);
      assert.equal(withDeals.dealApplied.savings, 2.05);

      const rawOnly = PackSelector.calculatePacks(prod, item, { includeDeals: false });
      assert.equal(rawOnly.packs, 3);
      assert.equal(rawOnly.totalPrice, 4.05);
      assert.equal(rawOnly.dealApplied, undefined);
    });

    it('should correctly apply loyalty Nectar price on Sainsbury Mutti tomatoes and revert on raw mode', () => {
      const prod = {
        id: 'sainsburys-mutti-polpa-400g',
        price: 1.45,
        packageSize: 400,
        packageUnit: 'g',
        nectarPrice: 1.15
      };
      const item = { targetQuantity: 400, unit: 'g' };

      const withDeals = PackSelector.calculatePacks(prod, item, { includeDeals: true });
      assert.equal(withDeals.packs, 1);
      assert.equal(withDeals.totalPrice, 1.15);
      assert.ok(withDeals.dealApplied);
      assert.equal(withDeals.dealApplied.savings, 0.30);

      const rawOnly = PackSelector.calculatePacks(prod, item, { includeDeals: false });
      assert.equal(rawOnly.packs, 1);
      assert.equal(rawOnly.totalPrice, 1.45);
      assert.equal(rawOnly.dealApplied, undefined);
    });

    it('should correctly apply bundle discount on Morrisons pasta and revert on raw mode', () => {
      const prod = {
        id: 'morrisons-wholewheat-fusilli-1kg',
        price: 1.55,
        packageSize: 1000,
        packageUnit: 'g',
        deal: { rawText: 'Save £1 when you buy 2', type: 'bundle_discount', bundleQuantity: 2, discountAmount: 1.00 }
      };
      const item = { targetQuantity: 2000, unit: 'g' };

      const withDeals = PackSelector.calculatePacks(prod, item, { includeDeals: true });
      assert.equal(withDeals.packs, 2);
      assert.equal(withDeals.totalPrice, 2.10);
      assert.ok(withDeals.dealApplied);
      assert.equal(withDeals.dealApplied.savings, 1.00);

      const rawOnly = PackSelector.calculatePacks(prod, item, { includeDeals: false });
      assert.equal(rawOnly.packs, 2);
      assert.equal(rawOnly.totalPrice, 3.10);
      assert.equal(rawOnly.dealApplied, undefined);
    });

    it('should correctly apply buy_x_get_y_free on Iceland cod and revert on raw mode', () => {
      const prod = {
        id: 'iceland-frozen-cod-800g',
        price: 7.00,
        packageSize: 800,
        packageUnit: 'g',
        deal: { rawText: 'Buy 2 Get 1 Free', type: 'buy_x_get_y_free', buyQuantity: 2, freeQuantity: 1 }
      };
      const item = { targetQuantity: 2400, unit: 'g' };

      const withDeals = PackSelector.calculatePacks(prod, item, { includeDeals: true });
      assert.equal(withDeals.packs, 3);
      assert.equal(withDeals.totalPrice, 14.00);
      assert.ok(withDeals.dealApplied);
      assert.equal(withDeals.dealApplied.savings, 7.00);

      const rawOnly = PackSelector.calculatePacks(prod, item, { includeDeals: false });
      assert.equal(rawOnly.packs, 3);
      assert.equal(rawOnly.totalPrice, 21.00);
      assert.equal(rawOnly.dealApplied, undefined);
    });
  });
});
