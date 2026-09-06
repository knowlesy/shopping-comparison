/**
 * Keyword Extractor & Noun Evidence Identifier
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const nameVariantGroups = [];
if (rawRules && rawRules.nameVariants) {
  const nv = rawRules.nameVariants;
  const rawGroups = Array.isArray(nv) ? nv : Object.entries(nv).map(([k, v]) => [k, ...(Array.isArray(v) ? v : [v])]);
  for (const group of rawGroups) {
    if (Array.isArray(group)) {
      nameVariantGroups.push(group.map((w) => String(w).toLowerCase().trim()).filter(Boolean));
    }
  }
}

const GENERIC_STOPWORDS = new Set([
  'approx', 'fresh', 'sliced', 'tinned', 'frozen', 'natural', 'pack', 'packs',
  'head', 'heads', 'bulb', 'bulbs', 'bunch', 'bunches', 'tube', 'tubes', 'tin',
  'tins', 'can', 'cans', 'tub', 'tubs', 'loaves', 'loaf', 'box', 'boxes', 'pot',
  'pots', 'jar', 'jars', 'whole', 'halves', 'piece', 'pieces', 'portion', 'portions',
  'target', 'item', 'items', 'mix', 'raw', 'organic', 'pure', 'lean', 'extra',
  'good', 'quality', 'british', 'standard', 'large', 'medium', 'small', 'baby',
  'red', 'green', 'white', 'yellow', 'brown', 'dark', 'light', 'sweet', 'water',
  'brine', 'oil', 'spring', 'salted', 'unsalted', 'smoked', 'unsmoked', 'in', 'with',
  'of', 'and', 'for', 'to', 'on', 'at', 'from', 'or', 'kg', 'g', 'ml', 'l', 'lt',
  'litre', 'litres', 'oz', 'lb', 'pt', 'pint', 'pints', 'x'
]);

export class KeywordExtractor {
  /**
   * Extract meaningful food nouns and identifiers from a parsed item,
   * dropping pure-numeric tokens, prepositions, and generic packaging/unit stopwords.
   * @param {object} item - Parsed shopping list item
   * @returns {string[]}
   */
  static extractKeywords(item) {
    if (!item) return [];
    const alternates = Array.isArray(item.alternateTerms) ? item.alternateTerms.join(' ') : '';
    const raw = `${item.baseItem || ''} ${item.name || ''} ${item.brandPreference || ''} ${alternates}`.toLowerCase();
    
    // Replace non-alphanumerics with spaces
    const clean = raw.replace(/[^\w\s]/g, ' ');
    const tokens = clean.split(/\s+/).filter(Boolean);

    const filtered = tokens.filter((tok) => {
      if (tok.length <= 1) return false;
      if (/^\d+$/.test(tok)) return false; // Drop pure numbers
      if (GENERIC_STOPWORDS.has(tok)) return false; // Drop stopwords
      return true;
    });

    // Return unique deduped keywords in order of appearance
    return Array.from(new Set(filtered));
  }

  /**
   * Helper: evaluates single-word exact match, stem match, or plural match
   * @param {string} word - Single word to check
   * @param {string} textLower - Lowercase text to check against
   * @returns {boolean}
   */
  static singleWordMatches(word, textLower) {
    if (!word || !textLower) return false;
    const w = String(word).toLowerCase().trim();

    // 1. Exact whole word match
    if (new RegExp(`\\b${w}\\b`, 'i').test(textLower)) return true;

    // 2. De-pluralized stem match (e.g. "tomatoes" -> "tomato", "courgettes" -> "courgette", "eggs" -> "egg")
    if (w.endsWith('es') && w.length > 3) {
      const stem = w.slice(0, -2);
      if (new RegExp(`\\b${stem}\\b`, 'i').test(textLower)) return true;
    }
    if (w.endsWith('s') && w.length > 2) {
      const stem = w.slice(0, -1);
      if (new RegExp(`\\b${stem}\\b`, 'i').test(textLower)) return true;
    }

    // 3. Pluralized forms (e.g. "courgette" -> "courgettes", "potato" -> "potatoes", "tomato" -> "tomatoes")
    if (w.endsWith('o') && w.length >= 3) {
      if (new RegExp(`\\b${w}es\\b`, 'i').test(textLower)) return true;
    }
    if (new RegExp(`\\b${w}s\\b`, 'i').test(textLower)) return true;
    if (new RegExp(`\\b${w}es\\b`, 'i').test(textLower)) return true;

    return false;
  }

  /**
   * Look up equivalent spelling/naming variants from nameVariants table
   * @param {string} termLower - Lowercase term
   * @returns {string[]}
   */
  static getNameVariants(termLower) {
    if (!termLower) return [];
    const t = String(termLower).toLowerCase().trim();
    const stems = [t];
    if (t.endsWith('es') && t.length > 3) stems.push(t.slice(0, -2));
    if (t.endsWith('s') && t.length > 2) stems.push(t.slice(0, -1));

    const variants = new Set();
    for (const group of nameVariantGroups) {
      const matchesGroup = group.some((member) => stems.includes(member));
      if (matchesGroup) {
        for (const member of group) {
          if (!stems.includes(member)) {
            variants.add(member);
          }
        }
      }
    }
    return Array.from(variants);
  }

  /**
   * Evaluates if a term matches a target text using whole-word matching,
   * bidirectional singular/plural stemming, and UK nameVariants equivalence table.
   * @param {string} term - Keyword / ingredient term
   * @param {string} text - Target product title / attributes text
   * @returns {boolean}
   */
  static wordMatches(term, text) {
    if (!term || !text) return false;
    const termLower = String(term).toLowerCase().trim();
    const textLower = String(text).toLowerCase();

    // 1. Direct single word check
    if (this.singleWordMatches(termLower, textLower)) return true;

    // 2. Equivalence variants from nameVariants table (bidirectional)
    const variants = this.getNameVariants(termLower);
    for (const variant of variants) {
      if (this.singleWordMatches(variant, textLower)) return true;
    }

    return false;
  }

  /**
   * Check if a product title contains sufficient noun evidence matching the keywords.
   * Uses word-boundary checks and bidirectional singular/plural matching.
   * @param {string[]} keywords - Extracted item keywords
   * @param {string} productTitle - Candidate product title
   * @returns {boolean}
   */
  static hasNounEvidence(keywords, productTitle) {
    if (!keywords || keywords.length === 0) return true;
    if (!productTitle) return false;
    return keywords.some((kw) => this.wordMatches(kw, productTitle));
  }
}
