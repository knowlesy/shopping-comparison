import { ClientShoppingParser, ClientSupermarketComparisonService, getLiveSupermarketUrl } from '../client/src/services/clientEngine.js';

const parsed = ClientShoppingParser.parse('900g 5% lean beef mince');
const result = ClientSupermarketComparisonService.compare(parsed);

console.log('=== EXACT COMPARISON RESULT FOR "900g 5% lean beef mince" ===\n');

for (const [store, data] of Object.entries(result.supermarkets)) {
  const match = data.items[0];
  const prod = match.product;
  const renderedUrl = prod ? getLiveSupermarketUrl(store as any, prod.title, prod.productUrl) : 'NO PRODUCT';
  console.log(`STORE: [${store.toUpperCase()}]`);
  console.log(`  Matched ID:    ${prod?.id}`);
  console.log(`  Matched Title: "${prod?.title}"`);
  console.log(`  Package Size:  ${prod?.packageDisplay} (${match.packsNeeded} packs needed = ${match.totalQuantity}${prod?.packageUnit})`);
  console.log(`  Total Price:   £${match.totalPrice.toFixed(2)}`);
  console.log(`  prod.productUrl: "${prod?.productUrl}"`);
  console.log(`  RENDERED HREF:   "${renderedUrl}"\n`);
}
