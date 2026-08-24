import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connect } from 'puppeteer-real-browser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'scraper-pod',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// SSRF / Host validation
const ALLOWED_HOSTS = [
  'trolley.co.uk',
  'www.trolley.co.uk',
  'groceries.asda.com',
  'asda.com',
  'sainsburys.co.uk',
  'tesco.com',
  'morrisons.com',
  'groceries.morrisons.com',
  'iceland.co.uk',
  'groceries.aldi.co.uk',
  'aldi.co.uk',
  'lidl.co.uk',
  'waitrose.com',
  'ocado.com',
  'coop.co.uk'
];

function isAllowedUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    
    // Prevent SSRF against private networks / localhost / link-local / metadata
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    return ALLOWED_HOSTS.some(allowed => hostname === allowed || hostname.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

// Managed browser instance pool
let sharedBrowser = null;
let browserLaunchPromise = null;

async function getBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = (async () => {
    try {
      console.log('[Scraper-Pod] Initializing shared Chromium instance...');
      const { browser } = await connect({
        headless: true,
        turnstile: true,
        disableXvfb: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
      sharedBrowser = browser;
      sharedBrowser.on('disconnected', () => {
        console.log('[Scraper-Pod] Browser disconnected. Will re-initialize on next request.');
        sharedBrowser = null;
      });
      return sharedBrowser;
    } finally {
      browserLaunchPromise = null;
    }
  })();

  return browserLaunchPromise;
}

// Main scraping endpoint
app.post('/scrape', async (req, res) => {
  const {
    url,
    waitForSelector,
    timeout = 35000,
    delay = 2000,
    turnstile = true
  } = req.body;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing "url" parameter in request body'
    });
  }

  if (!isAllowedUrl(url)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Target URL host is not on the allowed supermarket scraping domain list.'
    });
  }

  console.log(`[Scraper-Pod] Received scrape request for: ${url}`);
  const startTime = Date.now();
  let page = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Set standard desktop viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Set custom headers to reinforce UK locale
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-GB,en;q=0.9',
    });

    console.log(`[Scraper-Pod] Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Number(timeout)
    });

    // If Turnstile or Cloudflare challenge is present, allow settling time
    if (turnstile) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // If a specific selector was requested, wait for it
    if (waitForSelector && typeof waitForSelector === 'string') {
      try {
        await page.waitForSelector(waitForSelector, { timeout: Math.min(8000, timeout) });
      } catch {
        console.warn(`[Scraper-Pod] Selector "${waitForSelector}" not found before timeout. Proceeding.`);
      }
    }

    // Additional settling delay for client-rendered SPA / search aggregators
    if (delay && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, Number(delay)));
    }

    // Extract page metadata and contents (omit duplicate body payload to reduce bandwidth)
    const title = await page.title();
    const finalUrl = page.url();
    const html = await page.content();

    const elapsed = Date.now() - startTime;
    console.log(`[Scraper-Pod] Scrape complete in ${elapsed}ms. Title: "${title}". HTML Length: ${html.length} bytes.`);

    res.json({
      success: true,
      url,
      finalUrl,
      title,
      html,
      length: html.length,
      elapsedMs: elapsed
    });

  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[Scraper-Pod] Scrape error after ${elapsed}ms:`, err.message);

    res.status(500).json({
      success: false,
      url,
      error: err.message || 'Scrape execution failed',
      elapsedMs: elapsed
    });
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (pageCloseErr) {
        console.warn('[Scraper-Pod] Error closing page:', pageCloseErr.message);
      }
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Scraper-Pod] Service A listening on http://0.0.0.0:${PORT}`);
  console.log(`   Health Check: GET http://localhost:${PORT}/health`);
  console.log(`   Scrape API:   POST http://localhost:${PORT}/scrape`);
});

