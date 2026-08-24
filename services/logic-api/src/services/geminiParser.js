import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Supermarket normalisation mapping
 */
function normalizeSupermarket(rawBrand, rawTitle = '') {
  const text = `${rawBrand} ${rawTitle}`.toLowerCase();
  if (text.includes('tesco')) return 'tesco';
  if (text.includes('asda')) return 'asda';
  if (text.includes('sainsbury')) return 'sainsburys';
  if (text.includes('morrison')) return 'morrisons';
  if (text.includes('iceland')) return 'iceland';
  if (text.includes('waitrose')) return 'waitrose';
  if (text.includes('ocado') || text.includes('marks and spencer') || text.includes('m&s')) return 'ocado';
  if (text.includes('co-op') || text.includes('coop')) return 'coop';
  if (text.includes('aldi')) return 'aldi';
  if (text.includes('lidl')) return 'lidl';
  return null;
}

/**
 * Metric size normalisation
 */
function parseMetricSize(sizeStr, title = '') {
  const combined = `${sizeStr} ${title}`.toLowerCase();
  
  // Multipliers: e.g. "2 x 400g"
  const multiMatch = combined.match(/(\d+)\s*[xX]\s*([\d.]+)\s*(kg|g|l|ml|pints?|pack)/i);
  if (multiMatch) {
    const count = parseInt(multiMatch[1], 10);
    const num = parseFloat(multiMatch[2]);
    const u = multiMatch[3].toLowerCase();
    if (u === 'kg') return { size: count * num * 1000, unit: 'g', display: `${count}x${num}kg` };
    if (u === 'g') return { size: count * num, unit: 'g', display: `${count}x${num}g` };
    if (u === 'l') return { size: count * num * 1000, unit: 'ml', display: `${count}x${num}L` };
    if (u === 'ml') return { size: count * num, unit: 'ml', display: `${count}x${num}ml` };
  }

  // Weight: kg
  const kgMatch = combined.match(/([\d.]+)\s*kg\b/i);
  if (kgMatch) {
    const val = parseFloat(kgMatch[1]);
    return { size: val * 1000, unit: 'g', display: `${val}kg` };
  }

  // Weight: g
  const gMatch = combined.match(/(\d+)\s*g\b/i);
  if (gMatch) {
    const val = parseInt(gMatch[1], 10);
    return { size: val, unit: 'g', display: `${val}g` };
  }

  // Volume: Litres
  const lMatch = combined.match(/([\d.]+)\s*(?:l|litre|litres)\b/i);
  if (lMatch) {
    const val = parseFloat(lMatch[1]);
    return { size: val * 1000, unit: 'ml', display: `${val}L` };
  }

  // Volume: ml
  const mlMatch = combined.match(/(\d+)\s*ml\b/i);
  if (mlMatch) {
    const val = parseInt(mlMatch[1], 10);
    return { size: val, unit: 'ml', display: `${val}ml` };
  }

  // Pints (UK: 1 pint = 568ml, 2 pints = 1136ml) e.g. "2 Pints", "2pts", "2pt", "4pts"
  const pintMatch = combined.match(/(\d+)\s*(?:pints?|pts?)\b/i);
  if (pintMatch) {
    const pints = parseInt(pintMatch[1], 10);
    const ml = Math.round(pints * 568);
    return { size: ml, unit: 'ml', display: `${pints} Pints (${(ml / 1000).toFixed(2)}L)` };
  }

  // Egg / Pack count
  const packMatch = combined.match(/(\d+)\s*(?:pack|eggs?|pk)\b/i);
  if (packMatch) {
    const count = parseInt(packMatch[1], 10);
    return { size: count, unit: 'pack', display: `${count} pack` };
  }

  // Default mince fallback if size omitted
  if (/(?:beef|pork|lamb|turkey|chicken)\s+mince/i.test(combined) || /steak mince/i.test(combined)) {
    return { size: 500, unit: 'g', display: '500g' };
  }

  return { size: 1, unit: 'item', display: sizeStr || '1 item' };
}

/**
 * Category assignment
 */
