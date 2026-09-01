import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VariantOptimizer } from './variantOptimizer.js';

describe('VariantOptimizer Unit Test Suite', () => {
  it('should solve the 900g mince problem with policy cover (2x500g beats 1x1kg)', () => {
    const variants = [
      { id: 'a', title: 'Beef Mince 250g', packageSize: 250, packageUnit: 'g', price: 1.6 },
      { id: 'b', title: 'Beef Mince 500g', packageSize: 500, packageUnit: 'g', price: 2.6 },
      { id: 'c', title: 'Beef Mince 750g', packageSize: 750, packageUnit: 'g', price: 5.0 },
      { id: 'd', title: 'Beef Mince 1kg', packageSize: 1, packageUnit: 'kg', price: 6.0 }
    ];
    const item = { name: 'beef mince', targetQuantity: 900, unit: 'g' };

    const result = VariantOptimizer.optimize(variants, item, { packSizingPolicy: 'cover', includeDeals: false });
    assert.ok(result);
    assert.ok(result.totalQuantity >= 900);
    assert.equal(result.totalPrice, 5.20);
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].packs, 2);
  });

  it('should factor multibuy deals into cheapest route when includeDeals is true', () => {
    const variants = [
      { id: 'b', title: 'Beef Mince 500g', packageSize: 500, packageUnit: 'g', price: 3.5, deal: '2 for £5' },
      { id: 'd', title: 'Beef Mince 1kg', packageSize: 1, packageUnit: 'kg', price: 6.0 }
    ];
    const item = { name: 'beef mince', targetQuantity: 900, unit: 'g' };

    const withDeals = VariantOptimizer.optimize(variants, item, { packSizingPolicy: 'cover', includeDeals: true });
    assert.equal(withDeals.totalPrice, 5.00);
    assert.ok(withDeals.dealApplied);

    const rawOnly = VariantOptimizer.optimize(variants, item, { packSizingPolicy: 'cover', includeDeals: false });
    assert.equal(rawOnly.totalPrice, 6.00);
  });

  it('should combine mixed pack sizes only when allowMixedPackSizes is true', () => {
    const variants = [
      { id: 'a', title: 'Mince 250g', packageSize: 250, packageUnit: 'g', price: 1.0 },
      { id: 'b', title: 'Mince 500g', packageSize: 500, packageUnit: 'g', price: 2.4 }
    ];
    const item = { name: 'mince', targetQuantity: 750, unit: 'g' };

    const single = VariantOptimizer.optimize(variants, item, { packSizingPolicy: 'cover', allowMixedPackSizes: false });
    assert.equal(single.lines.length, 1);

    const mixed = VariantOptimizer.optimize(variants, item, { packSizingPolicy: 'cover', allowMixedPackSizes: true });
    assert.ok(mixed.totalPrice <= single.totalPrice);
    assert.ok(mixed.lines.length >= 1);
  });
});
