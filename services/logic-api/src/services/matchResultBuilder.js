import { PackSelector } from './packSelector.js';
import { VariantOptimizer } from './variantOptimizer.js';
import { DealCalculator } from './dealCalculator.js';
import { composeConfidence } from './confidence.js';
import { KeywordExtractor } from './keywordExtractor.js';
import { isContaminated } from './contaminationRules.js';

export function getTitleCore(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|litre|ltr|l|ml|pints?|pt|pk|pack)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonical Match Result Builder
 *
 * Centralizes construction and mutation of match results across:
 * - Rules matching (FuzzyMatcher)
 * - AI review selection (AiDecisionReviewer)
 * - AI escalation selection (AiEscalation)
 * - Explicit model declines (honest no-match)
 * - User pack / swap overrides (Task 05)
 *
 * Guarantees that all dependent fields (packs, total quantity, total price,
 * unit price, deals, variant lines, explanation, and two-axis confidence)
 * are rebuilt together coherently.
 */
export class MatchResultBuilder {
  /**
   * Constructs an honest, coherent NO-MATCH result object.
   */
  static buildNoMatch({
    item,
    supermarket,
    scoredCandidates = [],
    preferences = {},
    reason = 'Item not found in catalog; clickable live search provided.',
    aiReasoning = null,
    matchSource = 'none'
  }) {
    const noMatch = {
      parsedItem: item,
      supermarket,
      product: null,
      packsNeeded: 1,
      totalQuantity: 0,
      totalPrice: 0,
      effectiveUnitPrice: 0,
      weightDifferencePercent: 0,
      isClosestPack: false,
      weightShortfall: null,
      isEstimated: false,
      matchScore: 0,
      runnerUp: null,
      lines: [],
      variantRoute: [],
      explanation: aiReasoning || reason || 'No suitable match found in catalog.',
      routeExplanation: aiReasoning || reason || 'No suitable match found in catalog.',
      confidenceScore: 0,
      confidenceSource: 'none',
      confidence: '0% verified (no match)',
      dataConfidence: 0,
      matchConfidence: 0,
      matchSource: matchSource || 'none',
      aiReasoning: aiReasoning || undefined,
      dealApplied: undefined,
      reason,
      alternatives: []
    };

    if (scoredCandidates && scoredCandidates.length > 0) {
      Object.defineProperty(noMatch, 'scoredCandidates', {
        value: scoredCandidates,
        enumerable: false,
        writable: true,
        configurable: true
      });
      Object.defineProperty(noMatch, 'rejectedCandidates', {
        value: scoredCandidates.filter((s) => s.eligible === false || s.score < 25),
        enumerable: false,
        writable: true,
        configurable: true
      });
    }

    return noMatch;
  }

