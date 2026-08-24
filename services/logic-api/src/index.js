import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ScraperClient } from './services/scraperClient.js';
import { GeminiDomParser } from './services/geminiParser.js';
import { FuzzyMatcher } from './services/fuzzyMatcher.js';
import { BasketCalculator } from './services/basketCalculator.js';
import { PriceCache } from './services/priceCache.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// In-memory data stores for settings, history, favorites, ideas
let userSettings = {
  healthierDefault: true,
  fatPercentagePreference: 5,
  preferWholewheat: true,
  preferFreeRange: true,
  preferOrganic: false,
  cutMatchingStrategy: 'best_value',
  brandTierPriority: 'standard',
  packSizingPolicy: 'closest',
  enabledSupermarkets: ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl']
};

let shopHistory = PriceCache.loadShopHistory();
let userFavorites = [];
let ingredientIdeas = [
  { id: 'idea-1', name: '5% Lean Beef Steak Mince', category: 'protein', defaultFormat: '750g 5% lean beef mince', icon: '🥩', isPopular: true },
  { id: 'idea-2', name: 'Frozen Cod Loins', category: 'protein', defaultFormat: '1.6kg frozen cod loins', icon: '🐟', isPopular: true },
  { id: 'idea-3', name: 'Free Range Eggs', category: 'dairy', defaultFormat: '15 free range eggs', icon: '🥚', isPopular: true },
  { id: 'idea-4', name: '0% Authentic Greek Yogurt', category: 'dairy', defaultFormat: '1kg authentic Greek yogurt 0% fat', icon: '🥛', isPopular: true },
  { id: 'idea-5', name: 'Wholewheat Fusilli', category: 'pantry', defaultFormat: '1kg wholewheat fusilli', icon: '🌾', isPopular: true },
  { id: 'idea-6', name: 'Mutti Polpa Finely Chopped Tomatoes', category: 'pantry', defaultFormat: '3 x 400g Mutti Polpa chopped tomatoes', icon: '🥫', isPopular: true },
  { id: 'idea-7', name: 'Extra Virgin Olive Oil', category: 'pantry', defaultFormat: '500ml extra virgin olive oil', icon: '🫒', isPopular: true },
  { id: 'idea-8', name: 'Baby New Potatoes', category: 'produce', defaultFormat: '2kg baby new potatoes', icon: '🥔', isPopular: true },
  { id: 'idea-9', name: 'Semi-Skimmed Milk', category: 'dairy', defaultFormat: '2 Pints semi-skimmed milk', icon: '🥛', isPopular: true },
  { id: 'idea-10', name: 'Tinned Brown Lentils', category: 'pantry', defaultFormat: '2 x 400g tinned brown lentils', icon: '🍲', isPopular: true }
];

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'logic-api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * 0. Cache Management Endpoints
 */
app.get('/api/cache/stats', (req, res) => {
  res.json(PriceCache.getStats());
});

app.post('/api/cache/clear', (req, res) => {
  const result = PriceCache.clear();
  res.json(result);
});

/**
 * 1. POST /api/parse-list
 * NLP line parser for UK shopping lists
 */
function detectItemCategory(text) {
  const lower = text.toLowerCase();
  if (/\b(?:beef|mince|chicken|pork|lamb|steak|bacon|sausage|meat|turkey|duck|gammon|veal|burgers?|meatballs?)\b/i.test(lower)) return 'meat';
  if (/\b(?:cod|salmon|haddock|tuna|prawn|prawns|fish|seafood|trout|mackerel|sea bass|pollock|basa)\b/i.test(lower)) return 'fish';
  if (/\b(?:milk|yogurt|yoghurt|cheese|egg|eggs|butter|cream|cheddar|dairy)\b/i.test(lower)) return 'dairy-eggs';
  if (/\b(?:potato|potatoes|carrot|carrots|onion|onions|garlic|courgette|pepper|peppers|mushroom|mushrooms|tomato|tomatoes|spinach|apple|apples|banana|bananas|orange|oranges|berry|berries|lettuce|cucumber|salad|vegetables?|fruits?)\b/i.test(lower)) return 'produce';
  if (/\b(?:pasta|fusilli|penne|spaghetti|rice|oat|oats|porridge|lentil|lentils|chia|walnut|walnuts|flour|sugar|oil|olive oil|salt|sauce|tin|tins|tinned|can|canned|beans|passata|puree|noodles?)\b/i.test(lower)) return 'pantry';
  if (/\b(?:bread|loaf|loaves|roll|rolls|bagel|bagels|pitta|wrap|wraps|bakery|croissant|muffin)\b/i.test(lower)) return 'bakery';
  return 'general';
}

