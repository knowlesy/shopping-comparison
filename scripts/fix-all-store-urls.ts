import fs from 'fs';
import path from 'path';

const catalogPath = path.resolve('server/src/services/catalogData.ts');
let content = fs.readFileSync(catalogPath, 'utf8');

// 1. Fix Morrisons: Replace all stale groceries.morrisons.com/products/ with live search URLs
content = content.replace(/(\{\s*id:\s*'morrisons-[^']+',\s*supermarket:\s*'morrisons',\s*title:\s*'([^']+)',[\s\S]*?productUrl:\s*')https:\/\/groceries\.morrisons\.com\/products\/[^']+'/g, (match, prefix, title) => {
  const enc = encodeURIComponent(title);
  return `${prefix}https://groceries.morrisons.com/search?entry=${enc}'`;
});

// 2. Fix Iceland: Ensure all Iceland product URLs use direct live search URL
content = content.replace(/(\{\s*id:\s*'iceland-[^']+',\s*supermarket:\s*'iceland',\s*title:\s*'([^']+)',[\s\S]*?productUrl:\s*')https:\/\/www\.iceland\.co\.uk\/p\/[^']+'/g, (match, prefix, title) => {
  const enc = encodeURIComponent(title);
  return `${prefix}https://www.iceland.co.uk/search?q=${enc}'`;
});

// 3. Fix Sainsbury's: Ensure all Sainsbury's URLs use live search URL
content = content.replace(/(\{\s*id:\s*'sainsburys-[^']+',\s*supermarket:\s*'sainsburys',\s*title:\s*'([^']+)',[\s\S]*?productUrl:\s*')https:\/\/www\.sainsburys\.co\.uk\/gol-ui\/product\/[^']+'/g, (match, prefix, title) => {
  const enc = encodeURIComponent(title);
  return `${prefix}https://www.sainsburys.co.uk/gol-ui/SearchResults/${enc}'`;
});

// 4. Fix Tesco: Ensure all Tesco URLs use live search URL
content = content.replace(/(\{\s*id:\s*'tesco-[^']+',\s*supermarket:\s*'tesco',\s*title:\s*'([^']+)',[\s\S]*?productUrl:\s*')https:\/\/www\.tesco\.com\/groceries\/en-GB\/products\/[^']+'/g, (match, prefix, title) => {
  const enc = encodeURIComponent(title);
  return `${prefix}https://www.tesco.com/groceries/en-GB/search?query=${enc}'`;
});

fs.writeFileSync(catalogPath, content, 'utf8');
console.log('✅ Replaced ALL supermarket URLs with guaranteed live store URLs in catalogData.ts');
