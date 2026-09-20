import express from 'express';
import dotenv from 'dotenv';
import { connect } from 'puppeteer-real-browser';
import { isAllowedUrl, verifySharedToken } from './security.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
// Production refuses to start on a missing or published-default token. Development
// keeps the convenient fallback. See services/logic-api/src/services/sharedSecret.js.
const DEV_SCRAPE_TOKEN = 'local-dev-scrape-token-shopping-app';

function resolveScrapeToken(env = process.env) {
  const configured = (env.SCRAPE_TOKEN || '').trim();
  if (env.NODE_ENV !== 'production') {
    return configured || DEV_SCRAPE_TOKEN;
  }
  if (!configured) {
    throw new Error(
      'SCRAPE_TOKEN is not set. Production requires a real shared secret; set it from a ' +
        'k3s Secret or the compose environment. To use the published development token, ' +
        'run with NODE_ENV other than "production".'
    );
  }
  if (configured === DEV_SCRAPE_TOKEN) {
    throw new Error(
      'SCRAPE_TOKEN is set to the published development token, which is in the public ' +
        'repository and must not be used in production. Generate one with: openssl rand -hex 24'
    );
  }
  return configured;
}

let SCRAPE_TOKEN;
try {
  SCRAPE_TOKEN = resolveScrapeToken();
} catch (err) {
  console.error(`[Scraper-Pod] Refusing to start: ${err.message}`);
  process.exit(1);
}

// OWASP Security: Conceal express engine footprint
app.disable('x-powered-by');

// OWASP Security: Standard defensive response headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
});

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

// Auth middleware: enforce shared secret token on scrape endpoint (fails closed, constant-time comparison)
function authenticateScrapeToken(req, res, next) {
  const token = req.headers['x-scrape-token'];
  if (!token || typeof token !== 'string') {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: invalid or missing x-scrape-token header.'
    });
  }

  if (!verifySharedToken(token, SCRAPE_TOKEN)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: invalid or missing x-scrape-token header.'
    });
  }
  next();
}

// SSRF / host validation lives in ./security.js so the OWASP audit can exercise
// the real guard rather than a copy of it.

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

  console.log('[Scraper-Pod] Initializing shared Puppeteer Real Browser instance...');
  browserLaunchPromise = (async () => {
    try {
      const response = await connect({
        headless: 'auto',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        turnstile: true,
        connectOption: {
          defaultViewport: { width: 1920, height: 1080 }
        }
      });

      sharedBrowser = response.browser;
      sharedBrowser.on('disconnected', () => {
        console.warn('[Scraper-Pod] Browser disconnected. Resetting browser instance pool.');
        sharedBrowser = null;
        browserLaunchPromise = null;
      });

      console.log('[Scraper-Pod] Shared browser instance successfully initialized.');
      return sharedBrowser;
    } catch (err) {
      console.error('[Scraper-Pod] Failed to initialize shared browser:', err.message);
      sharedBrowser = null;
      browserLaunchPromise = null;
      throw err;
    }
  })();

  return browserLaunchPromise;
}

// Scrape endpoint
app.post('/scrape', authenticateScrapeToken, async (req, res) => {
  const { url, waitForSelector, timeout = 35000, delay = 1500, turnstile = true } = req.body;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing "url" parameter in request body'
    });
  }

  if (!isAllowedUrl(url)) {
    return res.status(403).json({
      success: false,
      error:
        'Access denied: Target URL host is not on the allowed supermarket scraping domain list.'
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
      'Accept-Language': 'en-GB,en;q=0.9'
    });

    console.log(`[Scraper-Pod] Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Number(timeout)
    });

    // If Turnstile or Cloudflare challenge is present, allow settling time
    if (turnstile) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // If a specific selector was requested, wait for it
    if (waitForSelector && typeof waitForSelector === 'string') {
      try {
        await page.waitForSelector(waitForSelector, { timeout: Math.min(8000, timeout) });
      } catch {
        console.warn(
          `[Scraper-Pod] Selector "${waitForSelector}" not found before timeout. Proceeding.`
        );
      }
    }

    // Additional settling delay for client-rendered SPA / search aggregators
    if (delay && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, Number(delay)));
    }

    // Extract page metadata and contents (omit duplicate body payload to reduce bandwidth)
    const title = await page.title();
    const finalUrl = page.url();
    const html = await page.content();

    const elapsed = Date.now() - startTime;
    console.log(
      `[Scraper-Pod] Scrape complete in ${elapsed}ms. Title: "${title}". HTML Length: ${html.length} bytes.`
    );

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