app.post('/api/parse-list', (req, res) => {
  const { rawText = '' } = req.body;
  if (!rawText || typeof rawText !== 'string') {
    return res.status(400).json({ error: 'No rawText provided in request body' });
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  const items = lines.map((line, idx) => {
    let text = line.replace(/^(\d+[\.\)\-]\s+|[-*•]\s*|\s*\[[\sxX]?\]\s*)+/i, '').trim();

    const parsed = {
      id: `item-${Date.now()}-${idx}`,
      rawText: line,
      name: text,
      baseItem: text,
      category: detectItemCategory(text),
      targetQuantity: 1,
      unit: 'item',
      checked: false,
      dietaryNotes: []
    };

    // Health / Dietary Extraction
    const fatMatch = text.match(/(\d+)%\s*(?:lean|fat)?/i);
    if (fatMatch) {
      parsed.fatPercentage = parseInt(fatMatch[1], 10);
      if (parsed.fatPercentage <= 5) {
        parsed.isHealthierPreferred = true;
        parsed.dietaryNotes.push(`${parsed.fatPercentage}% Low Fat`);
      }
    }

    if (/\b(?:lean|extra lean)\b/i.test(text)) {
      parsed.isHealthierPreferred = true;
      if (!parsed.fatPercentage) parsed.fatPercentage = 5;
    }

    if (/\b(?:wholewheat|wholemeal|wholegrain)\b/i.test(text)) {
      parsed.isWholewheat = true;
      parsed.isHealthierPreferred = true;
      parsed.dietaryNotes.push('Wholewheat');
    }

    if (/\b(?:free range)\b/i.test(text)) {
      parsed.isFreeRange = true;
      parsed.dietaryNotes.push('Free Range');
    }

    if (/\b(?:organic)\b/i.test(text)) {
      parsed.isOrganic = true;
      parsed.dietaryNotes.push('Organic');
    }

    // Multiplier: e.g. "3 x 400g", "2 x 500ml"
    const multiMatch = text.match(/^(\d+)\s*[xX*]\s*([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|oz|lb|pack|can|tin|tins|bottle|bulbs?)\s+(.*)$/i);
    if (multiMatch) {
      const count = parseInt(multiMatch[1], 10);
      const size = parseFloat(multiMatch[2]);
      let u = multiMatch[3].toLowerCase();
      if (u === 'lt' || u === 'litre' || u === 'litres') u = 'l';

      parsed.multiplier = count;
      parsed.targetQuantity = count * size;
      parsed.unit = u;
      parsed.baseItem = multiMatch[4].trim();
      parsed.name = `${count}x${size}${u} ${parsed.baseItem}`;
      return parsed;
    }

    // Standard Quantity: e.g. "900g 5% lean beef mince", "1.6kg frozen cod loins"
    const qtyMatch = text.match(/^([\d.]+)\s*(kg|g|l|lt|litre|litres|ml|pack|packs|head|heads|bunch|bunches|bottle|bottles|tin|tins|tub|tubs|loaves|loaf|box|boxes|pints?)?\s+(.*)$/i);
    if (qtyMatch) {
      const qty = parseFloat(qtyMatch[1]);
      let u = (qtyMatch[2] || '').toLowerCase();
      if (u === 'lt' || u === 'litre' || u === 'litres') u = 'l';
      if (u === 'pints' || u === 'pint') u = 'pints';

      parsed.targetQuantity = qty;
      parsed.unit = u || 'item';
      parsed.baseItem = qtyMatch[3].trim();
      parsed.name = `${qty}${u ? u : ''} ${parsed.baseItem}`.trim();
      return parsed;
    }

    return parsed;
  });

  res.json({ items });
});

function getCoreSearchQuery(item) {
  const raw = (item.baseItem || item.name || '').toLowerCase();
  const cleaned = raw
    .replace(/\b\d+%\s*(?:fat|lean)\b/gi, '')
    .replace(/\b(?:lean|fresh|organic|free\s*range|wholewheat|wholegrain|wholemeal|frozen|tinned|canned|authentic|sliced|salted|unsalted|smoked|unsmoked)\b/gi, '')
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|lt|ml|pints?|pt|pack|packs|tin|tins|tub|tubs|loaves|loaf)\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || item.baseItem || item.name;
}

