/**
 * Unit of Measure Normalization & Dimension Sanity Engine
 */

export const MEASURE_KINDS = {
  MASS: 'MASS',
  VOLUME: 'VOLUME',
  COUNT: 'COUNT'
};

const MASS_UNITS = new Set([
  'g', 'gram', 'grams', 'g.', 'gm', 'gms',
  'kg', 'kilogram', 'kilograms', 'kg.', 'kgs'
]);

const VOLUME_UNITS = new Set([
  'ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters', 'ml.',
  'l', 'litre', 'litres', 'liter', 'liters', 'l.', 'ltr', 'ltrs',
  'pt', 'pint', 'pints', 'pt.'
]);

export function getMeasureKind(unit = '') {
  const u = String(unit || '').toLowerCase().trim();
  if (MASS_UNITS.has(u)) return MEASURE_KINDS.MASS;
  if (VOLUME_UNITS.has(u)) return MEASURE_KINDS.VOLUME;
  return MEASURE_KINDS.COUNT;
}

/**
 * Converts a quantity in a given unit into the dimension's canonical base quantity:
 * - MASS: base is grams (g)
 * - VOLUME: base is millilitres (ml)
 * - COUNT: base is integer units
 */
export function toBaseQuantity(amount, unit = '') {
  const qty = Number(amount) || 0;
  const u = String(unit || '').toLowerCase().trim();
  const kind = getMeasureKind(u);

  if (kind === MEASURE_KINDS.MASS) {
    if (u === 'kg' || u === 'kilogram' || u === 'kilograms' || u === 'kg.' || u === 'kgs') {
      return { amountInBase: qty * 1000, baseUnit: 'g', kind };
    }
    return { amountInBase: qty, baseUnit: 'g', kind };
  }

  if (kind === MEASURE_KINDS.VOLUME) {
    if (u === 'l' || u === 'litre' || u === 'litres' || u === 'liter' || u === 'liters' || u === 'l.' || u === 'ltr' || u === 'ltrs') {
      return { amountInBase: qty * 1000, baseUnit: 'ml', kind };
    }
    if (u === 'pt' || u === 'pint' || u === 'pints' || u === 'pt.') {
      return { amountInBase: qty * 568.261, baseUnit: 'ml', kind };
    }
    return { amountInBase: qty, baseUnit: 'ml', kind };
  }

  return { amountInBase: qty, baseUnit: 'count', kind };
}

/**
 * Converts a base quantity back into target units.
 */
export function fromBaseQuantity(baseAmount, targetUnit = '') {
  const base = Number(baseAmount) || 0;
  const u = String(targetUnit || '').toLowerCase().trim();
  const kind = getMeasureKind(u);

  if (kind === MEASURE_KINDS.MASS) {
    if (u === 'kg' || u === 'kilogram' || u === 'kilograms' || u === 'kg.' || u === 'kgs') {
      return base / 1000;
    }
    return base;
  }

  if (kind === MEASURE_KINDS.VOLUME) {
    if (u === 'l' || u === 'litre' || u === 'litres' || u === 'liter' || u === 'liters' || u === 'l.' || u === 'ltr' || u === 'ltrs') {
      return base / 1000;
    }
    if (u === 'pt' || u === 'pint' || u === 'pints' || u === 'pt.') {
      return base / 568.261;
    }
    return base;
  }

  return base;
}

/**
 * Extracts size, unit, physical dimension, and loose status from product fields and title.
 */
