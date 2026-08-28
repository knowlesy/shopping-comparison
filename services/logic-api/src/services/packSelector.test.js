import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PackSelector } from './packSelector.js';

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

  it('should return undefined shortfall when delivered quantity meets or exceeds target', () => {
    const item = { targetQuantity: 500, unit: 'g' };
    const shortfall = PackSelector.detectShortfall(item, 500);
    assert.equal(shortfall, undefined);
  });
});
