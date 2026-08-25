import dotenv from 'dotenv';
dotenv.config();

const SCRAPER_URL = process.env.SCRAPER_SERVICE_URL || 'http://127.0.0.1:3002/scrape';

export class ScraperClient {
  /**
   * Request raw HTML from Service A (The Scraper Pod)
   * @param {string} url - Target website URL to scrape
   * @param {object} options - Optional waitForSelector, timeout, delay
   * @returns {Promise<{ html: string, body: string, title: string, finalUrl: string }>}
   */
  static async fetchHtml(url, options = {}) {
    console.log(`[Logic-API -> ScraperClient] Requesting scrape for: ${url}`);
    const startTime = Date.now();

    try {
      const response = await fetch(SCRAPER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-scrape-token': process.env.SCRAPE_TOKEN || 'trolleywise-internal-scrape-token'
        },
        body: JSON.stringify({
          url,
          waitForSelector: options.waitForSelector || '.product-item, body',
          timeout: options.timeout || 35000,
          delay: options.delay || 2500,
          turnstile: true
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Scraper service returned status ${response.status}`);
      }

      const elapsed = Date.now() - startTime;
      console.log(
        `[Logic-API -> ScraperClient] Successfully received ${data.length || data.html?.length || 0} bytes in ${elapsed}ms`
      );

      return {
        html: data.html || '',
        body: data.body || '',
        title: data.title || '',
        finalUrl: data.finalUrl || url
      };
    } catch (err) {
      console.error(`[Logic-API -> ScraperClient] Scraping failed for "${url}":`, err.message);
      throw new Error(`Failed to scrape live data from aggregator: ${err.message}`, { cause: err });
    }
  }
}
