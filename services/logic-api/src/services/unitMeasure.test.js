import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEASURE_KINDS,
  getMeasureKind,
  toBaseQuantity,
  fromBaseQuantity,
  extractProductMeasure
} from './unitMeasure.js';

describe('unitMeasure Engine', () => {
  it('should identify physical measure dimensions', () => {
    assert.equal(getMeasureKind('g'), MEASURE_KINDS.MASS);
    assert.equal(getMeasureKind('kg'), MEASURE_KINDS.MASS);
    assert.equal(getMeasureKind('ml'), MEASURE_KINDS.VOLUME);
    assert.equal(getMeasureKind('l'), MEASURE_KINDS.VOLUME);
    assert.equal(getMeasureKind('pints'), MEASURE_KINDS.VOLUME);
    assert.equal(getMeasureKind('item'), MEASURE_KINDS.COUNT);
    assert.equal(getMeasureKind('loaf'), MEASURE_KINDS.COUNT);
  });

  it('should convert quantities to base units accurately', () => {
    assert.deepEqual(toBaseQuantity(1.5, 'kg'), { amountInBase: 1500, baseUnit: 'g', kind: 'MASS' });
    assert.deepEqual(toBaseQuantity(500, 'g'), { amountInBase: 500, baseUnit: 'g', kind: 'MASS' });
    assert.deepEqual(toBaseQuantity(2, 'l'), { amountInBase: 2000, baseUnit: 'ml', kind: 'VOLUME' });
    const pintRes = toBaseQuantity(4, 'pints');
    assert.equal(pintRes.kind, 'VOLUME');
    assert.ok(Math.abs(pintRes.amountInBase - 2273.04) < 1);
  });

  it('should convert base units back to target units accurately', () => {
    assert.equal(fromBaseQuantity(1500, 'kg'), 1.5);
    assert.equal(fromBaseQuantity(500, 'g'), 500);
    assert.equal(fromBaseQuantity(2000, 'l'), 2);
    assert.ok(Math.abs(fromBaseQuantity(2273.04, 'pints') - 4) < 0.01);
  });

  it('should extract pack counts from egg titles', () => {
    const prod6 = { title: 'Big & Fresh Barn Eggs 6 Large' };
    const m6 = extractProductMeasure(prod6, 'item');
    assert.equal(m6.size, 6);
    assert.equal(m6.kind, MEASURE_KINDS.COUNT);

    const prod10 = { title: 'Happy Egg Large 10 Pack' };
    const m10 = extractProductMeasure(prod10, 'item');
    assert.equal(m10.size, 10);
    assert.equal(m10.kind, MEASURE_KINDS.COUNT);
  });

  it('should extract volume in pints for milk products', () => {
    const milk4 = {
      title: 'Tesco British Semi Skimmed Milk 2.272L, 4 Pints',
      packageSize: 2.272,
      packageUnit: 'l'
    };
    const m4 = extractProductMeasure(milk4, 'pints');
    assert.equal(m4.size, 4);
    assert.equal(m4.kind, MEASURE_KINDS.VOLUME);

    const milk2 = {
      title: 'Tesco British Semi Skimmed Milk 1.13L, 2 Pints',
      packageSize: 1.13,
      packageUnit: 'l'
    };
    const m2 = extractProductMeasure(milk2, 'pints');
    assert.equal(m2.size, 2);
    assert.equal(m2.kind, MEASURE_KINDS.VOLUME);
  });

  it('should flag loose produce and distinguish from pre-packaged', () => {
    const loose = { title: 'Tesco Courgettes Loose', price: 0.56 };
    const mLoose = extractProductMeasure(loose, 'g');
    assert.equal(mLoose.isLoose, true);

    const packaged = { title: 'Tesco Courgettes', price: 1.39 };
    const mPackaged = extractProductMeasure(packaged, 'g');
    assert.equal(mPackaged.isLoose, false);
    assert.equal(mPackaged.size, 500);
    assert.equal(mPackaged.kind, MEASURE_KINDS.MASS);
  });
});
