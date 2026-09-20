#!/usr/bin/env node
/**
 * Browser automation startup smoke test.
 *
 * Proves that the scraper-pod's browser stack still launches, navigates and closes
 * after a dependency change — without contacting any retailer. It loads a `data:` URL,
 * so the check is self-contained and makes no network request at all.
 *
 * Intended to run inside the scraper-pod container, which provides Chromium and Xvfb:
 *   docker run --rm --entrypoint node <image> scripts/dev/browser-startup-smoke.mjs
 *
 * Exit code 0 means the stack initialised and produced a page; non-zero means the
 * dependency change broke browser startup.
 */

import { connect } from 'puppeteer-real-browser';

const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 120000);

function report(step, detail = '') {
  console.log(`[browser-smoke] ${step}${detail ? `: ${detail}` : ''}`);
}

const timer = setTimeout(() => {
  console.error(`[browser-smoke] FAILED: startup exceeded ${TIMEOUT_MS}ms`);
  process.exit(1);
}, TIMEOUT_MS);
timer.unref?.();

let browser;
let page;
try {
  report('puppeteer-real-browser version', process.env.npm_package_version || '(from lockfile)');
  report('executable path', process.env.PUPPETEER_EXECUTABLE_PATH || '(puppeteer default)');

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
    connectOption: { defaultViewport: { width: 1920, height: 1080 } }
  });

  browser = response.browser;
  report('browser connected', `connected=${browser.connected ?? 'n/a'}`);

  page = await response.page || (await browser.newPage());
  report('page created');

  // A data: URL — no DNS, no socket, no retailer.
  await page.goto('data:text/html,<html><head><title>smoke</title></head><body><h1 id="ok">ok</h1></body></html>', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  const title = await page.title();
  const text = await page.$eval('#ok', (el) => el.textContent);
  if (title !== 'smoke' || text !== 'ok') {
    throw new Error(`page did not render as expected (title=${title}, text=${text})`);
  }
  report('page rendered', `title="${title}"`);

  const version = await browser.version();
  report('browser version', version);

  console.log('[browser-smoke] PASS: browser automation starts, navigates and renders');
  process.exitCode = 0;
} catch (err) {
  console.error(`[browser-smoke] FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  try {
    if (page) await page.close();
  } catch { /* closing a dead page is not a failure */ }
  try {
    if (browser) await browser.close();
  } catch { /* same */ }
  // puppeteer can leave the event loop alive; the exit code above is the result.
  setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref?.();
}
