/**
 * Variant Optimizer — Size-Variant Fan-Out & Cheapest-Route Optimizer
 * Solves the "900g problem": Given pack variants (250g, 500g, 750g, 1kg) and user preferences,
 * determines the most economical combination to satisfy target quantity.
 */

import { DealCalculator } from './dealCalculator.js';
import {
  MEASURE_KINDS,
  getMeasureKind,
  toBaseQuantity,
  fromBaseQuantity,
  extractProductMeasure
} from './unitMeasure.js';

/**
 * Extract and normalize size to target units (g, ml, pints, count)
 */
function inferSize(product, targetUnit) {
  const targetKind = getMeasureKind(targetUnit);
  const measure = extractProductMeasure(product, targetUnit);

  // Loose produce cannot satisfy a mass target (e.g. courgettes/carrots)
  if (measure.isLoose && targetKind === MEASURE_KINDS.MASS) {
    return 0;
  }

  // Cross-dimension guard: product measure kind must match target kind
  if (measure.kind !== targetKind) {
    return 0;
  }

  // Both share physical dimension: convert product size to targetUnit
  const inBase = toBaseQuantity(measure.size, measure.unit).amountInBase;
  const inTarget = fromBaseQuantity(inBase, targetUnit);
  return Number(inTarget.toFixed(3));
}

/**
 * Calculate cost for N packs of a variant respecting includeDeals toggle
 */
function calculateVariantCost(variant, count, includeDeals) {
  const unitPrice = Number(variant.price) || 0;
  if (!includeDeals || !variant.deal) {
    return {
      price: Number((unitPrice * count).toFixed(2)),
      dealApplied: null
    };
  }
  const dealResult = DealCalculator.calculateDealPrice(unitPrice, count, variant.deal);
  return {
    price: Number(dealResult.totalPrice.toFixed(2)),
    dealApplied: dealResult.isDealApplied ? dealResult.dealSummary || String(variant.deal) : null
  };
}

/**
 * Main VariantOptimizer implementation
 */
