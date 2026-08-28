/**
 * Penalty & Scoring Rules Engine for Supermarket Candidates
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isContaminated } from './contaminationRules.js';
import { KeywordExtractor } from './keywordExtractor.js';
import { PackSelector } from './packSelector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const candidatePaths = [
  process.env.MATCHING_RULES_PATH,
  path.resolve(__dirname, '../../../../data/matching-rules.json'),
  path.resolve(__dirname, '../../data/matching-rules.json'),
  path.resolve(process.cwd(), 'data/matching-rules.json'),
  path.resolve(__dirname, 'matching-rules.json')
].filter(Boolean);

let rawRules = null;
for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    try {
      rawRules = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    } catch (e) {
      console.warn('[PenaltyRules] Failed parsing matching-rules.json from', p, e.message);
    }
  }
}

export const rules = rawRules || {
  fishCuts: ['loin', 'loins', 'fillet', 'fillets', 'portion', 'portions', 'steak', 'steaks'],
  meatCuts: ['mince', 'minced', 'steak mince', 'breast', 'breasts', 'diced', 'chops'],
  speciesRules: [
    { trigger: 'cod', mustContain: 'cod', penalty: 80 },
    { trigger: 'beef', mustContain: 'beef', penalty: 80 },
    { trigger: 'sweet potato', mustContain: 'sweet potato', penalty: 150 }
  ],
  pulseRules: [
    { trigger: 'beans', mustContain: 'bean', penalty: 80 },
    { trigger: 'lentils', mustContain: 'lentil', penalty: 80 }
  ],
  supplementTerms: [
    'liver oil', 'multivitamins', 'supplements', 'capsules', 'tablets', 'in sauce', 'parsley sauce', 'butter sauce'
  ],
  processedBreadedTerms: [
    'finger', 'fish finger', 'battered', 'breaded', 'crumbed', 'fish cake', 'fishcake'
  ],
  readyMealTerms: [
    'gravy', 'in gravy', '& gravy', 'and gravy', 'ready meal', 'meal for one', 'hotpot',
    'lasagne', 'lasagna', 'cottage pie', 'shepherd', 'pasta bake', 'chilli con carne', 'bolognese ready', 'casserole', 'stew',
    'pet food', 'cat food', 'dog food', 'pie'
  ],
  unitApproximations: {
    bunch: 5,
    head: 1,
    bulb: 1
  }
};

const hasAny = (text, terms) => Array.isArray(terms) && terms.some((t) => text.indexOf(t) !== -1);

export class PenaltyRules {
  /**
   * Evaluates and scores candidate products against parsed user items.
   */
  /**
   * SCORING SCALE SPECIFICATION:
   * - Range: -500 (hard veto) to ~120 (perfect multi-attribute match)
   * - Floor: 25 (minimum score required for acceptance as match/alternative)
   * - 0 to 24: Unrelated, marginal, or heavily penalized items (rejected by floor)
   * - 25 to 49: Acceptable fallback/partial matches
   * - 50 to 79: Solid match on primary food noun and sensible pack size
   * - 80+: Highly accurate match matching dietary, tier, and specific cuts
   */
  static scoreCandidate(prod, item, keywords, preferences = {}) {
    // 0. Hard Category Guard: Prevent Cross-Category Contamination
    if (
      item.category &&
      prod.category &&
      item.category !== 'general' &&
      prod.category !== 'general' &&
      item.category !== prod.category
    ) {
      return { score: -500, packs: 1, totalQty: 1, totalPrice: 0, weightDiffPct: 0 };
    }

    const titleLower = prod.title.toLowerCase();
    const itemText = `${item.baseItem || ''} ${item.name || ''}`.toLowerCase();

    // Contamination guard check
    if (isContaminated(itemText, titleLower)) {
      return { score: -500, packs: 1, totalQty: 1, totalPrice: 0, weightDiffPct: 0 };
    }

    // Noun evidence requirement
    if (keywords.length > 0 && !KeywordExtractor.hasNounEvidence(keywords, prod.title)) {
      return { score: -500, packs: 1, totalQty: 1, totalPrice: 0, weightDiffPct: 0 };
    }

    let score = 0;
    const itemLower = (item.name || '').toLowerCase();

    // 1. Semantic Cut & Form Flexibility
    const isStrictCut = preferences.cutMatchingStrategy === 'strict_cut';
    let effectiveTitle = titleLower;

    if (!isStrictCut) {
      if (item.category === 'fish' && rules.fishCuts.some((cut) => titleLower.indexOf(cut) !== -1)) {
        effectiveTitle += ' loin loins fillet fillets portion portions';
      }
      if (item.category === 'meat' && rules.meatCuts.some((cut) => titleLower.indexOf(cut) !== -1)) {
        effectiveTitle += ' mince minced steak breast fillets';
      }
    } else {
      for (const cut of ['loin', 'fillet', 'breast', 'thigh']) {
        if (itemLower.indexOf(cut) !== -1 && titleLower.indexOf(cut) === -1) {
          score -= 50;
        }
      }
    }

    const effectiveAttributes = `${effectiveTitle} ${prod.fatPercentage !== undefined ? `${prod.fatPercentage} ${prod.fatPercentage}% lean fat` : ''} ${prod.isFrozen ? 'frozen' : 'fresh'} ${prod.isOrganic ? 'organic' : ''}`;
    const matchCount = keywords.filter((kw) => KeywordExtractor.wordMatches(kw, effectiveAttributes)).length;

    if (matchCount === 0) {
      return { score: -200, packs: 1, totalQty: 1, totalPrice: 0, weightDiffPct: 0 };
    }

    const textScore = keywords.length > 0 ? (matchCount / keywords.length) * 60 : 0;
    score += textScore;

    // Primary term preference over alternateTerms on tie-break
    const primaryKeywords = KeywordExtractor.extractKeywords({
      name: item.name,
      baseItem: item.baseItem,
      brandPreference: item.brandPreference
    });
    if (primaryKeywords.length > 0 && primaryKeywords.some((kw) => KeywordExtractor.wordMatches(kw, effectiveAttributes))) {
      score += 10;
    }

    // 2. Brand Preference Match
    if (
      item.brandPreference &&
      prod.brand.toLowerCase().indexOf(item.brandPreference.toLowerCase()) !== -1
    ) {
      score += 40;
    }

    // Species / ingredient enforcement from matching-rules.json
    for (const rule of rules.speciesRules || []) {
      if (new RegExp(`\\b${rule.trigger}s?\\b`, 'i').test(itemLower) && !new RegExp(`\\b${rule.mustContain}s?\\b`, 'i').test(titleLower)) {
        score -= rule.penalty;
      }
    }
    for (const rule of rules.pulseRules || []) {
      if (new RegExp(`\\b${rule.trigger}s?\\b`, 'i').test(itemLower) && !new RegExp(`\\b${rule.mustContain}s?\\b`, 'i').test(titleLower)) {
        score -= rule.penalty;
      }
    }

    // Supplements / Vitamins / Oil / Pet Food penalties
    const isSupplementOrOil = hasAny(titleLower, rules.supplementTerms);
    const isExplicitlyRequestedSupplement = hasAny(itemLower, ['oil', 'vitamin', 'supplement', 'sauce']);
    if (isSupplementOrOil && !isExplicitlyRequestedSupplement) {
      score -= 150;
    }

    // Processed / Breaded / Fish Fingers penalties
    const isProcessedOrBreaded = hasAny(titleLower, rules.processedBreadedTerms);
    const isExplicitlyBreaded = hasAny(itemLower, ['finger', 'breaded', 'battered']);
    if (isProcessedOrBreaded && !isExplicitlyBreaded) {
      score -= 80;
    }

    // Ready meal / Gravy penalties
    const isReadyMealOrGravy = hasAny(titleLower, rules.readyMealTerms);
    const isExplicitlyRequestedReadyMeal = hasAny(itemLower, ['gravy', 'ready meal', 'hotpot', 'lasagne', 'pie', 'stew']);
    if (isReadyMealOrGravy && !isExplicitlyRequestedReadyMeal) {
      score -= 250;
    }

    // Specific breaded & butter exclusions
    if (!/\bbreaded\b/i.test(itemLower) && /\b(?:breaded|battered|crumbed)\b/i.test(titleLower)) {
      score -= 35;
    }
    if (!/\bbutter\b/i.test(itemLower) && /\b(?:butter|seasoned|marinade)\b/i.test(titleLower)) {
      score -= 30;
    }

    // 3. Health & Dietary Preferences
    if (preferences.healthierDefault || item.isHealthierPreferred) {
      if (item.fatPercentage !== undefined) {
        if (prod.fatPercentage === item.fatPercentage) {
          score += 35;
        } else if (prod.fatPercentage !== undefined && prod.fatPercentage <= item.fatPercentage) {
          score += 25;
        } else {
          score -= 20;
        }
      }

      if (item.isWholewheat && prod.isWholewheat) score += 30;
      if (item.isFreeRange && prod.isFreeRange) score += 30;
      if (item.isOrganic && prod.isOrganic) score += 30;
    }

    // 4. Brand Tier Priority
    if (preferences.brandTierPriority) {
      if (prod.tier === preferences.brandTierPriority) {
        score += 35;
      } else {
        score -= 20;
      }
    } else if (prod.tier === 'standard' || prod.tier === 'value') {
      score += 25;
    } else if (prod.tier === 'premium') {
      score -= 30;
    }

    // Fresh vs Frozen matching
    const isFrozenRequested = /\bfrozen\b/i.test(itemLower);
    const isProdFrozen = prod.isFrozen || /\bfrozen\b/i.test(titleLower);
    if (!isFrozenRequested && isProdFrozen) {
      score -= 5;
    }
    if (isFrozenRequested && isProdFrozen) {
      score += 30;
    }

    // 5. Pack Sizing & Weight Distance via PackSelector
    const { packs, totalQty, totalPrice, weightDiffPct, dealApplied } = PackSelector.calculatePacks(
      prod,
      item,
      preferences
    );

    const absDiff = Math.abs(weightDiffPct);
    const distanceScore = Math.max(-10, Math.round(20 - absDiff * 0.4));
    score += distanceScore;

    if (weightDiffPct < -25) {
      score -= 15;
    }

    if (packs === 1) {
      score += 15;
    } else if (packs === 2) {
      score += 5;
    } else if (packs > 2 && !item.multiplier) {
      score -= Math.min(25, (packs - 1) * 5);
    }

    return { score, packs, totalQty, totalPrice, weightDiffPct, dealApplied };
  }
}

