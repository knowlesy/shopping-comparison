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
    const raw = `${item.baseItem || ''} ${item.name || ''} ${item.brandPreference || ''}`.toLowerCase();
    
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
   * Check if a product title contains sufficient noun evidence matching the keywords.
   * @param {string[]} keywords - Extracted item keywords
   * @param {string} productTitle - Candidate product title
   * @returns {boolean}
   */
  static hasNounEvidence(keywords, productTitle) {
    if (!keywords || keywords.length === 0) return true;
    if (!productTitle) return false;
    const titleLower = productTitle.toLowerCase();

    return keywords.some((kw) => {
      if (titleLower.includes(kw)) return true;
      // Stem check (e.g. "tomatoes" -> "tomato", "potatoes" -> "potato", "eggs" -> "egg")
      const stem = kw.endsWith('es') ? kw.slice(0, -2) : (kw.endsWith('s') ? kw.slice(0, -1) : kw);
      return stem.length >= 3 && titleLower.includes(stem);
    });
  }
}