export class VariantOptimizer {
  /**
   * Optimize variants to fulfill item target quantity
   * @param {Array<object>} variants
   * @param {object} item { name, targetQuantity, unit }
   * @param {object} preferences { packSizingPolicy, includeDeals, allowMixedPackSizes }
   */
  static optimize(variants, item, preferences = {}) {
    if (!Array.isArray(variants) || variants.length === 0) {
      return null;
    }

    const targetQuantity = Number(item?.targetQuantity || item?.quantity) || 1;
    const targetUnit = String(item?.unit || 'g').toLowerCase().trim();
    const policy = preferences.packSizingPolicy || 'closest';
    const includeDeals = preferences.includeDeals !== false;
    const allowMixed = preferences.allowMixedPackSizes === true;

    // Filter and prepare valid variants
    const candidateVariants = variants
      .map(v => {
        const sizeInTarget = inferSize(v, targetUnit);
        return {
          raw: v,
          id: v.id || v.productId || v.name,
          title: v.title || v.name,
          price: Number(v.price) || 0,
          deal: v.deal || null,
          size: sizeInTarget
        };
      })
      .filter(v => v.size > 0 && v.price > 0);

    if (candidateVariants.length === 0) {
      return null;
    }

    const candidateRoutes = [];

    if (!allowMixed) {
      // Single-variant mode: only 1 variant allowed, N packs (1..12)
      for (const variant of candidateVariants) {
        for (let count = 1; count <= 12; count++) {
          const totalQuantity = count * variant.size;
          const { price, dealApplied } = calculateVariantCost(variant.raw, count, includeDeals);
          candidateRoutes.push({
            lines: [{ product: variant.raw, packs: count, subtotal: price }],
            totalQuantity,
            totalPrice: price,
            dealApplied,
            variantsUsed: 1
          });
        }
      }
    } else {
      // Mixed mode: allow combinations of up to 12 total packs across variants
      // Generate single variant options first
      for (const variant of candidateVariants) {
        for (let count = 1; count <= 12; count++) {
          const totalQuantity = count * variant.size;
          const { price, dealApplied } = calculateVariantCost(variant.raw, count, includeDeals);
          candidateRoutes.push({
            lines: [{ product: variant.raw, packs: count, subtotal: price }],
            totalQuantity,
            totalPrice: price,
            dealApplied,
            variantsUsed: 1
          });
        }
      }

      // Generate pairs of variants
      for (let i = 0; i < candidateVariants.length; i++) {
        for (let j = i + 1; j < candidateVariants.length; j++) {
          const v1 = candidateVariants[i];
          const v2 = candidateVariants[j];
          for (let c1 = 1; c1 <= 8; c1++) {
            for (let c2 = 1; c2 <= 8; c2++) {
              if (c1 + c2 > 12) continue;
              const q1 = c1 * v1.size;
              const q2 = c2 * v2.size;
              const totalQuantity = q1 + q2;
              const res1 = calculateVariantCost(v1.raw, c1, includeDeals);
              const res2 = calculateVariantCost(v2.raw, c2, includeDeals);
              const totalPrice = Number((res1.price + res2.price).toFixed(2));
              const deals = [res1.dealApplied, res2.dealApplied].filter(Boolean);
              candidateRoutes.push({
                lines: [
                  { product: v1.raw, packs: c1, subtotal: res1.price },
                  { product: v2.raw, packs: c2, subtotal: res2.price }
                ],
                totalQuantity,
                totalPrice,
                dealApplied: deals.length ? deals.join('; ') : null,
                variantsUsed: 2
              });
            }
          }
        }
      }
    }

    // Filter routes by policy
    let validRoutes;
    if (policy === 'cover' || policy === 'cheapest_overall') {
      validRoutes = candidateRoutes.filter(r => r.totalQuantity >= targetQuantity);
      if (validRoutes.length === 0) {
        validRoutes = candidateRoutes; // Fallback to all if none fully covers
      }
      // Sort by: 1) totalPrice ascending (with tie-breaking for fewer packs on negligible price diff), 2) totalQuantity ascending
      validRoutes.sort((a, b) => {
        const packsA = a.lines.reduce((s, l) => s + l.packs, 0);
        const packsB = b.lines.reduce((s, l) => s + l.packs, 0);
        const priceDiff = a.totalPrice - b.totalPrice;
        if (Math.abs(priceDiff) > Math.max(0.05, Math.min(a.totalPrice, b.totalPrice) * 0.03)) {
          return priceDiff;
        }
        if (packsA !== packsB) {
          return packsA - packsB;
        }
        if (Math.abs(priceDiff) > 0.001) {
          return priceDiff;
        }
        return a.totalQuantity - b.totalQuantity;
      });
    } else if (policy === 'exact_only') {
      validRoutes = candidateRoutes.filter(r => Math.abs(r.totalQuantity - targetQuantity) < 0.001);
      if (validRoutes.length === 0) return null;
      validRoutes.sort((a, b) => a.totalPrice - b.totalPrice);
    } else {
      // Default: 'closest'
      validRoutes = [...candidateRoutes];
      validRoutes.sort((a, b) => {
        const diffA = Math.abs(a.totalQuantity - targetQuantity);
        const diffB = Math.abs(b.totalQuantity - targetQuantity);
        if (Math.abs(diffA - diffB) > 0.001) {
          return diffA - diffB;
        }
        return a.totalPrice - b.totalPrice;
      });
    }

    const best = validRoutes[0];
    if (!best) return null;

    const effectiveUnitPrice = best.totalQuantity > 0
      ? Number((best.totalPrice / best.totalQuantity).toFixed(4))
      : best.totalPrice;
    const weightDiff = Number((((best.totalQuantity - targetQuantity) / targetQuantity) * 100).toFixed(1));

    let explanation;
    if (best.lines.length === 1) {
      const line = best.lines[0];
      explanation = `${line.packs}x ${line.product.title || 'pack'} (${best.totalQuantity}${targetUnit}) for £${best.totalPrice.toFixed(2)}`;
    } else {
      const parts = best.lines.map(l => `${l.packs}x ${l.product.title || 'pack'}`);
      explanation = `${parts.join(' + ')} giving ${best.totalQuantity}${targetUnit} for £${best.totalPrice.toFixed(2)}`;
    }
    if (best.dealApplied) {
      explanation += ` (deal applied: ${best.dealApplied})`;
    }

    return {
      lines: best.lines,
      totalQuantity: best.totalQuantity,
      unit: targetUnit,
      totalPrice: best.totalPrice,
      effectiveUnitPrice,
      weightDifferencePercent: weightDiff,
      dealApplied: best.dealApplied,
      explanation
    };
  }
}

export const optimize = VariantOptimizer.optimize;
