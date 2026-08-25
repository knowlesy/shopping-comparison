import { GeminiDomParser } from '../services/logic-api/src/services/geminiParser.js';
import { ScraperClient } from '../services/logic-api/src/services/scraperClient.js';

async function testParser() {
  const { html } = await ScraperClient.fetchHtml('https://www.trolley.co.uk/search/?q=beef+mince');
  const products = await GeminiDomParser.parseHtml(html, 'beef mince');
  console.log(`Structured products count: ${products.length}`);
  if (products.length > 0) {
    console.log('Sample structured products:');
    console.log(products.slice(0, 5).map(p => ({
      store: p.supermarket,
      title: p.title,
      size: p.packageDisplay,
      price: p.price,
      unitPrice: `${p.unitPrice} ${p.unitPriceMeasure}`,
      url: p.productUrl
    })));
  }
}

testParser();
