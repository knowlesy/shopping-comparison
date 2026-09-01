/**
 * Variant Optimizer — Size-Variant Fan-Out & Cheapest-Route Optimizer
 * Solves the "900g problem": Given pack variants (250g, 500g, 750g, 1kg) and user preferences,
 * determines the most economical combination to satisfy target quantity.
 */

import { DealCalculator } from './dealCalculator.js';

/**
 * Normalize product size to target units (g or ml or count)
 */
function normalizeSize(packageSize, packageUnit, targetUnit) {
  const size = Number(packageSize) || 0;
  const unit = String(packageUnit || '').toLowerCase().trim();
  const target = String(targetUnit || '').toLowerCase().trim();

  if (target === 'g') {
    if (unit === 'kg') return size * 1000;
    return size;
  }
  if (target === 'kg') {
    if (unit === 'g') return size / 1000;
    return size;
  }
  if (target === 'ml') {
    if (unit === 'l' || unit === 'litre' || unit === 'ltr') return size * 1000;
    if (unit === 'pt' || unit === 'pint' || unit === 'pints') return size * 568.261;
    return size;
  }
  if (target === 'l' || target === 'litre') {
    if (unit === 'ml') return size / 1000;
    return size;
  }
  return size;
}

/**
 * Extract size from title if packageSize is missing
 */
function inferSize(product, targetUnit) {
  if (product.packageSize && Number(product.packageSize) > 0) {
    return normalizeSize(product.packageSize, product.packageUnit, targetUnit);
  }
  const title = String(product.title || product.name || '');
  const match = title.match(/(\d+(?:\.\d+)?)\s*(kg|g|litre|ltr|l|ml|pints?|pt)\b/i);
  if (match) {
    return normalizeSize(parseFloat(match[1]), match[2], targetUnit);
  }
  return 1;
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
      // Sort by: 1) totalPrice ascending, 2) totalQuantity ascending
      validRoutes.sort((a, b) => {
        if (Math.abs(a.totalPrice - b.totalPrice) > 0.001) {
          return a.totalPrice - b.totalPrice;
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
