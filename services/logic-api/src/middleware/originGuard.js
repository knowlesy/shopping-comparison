/**
 * Browser Origin policy for state-changing requests.
 *
 * The problem this solves: every mutation was unauthenticated and unguarded, and
 * `POST /api/cache/clear` needs no body at all. Any page the household happened to visit
 * could clear the 72h price cache or rewrite matching preferences — a form post or a
 * `fetch` from `https://evil.example` was accepted exactly like one from the app. The
 * attacker never needs to read the response, so CORS does not prevent it; CORS governs
 * who may read a reply, not who may cause the side effect.
 *
 * The policy, stated rather than implied:
 *
 *   * Only mutating methods are guarded. GETs change nothing.
 *   * A request carrying an `Origin` must carry one this deployment recognises.
 *   * A request carrying no `Origin` is allowed. Browsers always send one on
 *     cross-site mutations, so this exempts curl, scripts and service clients rather
 *     than attackers. It is a deliberate LAN-boundary decision, and it is switchable:
 *     set REQUIRE_ORIGIN=true to reject bodiless/no-Origin mutations too.
 *   * A mutation whose body is a form content type is rejected. The API only ever
 *     consumes JSON, and those content types are precisely the ones a cross-site form
 *     can send without a preflight.
 *
 * What counts as a recognised Origin:
 *
 *   * CLIENT_ORIGIN, and anything in the comma-separated ALLOWED_ORIGINS.
 *   * Any loopback or private-network origin, unless ALLOW_PRIVATE_NETWORK_ORIGINS is
 *     set to "false". A homelab is reached by LAN address or hostname, and pinning the
 *     allowlist to localhost would break every household member not sitting at the
 *     server while giving no protection a private-range check does not already give.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Content types a cross-site HTML form can send without triggering a preflight.
const FORM_CONTENT_TYPES = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain'
];

function configuredOrigins() {
  const raw = [process.env.CLIENT_ORIGIN, process.env.ALLOWED_ORIGINS]
    .filter(Boolean)
    .join(',');
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function allowPrivateNetwork() {
  return process.env.ALLOW_PRIVATE_NETWORK_ORIGINS !== 'false';
}

/** Loopback, RFC1918, link-local, CGNAT, and the hostname forms a LAN actually uses. */
export function isPrivateNetworkHost(hostname) {
  if (!hostname) return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  // Hostnames a home network resolves itself, rather than anything on the internet.
  if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return false;

  if (a === 127) return true;                          // loopback
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 169 && b === 254) return true;             // link-local
  if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT
  return false;
}

/**
 * @param {string} origin - a browser Origin header value
 * @returns {boolean} whether this deployment recognises it
 */
export function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return false;

  const normalized = origin.trim().replace(/\/$/, '');
  if (configuredOrigins().includes(normalized)) return true;

  if (!allowPrivateNetwork()) return false;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return isPrivateNetworkHost(url.hostname);
  } catch {
    return false;
  }
}

/** The CORS `origin` option, so CORS and this guard cannot disagree. */
export function corsOriginDelegate(origin, callback) {
  // No Origin: same-origin navigation or a non-browser client. Nothing to decide.
  if (!origin) return callback(null, true);
  return callback(null, isAllowedOrigin(origin));
}

export function originGuard(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (FORM_CONTENT_TYPES.some((t) => contentType.startsWith(t))) {
    return res.status(415).json({
      error:
        'Unsupported Media Type: this API accepts application/json only. ' +
        'Form content types are refused because a cross-site form can send them without a preflight.'
    });
  }

  const origin = req.headers.origin;

  if (!origin) {
    if (process.env.REQUIRE_ORIGIN === 'true') {
      return res.status(403).json({
        error: 'Forbidden: an Origin header is required for state-changing requests (REQUIRE_ORIGIN=true).'
      });
    }
    // Documented exemption for CLI and service clients on the LAN boundary.
    return next();
  }

  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({
      error: `Forbidden: origin ${origin} is not allowed to make state-changing requests to this API.`
    });
  }

  return next();
}