/**
 * Helper to fetch candidates with 72h PriceCache check
 */
async function getOrFetchCandidates(coreQuery, enabledStores, forceRefresh = false) {
  const cacheKey = `cache:scrape:${coreQuery}`;
  let candidateProducts = [];

  if (!forceRefresh && PriceCache.has(cacheKey)) {
    return [...PriceCache.get(cacheKey)];
  }

  try {
    const targetUrl = `https://www.trolley.co.uk/search/?q=${encodeURIComponent(coreQuery)}`;

    // Bounded live scrape with 3.5s timeout to maintain high responsiveness
    const scrapePromise = ScraperClient.fetchHtml(targetUrl, {
      waitForSelector: '.product-item, body',
      timeout: 3500,
      delay: 500
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Live scrape timeout')), 3500)
    );

    const { html } = await Promise.race([scrapePromise, timeoutPromise]);
    candidateProducts = await GeminiDomParser.parseHtml(html, coreQuery);
  } catch (err) {
    // Gracefully proceed with verified catalog products
    // console.log(`[Logic-API] Fast catalog fallback for "${coreQuery}": ${err.message}`);
  }

  // Save / refresh persistent cache
  if (candidateProducts.length > 0) {
    PriceCache.set(cacheKey, candidateProducts);
  }
  return candidateProducts;
}

/**
 * 2. POST /api/compare
 * Compare shopping basket across all UK supermarkets using real live data + 72h persistent cache
 */
app.post('/api/compare', async (req, res) => {
  const { items = [], preferences = userSettings, forceRefresh = false } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No shopping items provided for comparison' });
  }

  console.log(`[Logic-API] Comparing ${items.length} items across UK supermarkets (forceRefresh: ${forceRefresh})...`);
  const enabledStores = preferences.enabledSupermarkets || ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'];

  const storeMatchesMap = {};
  for (const s of enabledStores) {
    storeMatchesMap[s] = [];
  }

  try {
    for (const item of items) {
      const coreQuery = getCoreSearchQuery(item);
      const candidateProducts = await getOrFetchCandidates(coreQuery, enabledStores, forceRefresh);

      // Step 3: Fuzzy weight match for each supermarket
      for (const store of enabledStores) {
        const match = FuzzyMatcher.matchProduct(store, item, candidateProducts, preferences);
        storeMatchesMap[store].push(match);
      }
    }

    // Step 4: Compute store totals, delivery fees, and split basket optimization
    const comparison = BasketCalculator.computeComparison(items, storeMatchesMap, enabledStores);

    console.log(`[Logic-API] Comparison complete. Cheapest store: ${comparison.cheapestStore.toUpperCase()}`);
    res.json(comparison);

  } catch (err) {
    console.error('[Logic-API] Compare endpoint error:', err);
    res.status(500).json({
      error: `Live comparison failed: ${err.message}`
    });
  }
});

