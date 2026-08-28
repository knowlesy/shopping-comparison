/**
 * Pack Sizing, Quantity Calculation, & Shortfall Detection Engine
 */
import { DealCalculator } from './dealCalculator.js';

export class PackSelector {
  /**
   * Normalizes target quantity and product package size into comparable units (grams, ml, pieces).
   */
  static normalizeAmounts(item, prod) {
    let targetAmount = item.targetQuantity || 1;
    let prodAmount = prod.packageSize || 1;

    if (item.unit === 'kg') targetAmount *= 1000;
    if (item.unit === 'l') targetAmount *= 1000;
    if (item.unit === 'pints' || item.unit === 'pint') targetAmount *= 568;

    if (prod.packageUnit === 'kg') prodAmount *= 1000;
    if (prod.packageUnit === 'l') prodAmount *= 1000;

    // Bunch of bananas / produce handling (approx 5 items per bunch)
    if (
      (item.unit === 'item' || item.unit === 'piece' || !item.unit) &&
      (prod.packageUnit === 'bunch' || (prod.title && prod.title.toLowerCase().includes('bunch')))
    ) {
      prodAmount = 5;
    }

    if ((item.unit === 'g' || item.unit === 'kg') && prodAmount <= 1) {
      prodAmount = 500;
    }
    if ((item.unit === 'l' || item.unit === 'ml' || item.unit === 'pints') && prodAmount <= 1) {
      prodAmount = 1000;
    }

    return { targetAmount, prodAmount };
  }

  /**
   * Calculates packs needed, total delivered quantity, deal prices, and weight difference percentage.
   */
  static calculatePacks(prod, item, preferences = {}) {
    const { targetAmount, prodAmount } = this.normalizeAmounts(item, prod);
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

    const includeDeals = preferences.includeDeals !== false;
    const basePrice = includeDeals ? (prod.clubcardPrice || prod.price) : prod.price;
    const totalQty = packs * prodAmount;
    let totalPrice = Number((packs * basePrice).toFixed(2));
    let dealApplied = undefined;

    if (includeDeals && prod.deal) {
      const dealCalc = DealCalculator.calculateDealPrice(
        basePrice,
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
