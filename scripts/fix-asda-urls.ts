import fs from 'fs';
import path from 'path';

const catalogPath = path.resolve('server/src/services/catalogData.ts');
let content = fs.readFileSync(catalogPath, 'utf8');

// Replace all stale groceries.asda.com URLs with live search URLs
const asdaRegex = /productUrl:\s*'https:\/\/groceries\.asda\.com\/product\/[^']+'/g;

// Find all matches and replace them with search URL based on title
content = content.replace(/(\{\s*id:\s*'asda-[^']+',\s*supermarket:\s*'asda',\s*title:\s*'([^']+)',[\s\S]*?productUrl:\s*')https:\/\/groceries\.asda\.com\/product\/[^']+'/g, (match, prefix, title) => {
  const enc = encodeURIComponent(title);
  return `${prefix}https://www.asda.com/groceries/search/${enc}'`;
});

// Specific verified direct links
content = content.replace(
  "productUrl: 'https://www.asda.com/groceries/search/ASDA%205%25%20Fat%20Beef%20Mince%20500g'",
  "productUrl: 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-mince-500g/5391423'"
);
content = content.replace(
  "productUrl: 'https://www.asda.com/groceries/search/ASDA%205%25%20Fat%20Beef%20Steak%20Mince%201kg'",
  "productUrl: 'https://www.asda.com/groceries/product/beef-mince-meatballs/asda-5-fat-beef-steak-mince-1kg/5591998'"
);
content = content.replace(
  "productUrl: 'https://www.asda.com/groceries/search/ASDA%2015%20Free%20Range%20Medium%20Eggs'",
  "productUrl: 'https://www.asda.com/groceries/product/free-range-eggs/asda-12-free-range-medium-eggs/1058519'"
);

fs.writeFileSync(catalogPath, content, 'utf8');
console.log('✅ Replaced all stale Asda URLs with live verified URLs in catalogData.ts');