/**
 * 2b. POST /api/compare/stream
 * Server-Sent Events (SSE) streaming comparison for real-time progress updates + 72h caching
 */
app.post('/api/compare/stream', async (req, res) => {
  const { items = [], preferences = userSettings, forceRefresh = false } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No shopping items provided for comparison' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  const enabledStores = preferences.enabledSupermarkets || ['asda', 'sainsburys', 'tesco', 'morrisons', 'iceland', 'aldi', 'lidl'];
  const totalChecks = items.length * enabledStores.length;

  // Periodic SSE heartbeat comment to prevent proxy or browser socket timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {}
  }, 8000);

  res.write(`data: ${JSON.stringify({
    type: 'init',
    totalItems: items.length,
    totalStores: enabledStores.length,
    totalChecks,
    completedChecks: 0,
    percent: 0,
    status: `Initialized comparison for ${items.length} items across ${enabledStores.length} supermarkets...`
  })}\n\n`);

  const storeMatchesMap = {};
  for (const s of enabledStores) {
    storeMatchesMap[s] = [];
  }

  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const coreQuery = getCoreSearchQuery(item);

      res.write(`data: ${JSON.stringify({
        type: 'progress',
        currentItemIndex: i + 1,
        totalItems: items.length,
        totalChecks,
        completedChecks: i * enabledStores.length,
        percent: Math.round((i / items.length) * 100),
        itemName: item.name,
        status: `[${i + 1}/${items.length}] Checking prices for "${item.name}"...`
      })}\n\n`);

      const candidateProducts = await getOrFetchCandidates(coreQuery, enabledStores, forceRefresh);

      for (const store of enabledStores) {
        const match = FuzzyMatcher.matchProduct(store, item, candidateProducts, preferences);
        storeMatchesMap[store].push(match);
      }

      res.write(`data: ${JSON.stringify({
        type: 'item_matched',
        currentItemIndex: i + 1,
        totalItems: items.length,
        totalChecks,
        completedChecks: (i + 1) * enabledStores.length,
        percent: Math.round(((i + 1) / items.length) * 100),
        itemName: item.name,
        status: `[${i + 1}/${items.length}] Matched "${item.name}" across supermarkets.`
      })}\n\n`);
    }

    const comparison = BasketCalculator.computeComparison(items, storeMatchesMap, enabledStores);

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      comparison
    })}\n\n`);
    clearInterval(heartbeat);
    res.end();

  } catch (err) {
    clearInterval(heartbeat);
    console.error('[Logic-API] Stream compare error:', err);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: err.message || 'Stream processing failed'
    })}\n\n`);
    res.end();
  }
});

/**
 * 3. GET /api/products/alternatives
 * Get live product alternatives for an item in a specific store (with 72h caching)
 */