  /**
   * Constructs a complete, coherent match result object.
   */
  static buildMatchResult({
    item,
    supermarket,
    product,
    scoredCandidates = [],
    preferences = {},
    matchScore = 80,
    runnerUp = null,
    confidenceMeta = {},
    packOverrides = null,
    optimizeVariants = false,
    keywords = null,
    lines: explicitLines = null,
    alternatives: explicitAlternatives = null
  }) {
    if (!product) {
      return this.buildNoMatch({
        item,
        supermarket,
        scoredCandidates,
        preferences,
        reason: confidenceMeta.aiReasoning || 'No suitable match found in catalog.',
        aiReasoning: confidenceMeta.aiReasoning || null,
        matchSource: confidenceMeta.matchSource || 'none'
      });
    }

    let chosenProduct = product;
    let chosenPacks = 1;
    let chosenTotalQty = 0;
    let chosenTotalPrice = 0;
    let chosenWeightDiff = 0;
    let chosenDealApplied = undefined;
    let lines = explicitLines;
    let explanation = '';

    // 1. Pack and Route Calculation
    if (explicitLines && explicitLines.length > 0) {
      lines = explicitLines;
      chosenProduct = explicitLines[0].product || chosenProduct;
      chosenPacks = explicitLines.reduce((sum, l) => sum + (l.packs || 1), 0);
      chosenTotalPrice = Number(explicitLines.reduce((sum, l) => sum + (l.subtotal || 0), 0).toFixed(2));
      let totalQtyInBase = explicitLines.reduce((sum, l) => {
        const pSize = Number(l.product?.packageSize) || 1;
        return sum + (l.packs || 1) * pSize;
      }, 0);
      chosenTotalQty = totalQtyInBase;
      explanation = explicitLines.map((l) => `${l.packs}x ${l.product?.title}`).join(', ');
    } else if (optimizeVariants && !packOverrides) {
      const bestTitleCore = getTitleCore(chosenProduct.title);
      const isBestCatalog = chosenProduct.source === 'catalog';
      const isBestLoose = /\bloose\b/i.test(chosenProduct.title);

      const productVariants = scoredCandidates
        .filter((s) => s.product && s.score >= 25 && s.product.price > 0 && s.eligible !== false)
        .filter((s) => {
          const isCat = s.product.source === 'catalog';
          if (isBestCatalog !== isCat) return false;
          const isCandLoose = /\bloose\b/i.test(s.product.title);
          if (isBestLoose !== isCandLoose) return false;
          if (s.product.id === chosenProduct.id) return true;
          const sTitleCore = getTitleCore(s.product.title);
          return sTitleCore === bestTitleCore || (sTitleCore.length > 5 && (bestTitleCore.includes(sTitleCore) || sTitleCore.includes(bestTitleCore)));
        })
        .map((s) => s.product);

      const packResult = PackSelector.calculatePacks(chosenProduct, item, preferences);
      chosenPacks = packResult.packs;
      chosenTotalQty = packResult.totalQty;
      chosenTotalPrice = packResult.totalPrice;
      chosenWeightDiff = packResult.weightDiffPct;
      chosenDealApplied = packResult.dealApplied;
      lines = [{ product: chosenProduct, packs: chosenPacks, subtotal: chosenTotalPrice }];
      explanation = `${chosenPacks}x ${chosenProduct.title}`;

      if (productVariants.length > 1) {
        const optRoute = VariantOptimizer.optimize(productVariants, item, preferences);
        if (optRoute && optRoute.lines && optRoute.lines.length > 0) {
          lines = optRoute.lines;
          explanation = optRoute.explanation;
          chosenProduct = optRoute.lines[0].product;
          chosenPacks = optRoute.lines.reduce((sum, l) => sum + l.packs, 0);

          const targetUnit = String(item?.unit || '').toLowerCase();
          let totalQtyInBase = optRoute.totalQuantity;
          if (targetUnit === 'kg' || targetUnit === 'l') {
            totalQtyInBase = Math.round(optRoute.totalQuantity * 1000);
          }

          chosenTotalQty = totalQtyInBase;
          chosenTotalPrice = optRoute.totalPrice;
          chosenWeightDiff = optRoute.weightDifferencePercent;
          if (optRoute.dealApplied) {
            chosenDealApplied = {
              dealText: optRoute.dealApplied,
              originalPrice: Number((chosenProduct.price * chosenPacks).toFixed(2)),
              discountedPrice: chosenTotalPrice,
              savings: Number((chosenProduct.price * chosenPacks - chosenTotalPrice).toFixed(2)),
              effectiveUnitPrice: optRoute.effectiveUnitPrice,
              summary: optRoute.dealApplied
            };
          }
        }
      }
    } else if (packOverrides && typeof packOverrides.packs === 'number' && packOverrides.packs > 0) {
      const { prodAmount } = PackSelector.normalizeAmounts(item, chosenProduct);
      chosenPacks = packOverrides.packs;
      chosenTotalQty = chosenPacks * (prodAmount || 1);
      const includeDeals = preferences.includeDeals !== false;
      const loyaltyPrice = chosenProduct.clubcardPrice || chosenProduct.nectarPrice || chosenProduct.loyaltyPrice;
      const basePrice = (includeDeals && loyaltyPrice) ? loyaltyPrice : chosenProduct.price;
      chosenTotalPrice = Number((chosenPacks * (basePrice || 0)).toFixed(2));

      if (includeDeals && chosenProduct.deal) {
        const dealCalc = DealCalculator.calculateDealPrice(chosenProduct.price, chosenPacks, chosenProduct.deal);
        if (dealCalc.isDealApplied) {
          chosenTotalPrice = dealCalc.totalPrice;
          chosenDealApplied = {
            dealText: chosenProduct.deal.badge || chosenProduct.deal.rawText,
            originalPrice: dealCalc.standardPrice,
            discountedPrice: dealCalc.totalPrice,
            savings: dealCalc.savings,
            effectiveUnitPrice: dealCalc.effectiveUnitPrice,
            summary: dealCalc.dealSummary
          };
        }
      }

      if (includeDeals && !chosenDealApplied && basePrice < chosenProduct.price) {
        const standardPrice = Number((chosenPacks * chosenProduct.price).toFixed(2));
        const savings = Number((standardPrice - chosenTotalPrice).toFixed(2));
        if (savings > 0) {
          const scheme = chosenProduct.clubcardPrice ? 'Clubcard' : (chosenProduct.nectarPrice ? 'Nectar' : 'Loyalty');
          chosenDealApplied = {
            dealText: `${scheme} Price`,
            originalPrice: standardPrice,
            discountedPrice: chosenTotalPrice,
            savings,
            effectiveUnitPrice: basePrice,
            summary: `${scheme} Price: £${basePrice.toFixed(2)}/item`
          };
        }
      }
      const targetBase = PackSelector.normalizeAmounts(item, chosenProduct).targetAmount;
      chosenWeightDiff = targetBase > 0 ? Math.round(((chosenTotalQty - targetBase) / targetBase) * 100) : 0;
      lines = [{ product: chosenProduct, packs: chosenPacks, subtotal: chosenTotalPrice }];
      explanation = `${chosenPacks}x ${chosenProduct.title}`;
    } else {
      const packResult = PackSelector.calculatePacks(chosenProduct, item, preferences);
      chosenPacks = packResult.packs;
      chosenTotalQty = packResult.totalQty;
      chosenTotalPrice = packResult.totalPrice;
      chosenWeightDiff = packResult.weightDiffPct;
      chosenDealApplied = packResult.dealApplied;
      lines = [{ product: chosenProduct, packs: chosenPacks, subtotal: chosenTotalPrice }];
      explanation = `${chosenPacks}x ${chosenProduct.title}`;
    }

    // 2. Shortfall & Estimates
    const weightShortfall = PackSelector.detectShortfall(item, chosenTotalQty);
    const isCatalog = chosenProduct.source === 'catalog';
    const isDirect = chosenProduct.source === 'direct';
    const isEstimated = isCatalog || chosenProduct.isEstimated === true;
    const dataSource = chosenProduct.source || (isCatalog ? 'catalog' : (isDirect ? 'direct' : 'aggregator'));

    // 3. Two-Axis Confidence Composition
    let matchSource = confidenceMeta.matchSource || (isCatalog ? 'catalog' : 'fuzzy');
    let matchConfidence = confidenceMeta.matchConfidence;
    if (matchConfidence === undefined || matchConfidence === null) {
      if (matchSource === 'ai' || matchSource === 'ai-cached' || matchSource === 'ai-escalation') {
        matchConfidence = 0.85;
      } else {
        matchConfidence = Math.min(1.0, Math.max(0.5, (matchScore || 80) / 100));
      }
    }

    const conf = composeConfidence({
      dataSource,
      matchConfidence,
      matchSource,
      customLabel: confidenceMeta.customLabel || chosenProduct.confidence || null,
      store: supermarket
    });

    // 4. Alternatives for Swap Picker
    let alternatives = explicitAlternatives;
    if (!alternatives && scoredCandidates && scoredCandidates.length > 0) {
      const effectiveKeywords = keywords || (item ? KeywordExtractor.extractKeywords(item) : []);
      const itemText = `${item?.baseItem || ''} ${item?.name || ''}`.toLowerCase();
      alternatives = scoredCandidates
        .filter((s) => {
          if (!s.product || s.score < 25 || s.eligible === false) return false;
          if (s.product.id === chosenProduct.id) return false;
          const prodTitle = (s.product.title || '').toLowerCase();
          if (isContaminated(itemText, prodTitle, s.product)) return false;
          if (item?.category && s.product.category && item.category !== 'general' && s.product.category !== 'general') {
            if (item.category !== s.product.category) return false;
          }
          if (effectiveKeywords.length > 0) {
            return effectiveKeywords.some((n) => {
              const stem = n.endsWith('es') ? n.slice(0, -2) : (n.endsWith('s') ? n.slice(0, -1) : n);
              return prodTitle.includes(n) || (stem.length >= 3 && prodTitle.includes(stem));
            });
          }
          return true;
        })
        .slice(0, 16)
        .map((s) => s.product);
    }

    const result = {
      parsedItem: item,
      supermarket,
      product: chosenProduct,
      packsNeeded: chosenPacks,
      totalQuantity: chosenTotalQty,
      totalPrice: chosenTotalPrice,
      effectiveUnitPrice: chosenDealApplied
        ? chosenDealApplied.effectiveUnitPrice
        : chosenProduct.unitPrice,
      weightDifferencePercent: chosenWeightDiff,
      isClosestPack: Math.abs(chosenWeightDiff) < 25,
      weightShortfall,
      isEstimated,
      matchScore,
      runnerUp,
      lines,
      variantRoute: lines,
      explanation,
      routeExplanation: explanation,
      ...conf,
      dealApplied: chosenDealApplied || undefined,
      alternatives: alternatives || []
    };

    if (confidenceMeta.aiReasoning) {
      result.aiReasoning = confidenceMeta.aiReasoning;
    }
    if (confidenceMeta.matchBadge) {
      result.matchBadge = confidenceMeta.matchBadge;
    }

    if (scoredCandidates && scoredCandidates.length > 0) {
      Object.defineProperty(result, 'scoredCandidates', {
        value: scoredCandidates,
        enumerable: false,
        writable: true,
        configurable: true
      });
      Object.defineProperty(result, 'rejectedCandidates', {
        value: scoredCandidates.filter((s) => s.eligible === false || s.score < 25),
        enumerable: false,
        writable: true,
        configurable: true
      });
    }

    return result;
  }