function assignCategory(title = '') {
  const lower = title.toLowerCase();
  if (/beef|mince|chicken|pork|lamb|steak|bacon|sausage|meat/i.test(lower)) return { category: 'meat', subCategory: 'beef' };
  if (/cod|salmon|haddock|tuna|prawn|fish|seafood/i.test(lower)) return { category: 'fish', subCategory: 'frozen fish' };
  if (/milk|yogurt|yoghurt|cheese|egg|eggs|butter|cream|cheddar/i.test(lower)) return { category: 'dairy-eggs', subCategory: 'dairy' };
  if (/potato|potatoes|carrot|carrots|onion|onions|garlic|courgette|pepper|mushroom|tomato|tomatoes|spinach/i.test(lower)) return { category: 'produce', subCategory: 'vegetables' };
  if (/pasta|fusilli|penne|spaghetti|rice|oat|oats|porridge|lentil|lentils|chia|walnut|flour/i.test(lower)) return { category: 'pantry', subCategory: 'staples' };
  if (/bread|loaf|roll|bagel|pitta|wrap|bakery/i.test(lower)) return { category: 'bakery', subCategory: 'bread' };
  return { category: 'general', subCategory: 'general' };
}

export class GeminiDomParser {
  /**
   * Parse messy HTML string into typed SupermarketProduct array
   * Uses Cheerio DOM extractor + optional Google GenAI enhancement
   * @param {string} html - Raw HTML string from scraper
   * @param {string} searchQuery - Original user query
   * @returns {Promise<Array<import('../types').SupermarketProduct>>}
   */
  static async parseHtml(html, searchQuery) {
    if (!html || typeof html !== 'string') {
      return [];
    }

    const $ = cheerio.load(html);
    const rawCards = [];

    // Extract all product item nodes from Trolley.co.uk markup
    $('.product-item, [data-product], .products-grid .product').each((idx, el) => {
      const $el = $(el);
      const id = $el.attr('data-id') || `item-${idx}`;
      
      const linkEl = $el.find('a[href^="/product/"]').first();
      const href = linkEl.attr('href') || '';
      const fullUrl = href ? (href.startsWith('http') ? href : `https://www.trolley.co.uk${href}`) : '';
      
      const brand = $el.find('._brand, .brand').text().trim();
      const desc = $el.find('._desc, .description, .title').text().trim();
      const rawTitle = linkEl.attr('title') || `${brand} ${desc}`.trim();
      
      const sizeStr = $el.find('._size, .size, ._tag').text().trim();
      
      const priceText = $el.find('._price, .price').text().trim();
      const priceMatch = priceText.match(/£([\d.]+)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      
      const perItemText = $el.find('._per-item, .unit-price').text().trim();
      
      const imgEl = $el.find('img').first();
      let imgSrc = imgEl.attr('src') || imgEl.attr('data-src') || '';
      if (imgSrc && !imgSrc.startsWith('http')) {
        imgSrc = `https://www.trolley.co.uk${imgSrc}`;
      }

      if (rawTitle && price > 0) {
        rawCards.push({
          id,
          brand,
          title: rawTitle,
          sizeStr,
          price,
          perItemText,
          url: fullUrl,
          imageUrl: imgSrc
        });
      }
    });

    console.log(`[Logic-API -> GeminiDomParser] Extracted ${rawCards.length} raw product cards from DOM.`);

    // If Google GenAI API key is present, valid, and not in quota cooldown, enhance extraction with Gemini
    const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY;
    const apiKey = (rawKey && typeof rawKey === 'string' && rawKey.trim().length > 10) ? rawKey.trim() : null;
    const now = Date.now();

    if (apiKey && rawCards.length > 0 && now > (GeminiDomParser.quotaCooldownUntil || 0)) {
      try {
        const enhanced = await this.enhanceWithGemini(rawCards.slice(0, 20), searchQuery, apiKey);
        if (enhanced && enhanced.length > 0) {
          return enhanced;
        }
      } catch (geminiErr) {
        if (geminiErr.message && (geminiErr.message.includes('429') || geminiErr.message.includes('RESOURCE_EXHAUSTED'))) {
          GeminiDomParser.quotaCooldownUntil = Date.now() + 10 * 60 * 1000;
          console.warn('[Logic-API -> GeminiDomParser] GenAI free tier rate limit reached. Cooldown for 10m; using native fast DOM parsing.');
        } else {
          console.warn(`[Logic-API -> GeminiDomParser] GenAI parsing fallback: ${geminiErr.message}`);
        }
      }
    }

    // Direct DOM transformation pipeline
    const products = [];
    for (const card of rawCards) {
      const supermarket = normalizeSupermarket(card.brand, card.title);
      if (!supermarket) continue;

      const { size, unit, display } = parseMetricSize(card.sizeStr, card.title);
      const { category, subCategory } = assignCategory(card.title);

      // Compute unit price (£/kg or £/L or £/item)
      let unitPrice = card.price;
      let unitPriceMeasure = '£/item';
      if (unit === 'g' && size > 0) {
        unitPrice = Number(((card.price / size) * 1000).toFixed(2));
        unitPriceMeasure = '£/kg';
      } else if (unit === 'ml' && size > 0) {
        unitPrice = Number(((card.price / size) * 1000).toFixed(2));
        unitPriceMeasure = '£/L';
      } else if (unit === 'pack' && size > 0) {
        unitPrice = Number((card.price / size).toFixed(2));
        unitPriceMeasure = '£/item';
      }

      // Detect dietary / health attributes
      const titleLower = card.title.toLowerCase();
      const urlLower = (card.url || '').toLowerCase();
      let fatMatch = titleLower.match(/(\d+)%\s*(?:fat|lean)/i) || urlLower.match(/(\d+)-(?:fat|lean)/i);
      let fatPercentage = fatMatch ? parseInt(fatMatch[1], 10) : undefined;

      if (fatPercentage === undefined && (titleLower.includes('lean') || titleLower.includes('steak mince'))) {
        fatPercentage = 5;
      }

      const isWholewheat = /wholewheat|wholemeal|wholegrain/i.test(titleLower);
      const isFreeRange = /free range/i.test(titleLower);
      const isOrganic = /organic/i.test(titleLower);
      const isFrozen = /frozen/i.test(titleLower) || /frozen/i.test(urlLower);
      const isHealthier = (fatPercentage !== undefined && fatPercentage <= 5) || isWholewheat || isFreeRange || isOrganic;

      // Tier detection
      let tier = 'standard';
      if (/essential|smart price|just essentials|savers|everyday/i.test(titleLower)) tier = 'value';
      else if (/finest|taste the difference|extra special|the best|organic/i.test(titleLower)) tier = 'premium';
      else if (card.brand && !['Tesco', 'ASDA', "Sainsbury's", 'Morrisons', 'Iceland'].includes(card.brand)) tier = 'branded';

      products.push({
        id: `${supermarket}-${card.id}`,
        supermarket,
        title: card.title,
        brand: card.brand || supermarket.toUpperCase(),
        tier,
        category,
        subCategory,
        packageSize: size,
        packageUnit: unit,
        packageDisplay: display,
        price: card.price,
        unitPrice,
        unitPriceMeasure,
        isHealthier,
        fatPercentage,
        isOrganic,
        isWholewheat,
        isFreeRange,
        isFrozen,
        inStock: true,
        productUrl: card.url,
        imageUrl: card.imageUrl || 'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=200&auto=format&fit=crop&q=60'
      });
    }

    console.log(`[Logic-API -> GeminiDomParser] Successfully structured ${products.length} supermarket products.`);
    return products;
  }

  /**
   * Use @google/genai SDK to parse and validate product cards with timeout
   */
  static async enhanceWithGemini(rawCards, query, apiKey) {
    const geminiPromise = (async () => {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are a UK grocery data parser. Extract and normalise these raw product cards from a UK supermarket aggregator search for query: "${query}".
Standardise strictly on UK English, GBP (£), metric weights (g, kg, ml, L), and assign to one of ['tesco', 'asda', 'sainsburys', 'morrisons', 'iceland'].

Raw Cards:
${JSON.stringify(rawCards, null, 2)}

Return a JSON array of objects with schema:
[
  {
    "id": "string",
    "supermarket": "tesco" | "asda" | "sainsburys" | "morrisons" | "iceland",
    "title": "string",
    "brand": "string",
    "tier": "value" | "standard" | "premium" | "branded",
    "category": "meat" | "fish" | "dairy-eggs" | "produce" | "pantry" | "bakery" | "general",
    "subCategory": "string",
    "packageSize": number (in grams, ml, or units),
    "packageUnit": "g" | "kg" | "ml" | "l" | "pack",
    "packageDisplay": "string (e.g. 750g, 1kg, 2 Pints)",
    "price": number,
    "unitPrice": number,
    "unitPriceMeasure": "£/kg" | "£/L" | "£/item",
    "isHealthier": boolean,
    "fatPercentage": number | null,
    "isOrganic": boolean,
    "isWholewheat": boolean,
    "isFreeRange": boolean,
    "inStock": true,
    "productUrl": "string",
    "imageUrl": "string"
  }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsed = JSON.parse(response.text);
      return Array.isArray(parsed) ? parsed : [];
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out after 6000ms')), 6000)
    );

    return Promise.race([geminiPromise, timeoutPromise]);
  }
}
