/**
 * Keyword Extractor & Noun Evidence Identifier
 */

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
   * Evaluates if a term matches a target text using whole-word matching,
   * bidirectional singular/plural stemming, and -o/-es morphological variants.
   * @param {string} term - Keyword / ingredient term
   * @param {string} text - Target product title / attributes text
   * @returns {boolean}
   */
  static wordMatches(term, text) {
    if (!term || !text) return false;
    const termLower = String(term).toLowerCase().trim();
    const textLower = String(text).toLowerCase();

    // 1. Exact whole word match
    if (new RegExp(`\\b${termLower}\\b`, 'i').test(textLower)) return true;

    // 2. De-pluralized stem match (e.g. "tomatoes" -> "tomato", "courgettes" -> "courgette", "eggs" -> "egg")
    if (termLower.endsWith('es') && termLower.length > 3) {
      const stem = termLower.slice(0, -2);
      if (new RegExp(`\\b${stem}\\b`, 'i').test(textLower)) return true;
    }
    if (termLower.endsWith('s') && termLower.length > 2) {
      const stem = termLower.slice(0, -1);
      if (new RegExp(`\\b${stem}\\b`, 'i').test(textLower)) return true;
    }

    // 3. Pluralized forms (e.g. "courgette" -> "courgettes", "potato" -> "potatoes", "tomato" -> "tomatoes")
    if (termLower.endsWith('o') && termLower.length >= 3) {
      if (new RegExp(`\\b${termLower}es\\b`, 'i').test(textLower)) return true;
    }
    if (new RegExp(`\\b${termLower}s\\b`, 'i').test(textLower)) return true;
    if (new RegExp(`\\b${termLower}es\\b`, 'i').test(textLower)) return true;

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