  /**
   * Applies an AI decision, escalation decision, or manual selection to an existing match.
   */
  static applySelection(currentMatch, selection, options = {}) {
    if (!currentMatch) {
      return null;
    }
    if (!selection) {
      return currentMatch;
    }

    const item = currentMatch.parsedItem || options.item;
    const supermarket = currentMatch.supermarket || options.supermarket;
    const scoredCandidates = currentMatch.scoredCandidates || options.scoredCandidates || [];
    const preferences = options.preferences || {};

    // 1. Explicit model decline: produces a clean no-match with no stale product or deal
    const isDecline =
      selection.product === null ||
      selection.selectedIndex === null ||
      selection.declined === true;

    if (isDecline) {
      return this.buildNoMatch({
        item,
        supermarket,
        scoredCandidates,
        preferences,
        reason: selection.reasoning || selection.aiReasoning || 'Model declined all candidates: honest no match',
        aiReasoning: selection.aiReasoning || selection.reasoning || null,
        matchSource: selection.matchSource || 'ai'
      });
    }

    // 2. Model failure check: fallback without AI matchSource must not claim AI approval
    const isAiSuccess =
      selection.matchSource === 'ai' ||
      selection.matchSource === 'ai-cached' ||
      selection.matchSource === 'ai-escalation';

    if (!isAiSuccess && !selection.isUserSwap) {
      // Model failed or returned raw candidate without AI approval: keep current match
      return currentMatch;
    }

    // 3. Selection of product (changed or unchanged)
    const chosenProduct = selection.product || (selection.id ? selection : null);
    if (!chosenProduct) {
      return currentMatch;
    }

    const matchSource = selection.matchSource || (selection.isUserSwap ? 'user-swap' : 'ai');
    const matchConfidence = typeof selection.matchConfidence === 'number'
      ? selection.matchConfidence
      : (typeof selection.confidence === 'number' ? selection.confidence : 0.85);
    const aiReasoning = selection.aiReasoning || selection.reasoning || undefined;
    const matchBadge = selection.matchBadge || (matchSource === 'ai-cached' ? 'AI Cached' : (matchSource === 'ai-escalation' ? 'AI Escalation' : 'AI Reviewed'));

    let updatedAlternatives = currentMatch.alternatives || null;
    if (selection.isUserSwap && updatedAlternatives && chosenProduct) {
      const remaining = updatedAlternatives.filter((p) => p && p.id !== chosenProduct.id);
      if (currentMatch.product && currentMatch.product.id !== chosenProduct.id) {
        updatedAlternatives = [currentMatch.product, ...remaining];
      } else {
        updatedAlternatives = remaining;
      }
    }

    return this.buildMatchResult({
      item,
      supermarket,
      product: chosenProduct,
      scoredCandidates,
      preferences,
      matchScore: currentMatch.matchScore || 80,
      runnerUp: currentMatch.runnerUp || null,
      confidenceMeta: {
        matchSource,
        matchConfidence,
        aiReasoning,
        matchBadge,
        customLabel: selection.confidenceLabel || null
      },
      packOverrides: options.packOverrides || selection.packOverrides || null,
      optimizeVariants: false,
      alternatives: updatedAlternatives
    });
  }
}
