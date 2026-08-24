import { CATALOG_PRODUCTS, SUPERMARKETS_INFO } from '../server/src/services/catalogData.js';

console.log(`Auditing all ${CATALOG_PRODUCTS.length} catalog items...`);

const stats = {
  total: CATALOG_PRODUCTS.length,
  byStore: {} as Record<string, number>,
  byCategory: {} as Record<string, number>,
  urlsChecked: 0,
  urlIssues: [] as string[],
  pricingIssues: [] as string[],
  tagIssues: [] as string[],
};

for (const p of CATALOG_PRODUCTS) {
  stats.byStore[p.supermarket] = (stats.byStore[p.supermarket] || 0) + 1;
  stats.byCategory[p.category] = (stats.byCategory[p.category] || 0) + 1;
  stats.urlsChecked++;

  // URL verification
  if (!p.productUrl) {
    stats.urlIssues.push(`[${p.id}] Missing product URL`);
    continue;
  }
  if (p.productUrl.includes(' ')) {
    stats.urlIssues.push(`[${p.id}] URL contains unencoded space: ${p.productUrl}`);
  }
  try {
    const parsed = new URL(p.productUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      stats.urlIssues.push(`[${p.id}] Non-HTTP URL: ${p.productUrl}`);
    }
  } catch (e: any) {
    stats.urlIssues.push(`[${p.id}] Malformed URL: ${p.productUrl} (${e.message})`);
  }

  // Health tags
  if (typeof p.isHealthier !== 'boolean') {
    stats.tagIssues.push(`[${p.id}] Missing isHealthier flag`);
  }

  // Pricing
  if (!p.price || p.price <= 0) {
    stats.pricingIssues.push(`[${p.id}] Invalid price: ${p.price}`);
  }
  if (!p.unitPrice || p.unitPrice <= 0) {
    stats.pricingIssues.push(`[${p.id}] Invalid unit price: ${p.unitPrice}`);
  }
}

console.log('\n--- STORE COUNTS ---');
console.table(stats.byStore);

console.log('\n--- CATEGORY COUNTS ---');
console.table(stats.byCategory);

console.log('\n--- URL ISSUES ---');
console.log(`URL Issues (${stats.urlIssues.length}):`, stats.urlIssues);

console.log('\n--- PRICING ISSUES ---');
console.log(`Pricing Issues (${stats.pricingIssues.length}):`, stats.pricingIssues);

console.log('\n--- TAG ISSUES ---');
console.log(`Tag Issues (${stats.tagIssues.length}):`, stats.tagIssues);
