import rawRules from '../../../data/contamination-rules.json';

export interface ContaminationRule {
  category: string;
  matchQuery: (query: string) => boolean;
  prohibited: RegExp;
}

export const CONTAMINATION_RULES: ContaminationRule[] = rawRules.map((rule: any) => {
  const matchRegex = new RegExp(rule.matchPattern, 'i');
  const matchNegateRegex = rule.matchNegatePattern ? new RegExp(rule.matchNegatePattern, 'i') : null;
  const prohibitedRegex = new RegExp(rule.prohibitedPattern, 'i');

  return {
    category: rule.category,
    matchQuery: (q: string) => matchRegex.test(q) && (!matchNegateRegex || !matchNegateRegex.test(q)),
    prohibited: prohibitedRegex
  };
});

/**
 * Checks if a product title is contaminated for a given user query.
 * @param query - The search query / item name
 * @param productTitle - The title of the product candidate
 * @returns true if contaminated/prohibited, false otherwise
 */
export function isContaminated(query: string, productTitle: string): boolean {
  if (!query || !productTitle) return false;
  const qLower = String(query).toLowerCase();
  const tLower = String(productTitle).toLowerCase();

  for (const rule of CONTAMINATION_RULES) {
    if (rule.matchQuery(qLower)) {
      if (rule.prohibited.test(tLower)) {
        return true;
      }
    }
  }
  return false;
}
