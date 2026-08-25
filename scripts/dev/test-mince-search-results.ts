import { chromium } from 'playwright';

async function testMinceQueries() {
  console.log('Testing query formulations on supermarket search engines...\n');

  // Let's test the simplified base queries:
  // e.g. "beef mince", "frozen cod", "free range eggs", "greek yogurt", "lentils", "milk", "fusilli"
  const testCases = [
    { store: 'Tesco (Full)', url: 'https://www.tesco.com/groceries/en-GB/search?query=Lean+Beef+Steak+Mince+5+Fat+750g' },
    { store: 'Tesco (Simple)', url: 'https://www.tesco.com/groceries/en-GB/search?query=beef+mince' },
    { store: 'Sainsbury\'s (Full)', url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/British%20Lean%20Beef%20Steak%20Mince%205%20Fat%20750g' },
    { store: 'Sainsbury\'s (Simple)', url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/beef%20mince' },
    { store: 'Morrisons (Full)', url: 'https://groceries.morrisons.com/search?entry=British%20Lean%20Beef%20Mince%205%20Fat%20750g' },
    { store: 'Morrisons (Simple)', url: 'https://groceries.morrisons.com/search?entry=beef%20mince' },
    { store: 'Iceland (Full)', url: 'https://www.iceland.co.uk/search?q=Lean+Beef+Steak+Mince+5+Fat+1kg' },
    { store: 'Iceland (Simple)', url: 'https://www.iceland.co.uk/search?q=beef+mince' },
  ];

  console.log('URLs to compare:');
  for (const tc of testCases) {
    console.log(`- [${tc.store}] -> ${tc.url}`);
  }
}

testMinceQueries();
