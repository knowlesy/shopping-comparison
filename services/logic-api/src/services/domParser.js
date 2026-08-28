import * as cheerio from 'cheerio';
import { DealCalculator } from './dealCalculator.js';
import { formatConfidence } from './confidence.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Supermarket normalisation mapping
 */
export function normalizeSupermarket(rawBrand, rawTitle = '') {
  const text = `${rawBrand} ${rawTitle}`.toLowerCase();
  if (text.includes('tesco')) return 'tesco';
  if (text.includes('asda')) return 'asda';
  if (text.includes('sainsbury')) return 'sainsburys';
  if (text.includes('morrison')) return 'morrisons';
  if (text.includes('iceland')) return 'iceland';
  if (text.includes('waitrose')) return 'waitrose';
  if (text.includes('ocado') || text.includes('marks and spencer') || text.includes('m&s'))
    return 'ocado';
  if (text.includes('co-op') || text.includes('coop')) return 'coop';
  if (text.includes('aldi')) return 'aldi';
  if (text.includes('lidl')) return 'lidl';
  return null;
}

/**
 * Metric size normalisation
 */
export function parseMetricSize(sizeStr, title = '') {
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
  if (
    /(?:beef|pork|lamb|turkey|chicken)\s+mince/i.test(combined) ||
    /steak mince/i.test(combined)
  ) {
    return { size: 500, unit: 'g', display: '500g' };
  }

  return { size: 1, unit: 'item', display: sizeStr || '1 item' };
}

/**
 * Category assignment
 */
export function assignCategory(title = '') {
  const lower = title.toLowerCase();
  if (/beef|mince|chicken|pork|lamb|steak|bacon|sausage|meat/i.test(lower))
    return { category: 'meat', subCategory: 'beef' };
  if (/cod|salmon|haddock|tuna|prawn|fish|seafood/i.test(lower))
    return { category: 'fish', subCategory: 'frozen fish' };
  if (/milk|yogurt|yoghurt|cheese|egg|eggs|butter|cream|cheddar/i.test(lower))
    return { category: 'dairy-eggs', subCategory: 'dairy' };
  if (
    /potato|potatoes|carrot|carrots|onion|onions|garlic|courgette|pepper|mushroom|tomato|tomatoes|spinach/i.test(
      lower
    )
  )
    return { category: 'produce', subCategory: 'vegetables' };
  if (
    /pasta|fusilli|penne|spaghetti|rice|oat|oats|porridge|lentil|lentils|chia|walnut|flour/i.test(
      lower
    )
  )
    return { category: 'pantry', subCategory: 'staples' };
  if (/bread|loaf|roll|bagel|pitta|wrap|bakery/i.test(lower))
    return { category: 'bakery', subCategory: 'bread' };
  return { category: 'general', subCategory: 'general' };
}

export class DomParser {
  /**
   * Parse price strings (e.g. "£1.50", "85p", "1.99") into numeric GBP
   */
  static parsePrice(priceText = '') {
    if (!priceText || typeof priceText !== 'string') return 0;
    const clean = priceText.trim();
    if (clean.includes('p') && !clean.includes('£') && !clean.includes('.')) {
      const pence = parseFloat(clean.replace(/[^\d.]/g, ''));
      return isNaN(pence) ? 0 : Number((pence / 100).toFixed(2));
    }
    const match = clean.match(/[\d.]+/);
    if (match) {
      const val = parseFloat(match[0]);
      return isNaN(val) ? 0 : Number(val.toFixed(2));
    }
    return 0;
  }

  /**
   * Parse HTML string into typed SupermarketProduct array using Cheerio DOM extraction
   * @param {string} html - Raw HTML string from scraper
   * @param {string} searchQuery - Original user query
   * @returns {Promise<Array<object>>}
   */
  static async parseHtml(html, _searchQuery = '') {
    if (!html || typeof html !== 'string') {
      return [];
    }

    const $ = cheerio.load(html);
    const rawCards = [];

    $('.product-item, [data-product], .products-grid .product').each((idx, el) => {
      const $el = $(el);
      const id = $el.attr('data-id') || `item-${idx}`;

      const linkEl = $el.find('a[href^="/product/"]').first();
      const href = linkEl.attr('href') || '';
      const fullUrl = href
        ? href.startsWith('http')
          ? href
          : `https://www.trolley.co.uk${href}`
        : '';

      const brand = $el.find('._brand, .brand').text().trim();
      const desc = $el.find('._desc, .description, .title').text().trim();
      const rawTitle = linkEl.attr('title') || `${brand} ${desc}`.trim();
      const sizeStr = $el.find('._size, .size, ._tag').text().trim();
      const priceText = $el.find('._price, .price').text().trim();
      const price = this.parsePrice(priceText);
      const promoText =
        $el
          .find('._tag, ._deal, ._promo, ._multibuy, .promo, .deal, .tag, [data-deal]')
          .text()
          .trim() ||
        $el.attr('data-deal') ||
        '';

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
          promoText,
          url: fullUrl,
          imageUrl: imgSrc
        });
      }
    });

    const products = [];
    for (const card of rawCards) {
      const supermarket = normalizeSupermarket(card.brand, card.title);
      if (!supermarket) continue;

      const { size, unit, display } = parseMetricSize(card.sizeStr, card.title);
      const { category, subCategory } = assignCategory(card.title);

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

      const titleLower = card.title.toLowerCase();
      const urlLower = (card.url || '').toLowerCase();
      const fatMatch =
        titleLower.match(/(\d+)%\s*(?:fat|lean)/i) || urlLower.match(/(\d+)-(?:fat|lean)/i);
      let fatPercentage = fatMatch ? parseInt(fatMatch[1], 10) : undefined;

      if (
        fatPercentage === undefined &&
        (titleLower.includes('lean') || titleLower.includes('steak mince'))
      ) {
        fatPercentage = 5;
      }

      const isWholewheat = /wholewheat|wholemeal|wholegrain/i.test(titleLower);
      const isFreeRange = /free range/i.test(titleLower);
      const isOrganic = /organic/i.test(titleLower);
      const isFrozen = /frozen/i.test(titleLower) || /frozen/i.test(urlLower);
      const isHealthier =
        (fatPercentage !== undefined && fatPercentage <= 5) ||
        isWholewheat ||
        isFreeRange ||
        isOrganic;

      let tier = 'standard';
      if (/essential|smart price|just essentials|savers|everyday/i.test(titleLower)) tier = 'value';
      else if (/finest|taste the difference|extra special|the best|organic/i.test(titleLower))
        tier = 'premium';
      else if (
        card.brand &&
        !['Tesco', 'ASDA', "Sainsbury's", 'Morrisons', 'Iceland'].includes(card.brand)
      )
        tier = 'branded';

      const deal = card.promoText ? DealCalculator.parseDeal(card.promoText) : undefined;
      const clubcardPrice =
        deal?.type === 'loyalty_price' ? deal.loyaltyPrice : undefined;

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
        deal: deal || undefined,
        promoText: card.promoText || undefined,
        clubcardPrice,
        ...formatConfidence(0.8, 'aggregator'),
        isHealthier,
        fatPercentage,
        isOrganic,
        isWholewheat,
        isFreeRange,
        isFrozen,
        inStock: true,
        productUrl: card.url,
        imageUrl:
          card.imageUrl ||
          'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=200&auto=format&fit=crop&q=60'
      });
    }

    return products;
  }
}

DomParser.parseMetricSize = parseMetricSize;
DomParser.normalizeSupermarket = normalizeSupermarket;
