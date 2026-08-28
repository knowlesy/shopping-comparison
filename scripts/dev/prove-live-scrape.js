/**
 * Developer Proof Tool: Live Supermarket Scrape Validation
 *
 * NOTE: Live scraping relies on external network access and trolley.co.uk availability.
 * Live scraping remains unproven in sandboxed CI environments and must pass on a real host machine.
 */
import { ScraperClient } from '../../services/logic-api/src/services/scraperClient.js';
import { GeminiDomParser } from '../../services/logic-api/src/services/geminiParser.js';
import { PriceCache } from '../../services/logic-api/src/services/priceCache.js';

async function proveLiveScrape() {
  console.log('===============================================================================');
  console.log('       LIVE SUPERMARKET SCRAPE PROOF & DIAGNOSTIC TOOL                        ');
  console.log('===============================================================================\n');
  console.log('ℹ️  STATUS NOTE: Live scraping is UNPROVEN until executed on a real machine');
  console.log('   with an active network connection to trolley.co.uk and running scraper-pod.\n');

  const testQuery = process.argv[2] || 'semi skimmed milk 2 pints';
  console.log(`Executing real live query: "${testQuery}" via ScraperClient...`);

  try {
    const rawHtml = await ScraperClient.scrapeProduct(testQuery);
    if (!rawHtml) {
      console.warn('⚠️ Scraper returned empty HTML response or timed out. (Expected in offline/mock environment)');
      return;
    }

    console.log(`✅ Received raw HTML (${rawHtml.length} bytes). Parsing with GeminiDomParser...`);
    const parsedProducts = await GeminiDomParser.parseProductsFromHtml(rawHtml, testQuery);

    console.log(`\nParsed ${parsedProducts.length} candidate products:`);
    for (const prod of parsedProducts.slice(0, 5)) {
      console.log(`  - [${prod.supermarket.toUpperCase()}] ${prod.title} — £${prod.price} (${prod.packageSize}${prod.packageUnit || ''})`);
    }

    const cacheKey = `scrape:${testQuery.toLowerCase().trim()}`;
    PriceCache.set(cacheKey, parsedProducts);
    console.log(`\n✅ Live products successfully cached under key: "${cacheKey}"`);
  } catch (err) {
    console.error('❌ Live scrape proof failed with error:', err.message);
    console.log('ℹ️  Ensure scraper-pod is running and SCRAPE_TOKEN is configured.');
  }
}

proveLiveScrape().catch((err) => {
  console.error('Unhandled proof error:', err);
});
