/**
 * Query Strategist — Supermarket-Specific Search Term Formulation
 * Formulates ranked, store-specific search queries and variant fan-out suggestions.
 * Fully offline-capable by default with optional AI expansion.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCoreSearchQuery } from './candidatePipeline.js';

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
    } catch {
      // continue
    }
  }
}

const matchingRules = rawRules || {};
const storePhrasing = matchingRules.storePhrasing || {};
const rawNameVariants = matchingRules.nameVariants || {};
const nameVariantGroups = [];
const rawGroups = Array.isArray(rawNameVariants)
  ? rawNameVariants
  : Object.entries(rawNameVariants).map(([k, v]) => [k, ...(Array.isArray(v) ? v : [v])]);
for (const group of rawGroups) {
  if (Array.isArray(group)) {
    nameVariantGroups.push(group.map((w) => String(w).toLowerCase().trim()).filter(Boolean));
  }
}

export class QueryStrategist {
  /**
   * Proposes store-specific query terms and variant sizes.
   * Works fully offline without AI; AI acts as an optional enhancement.
   *
   * @param {object} item - Parsed ingredient item
   * @param {object} options - { supermarket, aiMatchingEnabled, userPreferences }
   * @returns {Promise<{ queries: string[], terms: string[], suggestedVariants: number[], supermarket: string, source: string }>}
   */
  static async plan(item, options = {}) {
    const supermarket = String(options.supermarket || 'tesco').toLowerCase();
    const core = getCoreSearchQuery(item);
    const terms = [];

    if (core) {
      terms.push(core);

      // UK naming and spelling variants from data/matching-rules.json
      for (const group of nameVariantGroups) {
        for (let i = 0; i < group.length; i++) {
          const variant = group[i];
          const regex = new RegExp(`\\b${variant}\\b`, 'i');
          if (regex.test(core)) {
            for (let j = 0; j < group.length; j++) {
              if (i !== j) {
                const alternate = core.replace(regex, group[j]);
                terms.push(alternate);
              }
            }
          }
        }
      }
    }

    // Attribute expansions (e.g. fat percentage, free range, organic)
    if (item && item.fatPercentage) {
      terms.push(`${core} ${item.fatPercentage}%`);
      terms.push(`lean ${core} ${item.fatPercentage}%`);
    }

    if (item && item.isFreeRange) {
      terms.push(`free range ${core}`);
    }

    if (item && item.isOrganic) {
      terms.push(`organic ${core}`);
    }

    if (item && item.isWholewheat) {
      terms.push(`wholewheat ${core}`);
      terms.push(`wholemeal ${core}`);
    }

    // Store-specific search phrasing from data/matching-rules.json
    if (core && storePhrasing && storePhrasing[supermarket]) {
      const storeRules = storePhrasing[supermarket] || [];
      for (const rule of storeRules) {
        if (rule && rule.trigger && rule.phrase) {
          if (new RegExp(`\\b${rule.trigger}\\b`, 'i').test(core) || core.includes(rule.trigger)) {
            terms.push(rule.phrase);
          }
        }
      }
    }

    // Deduplicate terms while preserving order
    const uniqueTerms = Array.from(new Set(terms.filter(Boolean)));

    // Calculate variant sizes worth querying for weight/volume items
    const targetQuantity = Number(item?.targetQuantity || item?.quantity) || 1;
    const unit = String(item?.unit || 'g').toLowerCase();
    const suggestedVariants = [];

    if (unit === 'g' || unit === 'kg') {
      const targetGrams = unit === 'kg' ? targetQuantity * 1000 : targetQuantity;
      if (targetGrams >= 500) {
        suggestedVariants.push(250, 500, 750, 1000);
      } else {
        suggestedVariants.push(100, 250, 500);
      }
    } else if (unit === 'ml' || unit === 'l' || unit === 'pints' || unit === 'pt') {
      suggestedVariants.push(500, 1000, 2000, 2272);
    }

    return {
      queries: uniqueTerms.length > 0 ? uniqueTerms : [core || 'groceries'],
      terms: uniqueTerms.length > 0 ? uniqueTerms : [core || 'groceries'],
      suggestedVariants,
      supermarket,
      source: 'offline-rules'
    };
  }

  static async buildPlan(item, options = {}) {
    return QueryStrategist.plan(item, options);
  }
}

export default QueryStrategist;