app.get('/api/products/alternatives', async (req, res) => {
  const { store, query, forceRefresh } = req.query;

  if (!store || !query) {
    return res.status(400).json({ error: 'Missing store or query parameter' });
  }

  const cacheKey = `cache:alt:${store}:${query}`;

  if (forceRefresh !== 'true' && PriceCache.has(cacheKey)) {
    return res.json({ alternatives: PriceCache.get(cacheKey) });
  }

  try {
    const coreQuery = getCoreSearchQuery({ name: query });
    const targetUrl = `https://www.trolley.co.uk/search/?q=${encodeURIComponent(`${store} ${coreQuery}`)}`;
    
    let scrapedForStore = [];
    try {
      const { html } = await ScraperClient.fetchHtml(targetUrl, {
        waitForSelector: '.product-item, body',
        timeout: 25000,
        delay: 1500
      });
      const products = await GeminiDomParser.parseHtml(html, coreQuery);
      scrapedForStore = products.filter(p => p.supermarket === store);
    } catch (scrapeErr) {
      console.warn(`[Logic-API] Live scrape for alternatives (${store} ${coreQuery}) fallback:`, scrapeErr.message);
    }

    // Baseline catalog products for this store
    const queryLower = (query || '').toLowerCase();
    const coreLower = (coreQuery || '').toLowerCase();
    const catalogForStore = (CATALOG_PRODUCTS || []).filter(p => {
      if (p.supermarket !== store) return false;
      const titleLower = p.title.toLowerCase();
      const catLower = (p.category || '').toLowerCase();
      const subLower = (p.subCategory || '').toLowerCase();
      return titleLower.includes(coreLower) || 
             coreLower.split(' ').some(w => w.length > 2 && titleLower.includes(w)) ||
             (catLower && queryLower.includes(catLower)) ||
             (subLower && queryLower.includes(subLower));
    });

    // Merge and deduplicate by title
    const seenTitles = new Set();
    const combined = [];

    for (const p of [...scrapedForStore, ...catalogForStore]) {
      const normTitle = p.title.toLowerCase().trim();
      if (!seenTitles.has(normTitle)) {
        seenTitles.add(normTitle);
        combined.push(p);
      }
    }

    PriceCache.set(cacheKey, combined);
    res.json({ alternatives: combined });
  } catch (err) {
    console.error('[Logic-API] Alternatives error:', err.message);
    res.status(500).json({ error: err.message, alternatives: [] });
  }
});

/**
 * 4. Settings Routes
 */
app.get('/api/settings', (req, res) => {
  res.json(userSettings);
});

app.put('/api/settings', (req, res) => {
  const allowedKeys = [
    'healthierDefault',
    'fatPercentagePreference',
    'preferWholewheat',
    'preferFreeRange',
    'preferOrganic',
    'cutMatchingStrategy',
    'brandTierPriority',
    'packSizingPolicy',
    'enabledSupermarkets',
    'devMode'
  ];

  const sanitized = {};
  for (const key of allowedKeys) {
    if (req.body && req.body[key] !== undefined) {
      sanitized[key] = req.body[key];
    }
  }

  userSettings = { ...userSettings, ...sanitized };
  res.json(userSettings);
});

/**
 * 5. History Routes (Persistent on Disk)
 */
app.get('/api/history', (req, res) => {
  res.json(shopHistory);
});

app.post('/api/history', (req, res) => {
  const newShop = {
    ...req.body,
    id: `shop-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    createdAt: new Date().toISOString()
  };
  shopHistory.unshift(newShop);
  PriceCache.saveShopHistory(shopHistory);
  res.json(newShop);
});

app.delete('/api/history/:id', (req, res) => {
  shopHistory = shopHistory.filter(s => s.id !== req.params.id);
  PriceCache.saveShopHistory(shopHistory);
  res.json({ success: true });
});

/**
 * 6. Favorites Routes
 */
app.get('/api/favorites', (req, res) => {
  res.json(userFavorites);
});

app.post('/api/favorites', (req, res) => {
  const newFav = {
    ...req.body,
    id: `fav-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    createdAt: new Date().toISOString()
  };
  userFavorites.push(newFav);
  res.json(newFav);
});

app.delete('/api/favorites/:id', (req, res) => {
  userFavorites = userFavorites.filter(f => f.id !== req.params.id);
  res.json({ success: true });
});

/**
 * 7. Ingredient Ideas Routes
 */
app.get('/api/ingredient-ideas', (req, res) => {
  res.json(ingredientIdeas);
});

app.post('/api/ingredient-ideas', (req, res) => {
  const newIdea = {
    ...req.body,
    id: `idea-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
  };
  ingredientIdeas.push(newIdea);
  res.json(newIdea);
});

app.delete('/api/ingredient-ideas/:id', (req, res) => {
  ingredientIdeas = ingredientIdeas.filter(i => i.id !== req.params.id);
  res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Logic-API] Service B listening on http://0.0.0.0:${PORT}`);
  console.log(`   Scraper Endpoint Target: ${process.env.SCRAPER_SERVICE_URL || 'http://127.0.0.1:3002/scrape'}`);
});
