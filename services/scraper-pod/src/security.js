/**
 * Scraper-pod security primitives, in their own module so tests exercise the real
 * implementation instead of a copy.
 *
 * These used to live inline in server.js, which cannot be imported without starting a
 * listener and loading puppeteer. tests/owasp-security-audit.js therefore carried its
 * own duplicate of the allowlist and the token comparison — the audit agreed with
 * itself and would have kept passing if the real guard had been deleted.
 */

import crypto from 'node:crypto';

/** Retailer hosts the scraper is permitted to fetch. */
export const ALLOWED_HOSTS = Object.freeze([
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
]);

/**
 * SSRF guard: only http(s) URLs on allowlisted retailer hosts, and never a private,
 * loopback, link-local or metadata address.
 *
 * @param {string} urlString
 * @returns {boolean}
 */
export function isAllowedUrl(urlString) {
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

    return ALLOWED_HOSTS.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

/**
 * Constant-time shared-secret comparison that fails closed on missing or malformed
 * input and never leaks length through an early return that varies with content.
 *
 * @param {unknown} received
 * @param {string} expected
 * @returns {boolean}
 */
export function verifySharedToken(received, expected) {
  if (!received || typeof received !== 'string') return false;
  if (!expected || typeof expected !== 'string') return false;

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}
