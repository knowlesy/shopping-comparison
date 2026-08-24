import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connect } from 'puppeteer-real-browser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'scraper-pod',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Main scraping endpoint
app.post('/scrape', async (req, res) => {
  const {
    url,
    waitForSelector,
    timeout = 35000,
    delay = 2500,
    turnstile = true
  } = req.body;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or missing "url" parameter in request body'
    });
  }

  console.log(`[Scraper-Pod] Received scrape request for: ${url}`);
  const startTime = Date.now();

  let browserInstance = null;

  try {
    // Launch real browser in headless mode
    const { browser, page } = await connect({
      headless: true,
      turnstile: turnstile,
      disableXvfb: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    browserInstance = browser;

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

    // If Turnstile or Cloudflare challenge is present, allow time for solver
    if (turnstile) {
      console.log(`[Scraper-Pod] Checking for Cloudflare / Turnstile challenges...`);
      // Wait for challenge resolution or dynamic page stabilization
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // If a specific selector was requested, wait for it
    if (waitForSelector && typeof waitForSelector === 'string') {
      try {
        console.log(`[Scraper-Pod] Waiting for selector: ${waitForSelector}`);
        await page.waitForSelector(waitForSelector, { timeout: Math.min(10000, timeout) });
      } catch (selErr) {
        console.warn(`[Scraper-Pod] Warning: Selector "${waitForSelector}" not found before timeout. Proceeding with current DOM.`);
      }
    }

    // Additional settling delay for client-rendered SPA / search aggregators
    if (delay && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, Number(delay)));
    }

    // Extract page metadata and contents
    const title = await page.title();
    const finalUrl = page.url();
    const html = await page.content();
    const body = await page.evaluate(() => document.body ? document.body.innerHTML : '');

    const elapsed = Date.now() - startTime;
    console.log(`[Scraper-Pod] Scrape complete in ${elapsed}ms. Title: "${title}". HTML Length: ${html.length} bytes.`);

    res.json({
      success: true,
      url,
      finalUrl,
      title,
      body,
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
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch (closeErr) {
        console.warn('[Scraper-Pod] Error closing browser instance:', closeErr.message);
      }
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [Scraper-Pod] Service A listening on http://0.0.0.0:${PORT}`);
  console.log(`   Health Check: GET http://localhost:${PORT}/health`);
  console.log(`   Scrape API:   POST http://localhost:${PORT}/scrape`);
});
