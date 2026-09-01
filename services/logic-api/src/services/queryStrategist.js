/**
 * Query Strategist — Supermarket-Specific Search Term Formulation
 * Formulates ranked, store-specific search queries and variant fan-out suggestions.
 * Fully offline-capable by default with optional AI expansion.
 */

import { getCoreSearchQuery } from './candidatePipeline.js';

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

    // Store-specific search phrasing
    if (supermarket === 'sainsburys' && core.includes('lettuce')) {
      terms.push('little gem');
    } else if (supermarket === 'morrisons' && core.includes('milk')) {
      terms.push('british semi skimmed milk');
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
