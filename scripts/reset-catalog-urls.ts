import fs from 'fs';
import path from 'path';

const catalogPath = path.resolve('server/src/services/catalogData.ts');
let code = fs.readFileSync(catalogPath, 'utf8');

// Replace all productUrl lines in catalogData.ts with clean query URLs or verified URLs
// For Asda verified:
// - Asda mince 500g: 5391423
// - Asda mince 1kg: 5591998
// - Asda eggs: 1058519

code = code.replace(/productUrl:\s*'https:\/\/[^']+'/g, (match) => {
  if (match.includes('5391423') || match.includes('5591998') || match.includes('1058519')) {
    return match; // keep verified
  }
  // Remove fake productUrl so it falls back to the clean query generator
  return "productUrl: ''";
});

fs.writeFileSync(catalogPath, code, 'utf8');
console.log('✅ Cleaned all fake/stale productUrl entries from catalogData.ts');
