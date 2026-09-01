/**
 * Fixture Sanitizer & Security Redactor
 * Scrubs all auth tokens, cookies, session identifiers, and PII from payloads before disk writes.
 */

export function scrubSessionData(obj) {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Redact cookies, tokens, and authorization strings
    let scrubbed = obj
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '[REDACTED_BEARER_TOKEN]')
      .replace(/(?:x-apikey|x-api-key|apiKey)[:=]\s*["']?[A-Za-z0-9\-._]+["']?/gi, 'x-apikey:[REDACTED]')
      .replace(/(?:set-cookie|cookie)[:=]\s*["']?[^"';\n]+["']?/gi, 'cookie:[REDACTED]');
    return scrubbed;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => scrubSessionData(item));
  }

  if (typeof obj === 'object') {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      // Drop sensitive auth keys completely
      if (
        lowerKey.includes('cookie') ||
        lowerKey.includes('set-cookie') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('session') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret')
      ) {
        // Redact / scrub
        continue;
      }
      cleaned[key] = scrubSessionData(value);
    }
    return cleaned;
  }

  return obj;
}
