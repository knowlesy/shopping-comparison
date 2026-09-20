/**
 * Inter-service shared secrets.
 *
 * Each service falls back to a development token that is published in this repository.
 * That is fine on a laptop and unacceptable in production, where it meant a deployment
 * that simply forgot to set the secret ran with a token anyone could read — silently,
 * because the fallback made everything work.
 *
 * `resolveSharedSecret` keeps the convenience in development and makes the same
 * omission fail loudly in production.
 */

export const DEV_SCRAPE_TOKEN = 'local-dev-scrape-token-shopping-app';
export const DEV_FETCHER_TOKEN = 'local-dev-fetcher-token-shopping-app';

/** Production unless explicitly told otherwise, so an unset NODE_ENV fails safe. */
export function isProduction(env = process.env) {
  return env.NODE_ENV === 'production';
}

/**
 * @param {object} options
 * @param {string} options.name        env var name, for the message
 * @param {string|undefined} options.value  the configured value
 * @param {string} options.devDefault  the published development fallback
 * @param {object} [options.env]
 * @returns {string} the secret to use
 * @throws {Error} in production when the secret is missing or is the published default
 */
export function resolveSharedSecret({ name, value, devDefault, env = process.env }) {
  const configured = typeof value === 'string' ? value.trim() : '';

  if (!isProduction(env)) {
    return configured || devDefault;
  }

  if (!configured) {
    throw new Error(
      `${name} is not set. Production requires a real shared secret; ` +
        'set it from a k3s Secret or the compose environment. ' +
        'To run with the published development token, set NODE_ENV to something other than "production".'
    );
  }

  if (configured === devDefault) {
    throw new Error(
      `${name} is set to the published development token. ` +
        'That value is in the public repository and must not be used in production. ' +
        'Generate one with: openssl rand -hex 24'
    );
  }

  return configured;
}
