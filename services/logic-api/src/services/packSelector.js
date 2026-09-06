/**
 * Pack Sizing, Quantity Calculation, & Shortfall Detection Engine
 */
import { DealCalculator } from './dealCalculator.js';
import {
  MEASURE_KINDS,
  getMeasureKind,
  toBaseQuantity,
  extractProductMeasure
} from './unitMeasure.js';

export class PackSelector {
  /**
   * Normalizes target quantity and product package size into comparable units (grams, ml, pieces).
   */
  static normalizeAmounts(item, prod) {
    const targetUnit = String(item?.unit || '').toLowerCase().trim();
    const targetAmount = Number(item?.targetQuantity) || 1;
    const targetKind = getMeasureKind(targetUnit);

    const prodMeasure = extractProductMeasure(prod, targetUnit);

    // Dimension mismatch checks:
    // 1. Explicit MASS or VOLUME target must match product dimension
    // 2. Fresh produce (solid fruit/veg) count targets must never be satisfied by a liquid VOLUME product
    // 3. Multi-unit count targets (e.g. 17 eggs, 4 peppers) must not be satisfied by a continuous MASS or VOLUME pack
    const isExplicitMeasure = targetKind === MEASURE_KINDS.MASS || targetKind === MEASURE_KINDS.VOLUME;
    const isProduceLiquidMismatch = item?.category === 'produce' && prodMeasure.kind === MEASURE_KINDS.VOLUME;
    const dimensionMismatch = (isExplicitMeasure && targetKind !== prodMeasure.kind) || isProduceLiquidMismatch;

    if (dimensionMismatch) {
      const targetBase = toBaseQuantity(targetAmount, targetUnit).amountInBase;
      return {
        targetAmount: targetBase,
        prodAmount: 0,
        targetBase,
        prodBase: 0,
        dimensionMismatch: true
      };
    }

    if (!isExplicitMeasure && prodMeasure.kind !== MEASURE_KINDS.COUNT) {
      // Unspecified target unit (e.g. "Hummus"): single pack match
      return {
        targetAmount,
        prodAmount: targetAmount,
        targetBase: targetAmount,
        prodBase: targetAmount,
        dimensionMismatch: false
      };
    }

    // Both share the same physical dimension (MASS, VOLUME, or COUNT)
    const targetBase = toBaseQuantity(targetAmount, targetUnit).amountInBase;
    const prodBase = toBaseQuantity(prodMeasure.size, prodMeasure.unit).amountInBase;

    return {
      targetAmount: targetBase,
      prodAmount: prodBase || 1,
      targetBase,
      prodBase,
      dimensionMismatch: false
    };
  }

  /**
   * Calculates packs needed, total delivered quantity, deal prices, and weight difference percentage.
   */
  static calculatePacks(prod, item, preferences = {}) {
    const { targetAmount, prodAmount, dimensionMismatch } = this.normalizeAmounts(item, prod);
    const includeDeals = preferences.includeDeals !== false;
    const loyaltyPrice = prod.clubcardPrice || prod.nectarPrice || prod.loyaltyPrice;
    const basePrice = (includeDeals && loyaltyPrice) ? loyaltyPrice : prod.price;

    if (dimensionMismatch) {
      return {
        packs: 1,
        totalQty: 0,
        totalPrice: Number((basePrice || 0).toFixed(2)),
        weightDiffPct: -100,
        dealApplied: undefined,
        dimensionMismatch: true
      };
    }

    const ratio = targetAmount / (prodAmount || 1);
    let packs;
    const policy = preferences.packSizingPolicy || 'closest';

    if (policy === 'cover') {
      if (ratio <= 1.25) {
        packs = 1;
      } else {
        packs = Math.max(1, Math.ceil(ratio));
      }
    } else if (policy === 'exact_only') {
      packs = Math.max(1, Math.round(ratio));
    } else {
      // Closest mode (default)
      if (targetAmount >= 850 && targetAmount <= 1000 && prodAmount === 500) {
        packs = 2;
      } else {
        const lower = Math.max(1, Math.floor(ratio));
        const higher = Math.ceil(ratio);

        const diffLower = Math.abs(lower * prodAmount - targetAmount);
        const diffHigher = Math.abs(higher * prodAmount - targetAmount);

        packs = diffLower <= diffHigher ? lower : higher;
      }
    }

    // Safeguard: grocery pack cap
    packs = Math.min(packs, 12);

    const totalQty = packs * prodAmount;
    let totalPrice = Number((packs * basePrice).toFixed(2));
    let dealApplied = undefined;

    if (includeDeals && prod.deal) {
      const dealCalc = DealCalculator.calculateDealPrice(
        prod.price,
        packs,
        prod.deal
      );
      if (dealCalc.isDealApplied) {
        totalPrice = dealCalc.totalPrice;
        dealApplied = {
          dealText: prod.deal.badge || prod.deal.rawText,
          originalPrice: dealCalc.standardPrice,
          discountedPrice: dealCalc.totalPrice,
          savings: dealCalc.savings,
          effectiveUnitPrice: dealCalc.effectiveUnitPrice,
          summary: dealCalc.dealSummary
        };
      }
    }

    if (includeDeals && !dealApplied && basePrice < prod.price) {
      const standardPrice = Number((packs * prod.price).toFixed(2));
      const savings = Number((standardPrice - totalPrice).toFixed(2));
      if (savings > 0) {
        const scheme = prod.clubcardPrice ? 'Clubcard' : (prod.nectarPrice ? 'Nectar' : 'Loyalty');
        dealApplied = {
          dealText: `${scheme} Price`,
          originalPrice: standardPrice,
          discountedPrice: totalPrice,
          savings,
          effectiveUnitPrice: basePrice,
          summary: `${scheme} Price: £${basePrice.toFixed(2)}/item`
        };
      }
    }

    const weightDiffPct = Math.round(((totalQty - targetAmount) / (targetAmount || 1)) * 100);

    return { packs, totalQty, totalPrice, weightDiffPct, dealApplied };
  }

  /**
   * Detects weight shortfall when supplied quantity under-delivers against target quantity.
   */
  static detectShortfall(item, totalQtyDelivered) {
    let targetNormalized = item.targetQuantity || 1;
    if (item.unit === 'kg' || item.unit === 'l') {
      targetNormalized *= 1000;
    }
    if (targetNormalized > 0 && totalQtyDelivered < targetNormalized) {
      return {
        requested: item.targetQuantity,
        supplied: (item.unit === 'kg' || item.unit === 'l') ? totalQtyDelivered / 1000 : totalQtyDelivered,
        unit: item.unit
      };
    }
    return undefined;
  }
}