export function extractProductMeasure(prod, targetUnit = '') {
  const targetKind = getMeasureKind(targetUnit);
  const title = String(prod?.title || prod?.name || '');
  const titleLower = title.toLowerCase();
  const isLoose = /\bloose\b/i.test(titleLower);

  // 1. Compound multiplier in title (e.g. "2 x 400g", "3 x 100g")
  const multMatch = title.match(/\b(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)\s*(kg|g|litre|ltr|l|ml|pints?|pt)\b/i);
  if (multMatch) {
    const packs = parseFloat(multMatch[1]);
    const eachSize = parseFloat(multMatch[2]);
    const unit = multMatch[3].toLowerCase();
    const totalSize = packs * eachSize;
    const kind = getMeasureKind(unit);
    return { size: totalSize, unit, kind, isLoose: false };
  }

  // 2. Explicit packageSize and packageUnit on product object
  if (prod?.packageSize && Number(prod.packageSize) > 0) {
    const rawUnit = String(prod.packageUnit || '').toLowerCase().trim();
    const rawSize = Number(prod.packageSize);
    const kind = getMeasureKind(rawUnit);

    // If target is pints and product has explicit litres (e.g. 2.272L or 1.13L), check if title says Pints
    if (
      (targetUnit === 'pints' || targetUnit === 'pint' || targetUnit === 'pt') &&
      (rawUnit === 'l' || rawUnit === 'litre' || rawUnit === 'ltr')
    ) {
      const pintMatch = title.match(/\b(\d+(?:\.\d+)?)\s*pints?\b/i);
      if (pintMatch) {
        return { size: parseFloat(pintMatch[1]), unit: 'pints', kind: MEASURE_KINDS.VOLUME, isLoose };
      }
    }

    return { size: rawSize, unit: rawUnit, kind, isLoose };
  }

  // 3. Metric or volume in title (e.g. "2.272L, 4 Pints", "500g", "1.5kg", "250ml")
  if (targetUnit === 'pints' || targetUnit === 'pint' || targetUnit === 'pt') {
    const pintMatch = title.match(/\b(\d+(?:\.\d+)?)\s*pints?\b/i);
    if (pintMatch) {
      return { size: parseFloat(pintMatch[1]), unit: 'pints', kind: MEASURE_KINDS.VOLUME, isLoose };
    }
  }

  const metricMatch = title.match(/\b(\d+(?:\.\d+)?)\s*(kg|g|litre|ltr|l|ml|pints?|pt)\b/i);
  if (metricMatch) {
    const size = parseFloat(metricMatch[1]);
    const unit = metricMatch[2].toLowerCase();
    const kind = getMeasureKind(unit);
    return { size, unit, kind, isLoose };
  }

  // 4. Pack counts / pieces in title (for COUNT dimension items like eggs, bananas, onions count)
  if (targetKind !== MEASURE_KINDS.MASS) {
    const packMatch =
      title.match(/\b(\d+)\s*(?:pack|pk|piece|pieces|eggs?)\b/i) ||
      title.match(/\b(?:pack|pk)\s*of\s*(\d+)\b/i) ||
      title.match(/\b(\d+)\s*(?:large|medium|small)\b/i) ||
      title.match(/\bminimum\s*(\d+)\s*pack\b/i) ||
      title.match(/\b(\d+)\s*pack\s*minimum\b/i);

    if (packMatch) {
      const count = parseInt(packMatch[1], 10);
      if (count > 0) {
        return { size: count, unit: 'count', kind: MEASURE_KINDS.COUNT, isLoose };
      }
    }

    // Produce unit approximations
    if (/\bbunch\b/i.test(titleLower) || prod?.packageUnit === 'bunch') {
      return { size: 5, unit: 'count', kind: MEASURE_KINDS.COUNT, isLoose };
    }
    if (/\bhead\b/i.test(titleLower) || prod?.packageUnit === 'head') {
      return { size: 1, unit: 'count', kind: MEASURE_KINDS.COUNT, isLoose };
    }
    if (/\bbulb\b/i.test(titleLower) || prod?.packageUnit === 'bulb') {
      return { size: 1, unit: 'count', kind: MEASURE_KINDS.COUNT, isLoose };
    }
  }

  // 5. Pre-packaged produce/goods with no explicit weight in title (e.g. "Tesco Courgettes", "Apple 6 Pack")
  if (!isLoose && targetKind === MEASURE_KINDS.MASS) {
    return { size: 500, unit: 'g', kind: MEASURE_KINDS.MASS, isLoose: false };
  }

  // 6. Fallback for loose item or unstated
  return { size: 1, unit: isLoose ? 'item' : 'count', kind: MEASURE_KINDS.COUNT, isLoose };
}
