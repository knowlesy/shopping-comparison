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
const rulesPath = path.resolve(__dirname, 'matching-rules.json');

let rules = {
  fishCuts: ['loin', 'loins', 'fillet', 'fillets', 'portion', 'portions', 'steak', 'steaks'],
  meatCuts: ['mince', 'minced', 'steak mince', 'breast', 'breasts', 'diced', 'chops'],
  speciesRules: [
    { trigger: 'cod', mustContain: 'cod', penalty: 80 },
    { trigger: 'beef', mustContain: 'beef', penalty: 80 }
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
    'lasagne', 'lasagna', 'cottage pie', 'shepherd', 'pasta bake', 'chilli con carne', 'bolognese ready', 'casserole', 'stew'
  ]
};

if (fs.existsSync(rulesPath)) {
  try {
    rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  } catch (e) {
    console.warn('[PenaltyRules] Failed parsing matching-rules.json, using defaults:', e.message);
  }
}

export class PenaltyRules {
  /**
   * Evaluates and scores candidate products against parsed user items.
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
      if (item.category === 'fish' && rules.fishCuts.some((cut) => titleLower.includes(cut))) {
        effectiveTitle += ' loin loins fillet fillets portion portions';
      }
      if (item.category === 'meat' && rules.meatCuts.some((cut) => titleLower.includes(cut))) {
        effectiveTitle += ' mince minced steak breast fillets';
      }
    } else {
      if (itemLower.includes('loin') && !titleLower.includes('loin')) score -= 50;
      if (itemLower.includes('fillet') && !titleLower.includes('fillet')) score -= 50;
      if (itemLower.includes('breast') && !titleLower.includes('breast')) score -= 50;
      if (itemLower.includes('thigh') && !titleLower.includes('thigh')) score -= 50;
    }

    const effectiveAttributes = `${effectiveTitle} ${prod.fatPercentage !== undefined ? `${prod.fatPercentage} ${prod.fatPercentage}% lean fat` : ''} ${prod.isFrozen ? 'frozen' : 'fresh'} ${prod.isOrganic ? 'organic' : ''}`;
    const matchCount = keywords.filter((kw) => effectiveAttributes.includes(kw)).length;

    if (matchCount === 0) {
      return { score: -200, packs: 1, totalQty: 1, totalPrice: 0, weightDiffPct: 0 };
    }

    const textScore = keywords.length > 0 ? (matchCount / keywords.length) * 60 : 0;
    score += textScore;

    // 2. Brand Preference Match
    if (
      item.brandPreference &&
      prod.brand.toLowerCase().includes(item.brandPreference.toLowerCase())
    ) {
      score += 40;
    }

    // Species / ingredient enforcement from matching-rules.json
    for (const rule of rules.speciesRules || []) {
      if (itemLower.includes(rule.trigger) && !titleLower.includes(rule.mustContain)) {
        score -= rule.penalty;
      }
    }
    for (const rule of rules.pulseRules || []) {
      if (new RegExp(`\\b${rule.trigger}\\b`, 'i').test(itemLower) && !new RegExp(`\\b${rule.mustContain}\\b`, 'i').test(titleLower)) {
        score -= rule.penalty;
      }
    }

    // Supplements / Vitamins / Oil / Pet Food penalties
    const isSupplementOrOil = rules.supplementTerms.some((t) => titleLower.includes(t));
    const isExplicitlyRequestedSupplement =
      itemLower.includes('oil') ||
      itemLower.includes('vitamin') ||
      itemLower.includes('supplement') ||
      itemLower.includes('sauce');
    if (isSupplementOrOil && !isExplicitlyRequestedSupplement) {
      score -= 150;
    }

    // Processed / Breaded / Fish Fingers penalties
    const isProcessedOrBreaded = rules.processedBreadedTerms.some((t) => titleLower.includes(t));
    const isExplicitlyBreaded =
      itemLower.includes('finger') ||
      itemLower.includes('breaded') ||
      itemLower.includes('battered');
    if (isProcessedOrBreaded && !isExplicitlyBreaded) {
      score -= 80;
    }

    // Ready meal / Gravy penalties
    const isReadyMealOrGravy = rules.readyMealTerms.some((t) => titleLower.includes(t)) ||
      titleLower.includes('pet food') ||
      titleLower.includes('cat food') ||
      titleLower.includes('dog food') ||
      titleLower.includes('pie');

    const isExplicitlyRequestedReadyMeal =
      itemLower.includes('gravy') ||
      itemLower.includes('ready meal') ||
      itemLower.includes('hotpot') ||
      itemLower.includes('lasagne') ||
      itemLower.includes('pie') ||
      itemLower.includes('stew');

    if (isReadyMealOrGravy && !isExplicitlyRequestedReadyMeal) {
      score -= 250;
    }

    // Specific breaded & butter exclusions
    if (
      !itemLower.includes('breaded') &&
      (titleLower.includes('breaded') ||
        titleLower.includes('battered') ||
        titleLower.includes('crumbed'))
    ) {
      score -= 35;
    }
    if (
      !itemLower.includes('butter') &&
      (titleLower.includes('butter') ||
        titleLower.includes('seasoned') ||
        titleLower.includes('marinade'))
    ) {
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
    const isFrozenRequested = itemLower.includes('frozen');
    if (!isFrozenRequested && (prod.isFrozen || titleLower.includes('frozen'))) {
      score -= 5;
    }
    if (isFrozenRequested && (prod.isFrozen || titleLower.includes('frozen'))) {
      score += 30;
    }

    // 5. Pack Sizing & Weight Distance via PackSelector
    const { packs, totalQty, totalPrice, weightDiffPct, dealApplied } = PackSelector.calculatePacks(
      prod,
      item,
      preferences
    );

    const absDiff = Math.abs(weightDiffPct);
    const distanceScore = Math.max(-10, Math.round(30 - absDiff * 0.8));
    score += distanceScore;

    if (weightDiffPct < -10) {
      score -= 30;
    }

    if (packs === 1) {
      score += 20;
    } else if (packs === 2) {
      score += 5;
    } else if (packs > 2 && !item.multiplier) {
      score -= (packs - 1) * 15;
    }

    return { score, packs, totalQty, totalPrice, weightDiffPct, dealApplied };
  }
}
