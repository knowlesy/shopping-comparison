import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetricSize, normalizeSupermarket } from './geminiParser.js';

describe('GeminiDomParser pure helpers', () => {
  describe('parseMetricSize', () => {
    it('should parse weight in grams', () => {
      const res = parseMetricSize('500g', 'Beef Mince 500g');
      assert.equal(res.size, 500);
      assert.equal(res.unit, 'g');
    });

    it('should parse weight in kilograms and convert to grams', () => {
      const res = parseMetricSize('1.5kg', 'Maris Piper Potatoes 1.5kg');
      assert.equal(res.size, 1500);
      assert.equal(res.unit, 'g');
    });

    it('should parse volume in Litres and convert to ml', () => {
      const res = parseMetricSize('2L', 'Whole Milk 2L');
      assert.equal(res.size, 2000);
      assert.equal(res.unit, 'ml');
    });

    it('should parse British pints into ml equivalent', () => {
      const res = parseMetricSize('4 pints', 'Fresh British Semi-Skimmed Milk 4 Pints (2.27L)');
      assert.ok(res.size >= 2270 && res.size <= 2272);
      assert.equal(res.unit, 'ml');
    });

    it('should parse multiplier packs (e.g. 3 x 400g)', () => {
      const res = parseMetricSize('3 x 400g', 'Chopped Tomatoes 3x400g');
      assert.equal(res.size, 1200);
      assert.equal(res.unit, 'g');
    });

    it('should parse egg and piece pack counts', () => {
      const res = parseMetricSize('6 pack', 'Free Range Eggs 6 pack');
      assert.equal(res.size, 6);
      assert.equal(res.unit, 'pack');
    });
  });

  describe('normalizeSupermarket', () => {
    it('should recognize all 7 supported supermarket brand names', () => {
      assert.equal(normalizeSupermarket('Tesco', 'Tesco Milk'), 'tesco');
      assert.equal(normalizeSupermarket('ASDA', 'ASDA Eggs'), 'asda');
      assert.equal(normalizeSupermarket("Sainsbury's", 'Sainsburys Apples'), 'sainsburys');
      assert.equal(normalizeSupermarket('Morrisons', 'Morrisons Beef'), 'morrisons');
      assert.equal(normalizeSupermarket('Iceland', 'Iceland Fish Fillets'), 'iceland');
      assert.equal(normalizeSupermarket('Aldi', 'Everyday Essentials Eggs'), 'aldi');
      assert.equal(normalizeSupermarket('Lidl', 'Birchwood Mince'), 'lidl');
    });
  });
});
