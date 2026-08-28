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
});
