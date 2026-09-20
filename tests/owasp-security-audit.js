/**
 * OWASP Top 10 Security Verification Suite
 *
 * Every check below exercises the application's own implementation. The previous
 * version defined its own copy of the SSRF allowlist and the token comparison, and
 * "verified" the security headers with `assert.ok(value.length > 0)` — it asserted that
 * a string it had just written was non-empty. It would have stayed green if every real
 * guard had been deleted.
 *
 * Covers:
 * 1. A01/A10: SSRF defence — the real scraper-pod guard
 * 2. A02: Timing-safe shared-secret comparison — the real comparison function
 * 3. A05: Effective response headers — real HTTP responses from the real app
 * 4. A01: Origin policy on mutations — the real middleware, over real HTTP
 * 5. A05: Production secret handling — the real resolver
 * 6. A07: Key redaction — the real safe-settings function
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The real implementations. If any of these move or are deleted, this suite fails to
// load rather than quietly passing.
import { ALLOWED_HOSTS, isAllowedUrl, verifySharedToken } from "../services/scraper-pod/src/security.js";
import { isAllowedOrigin, isPrivateNetworkHost } from "../services/logic-api/src/middleware/originGuard.js";
import {
  DEV_FETCHER_TOKEN,
  DEV_SCRAPE_TOKEN,
  resolveSharedSecret
} from "../services/logic-api/src/services/sharedSecret.js";

console.log("===============================================================================");
console.log("             OWASP TOP 10 APPLICATION SECURITY AUDIT SUITE                   ");
console.log("===============================================================================\n");

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${label}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${label}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. SSRF defence — the scraper-pod's own guard
// ---------------------------------------------------------------------------
console.log("▶ 1. Scraper-Pod SSRF guard (real implementation)...");

check("Allowlist is non-empty and frozen against mutation at runtime", () => {
  assert.ok(ALLOWED_HOSTS.length > 0);
  assert.ok(Object.isFrozen(ALLOWED_HOSTS));
});

const ssrfVectors = [
  { url: "https://www.trolley.co.uk/search/?q=milk", expected: true, reason: "allowlisted retailer" },
  { url: "https://groceries.asda.com/search/milk", expected: true, reason: "allowlisted retailer" },
  { url: "https://cdn.tesco.com/assets/x.js", expected: true, reason: "subdomain of an allowlisted host" },
  { url: "http://169.254.169.254/latest/meta-data/", expected: false, reason: "cloud metadata endpoint" },
  { url: "http://127.0.0.1:3001/api/settings", expected: false, reason: "loopback" },
  { url: "http://localhost:3002/scrape", expected: false, reason: "localhost by name" },
  { url: "http://10.0.0.5/admin", expected: false, reason: "RFC1918 10/8" },
  { url: "http://192.168.1.1/", expected: false, reason: "RFC1918 192.168/16" },
  { url: "http://172.16.0.1/", expected: false, reason: "RFC1918 172.16/12" },
  { url: "file:///etc/passwd", expected: false, reason: "non-http scheme" },
  { url: "gopher://evil.example/", expected: false, reason: "non-http scheme" },
  { url: "https://evil.example/", expected: false, reason: "host not on the allowlist" },
  { url: "https://tesco.com.evil.example/", expected: false, reason: "allowlisted host as a prefix of another domain" },
  { url: "not a url", expected: false, reason: "unparseable input" }
];

for (const vector of ssrfVectors) {
  check(`SSRF: ${vector.reason} -> ${vector.expected ? "ALLOW" : "BLOCK"}`, () => {
    assert.equal(isAllowedUrl(vector.url), vector.expected, vector.url);
  });
}

// ---------------------------------------------------------------------------
// 2. Timing-safe shared-secret comparison — the real function
// ---------------------------------------------------------------------------
console.log("\n▶ 2. Shared-secret comparison (real implementation)...");

check("Accepts the correct secret", () => {
  assert.equal(verifySharedToken("secret-token-12345", "secret-token-12345"), true);
});
check("Rejects an incorrect secret of the same length", () => {
  assert.equal(verifySharedToken("secret-token-12344", "secret-token-12345"), false);
});
check("Rejects a secret of a different length", () => {
  assert.equal(verifySharedToken("short", "secret-token-12345"), false);
});
check("Fails closed on missing, empty and non-string input", () => {
  assert.equal(verifySharedToken(null, "secret-token-12345"), false);
  assert.equal(verifySharedToken(undefined, "secret-token-12345"), false);
  assert.equal(verifySharedToken("", "secret-token-12345"), false);
  assert.equal(verifySharedToken(12345, "secret-token-12345"), false);
  assert.equal(verifySharedToken("secret-token-12345", ""), false);
});

// ---------------------------------------------------------------------------
// 3. Effective response headers — real responses from the real app
// ---------------------------------------------------------------------------
console.log("\n▶ 3. Defensive headers on real API responses...");

// A temporary DATA_DIR: importing the app loads the settings store, and this suite must
// never read or write the household's runtime directory.
const auditDataDir = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "owasp-audit-"));
process.env.DATA_DIR = auditDataDir;
process.env.SCRAPE_TOKEN = "audit-dummy-scrape-token-not-a-secret";
process.env.FETCHER_TOKEN = "audit-dummy-fetcher-token-not-a-secret";

const { createApp } = await import("../services/logic-api/src/app.js");
const { getSafeUserSettings, getUserSettings } = await import("../services/logic-api/src/routes/settings.js");

const app = createApp();
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const requiredHeaders = [
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "SAMEORIGIN"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()"],
  ["x-permitted-cross-domain-policies", "none"]
];

const healthRes = await fetch(`${baseUrl}/health`);
for (const [header, value] of requiredHeaders) {
  await checkAsync(`Response really carries ${header}: ${value}`, () => {
    assert.equal(healthRes.headers.get(header), value);
  });
}

await checkAsync("X-Powered-By is suppressed on a real response", () => {
  assert.equal(healthRes.headers.get("x-powered-by"), null);
});

// The client's nginx serves the SPA. nginx drops inherited add_header directives in any
// location that declares one of its own, so every such location must re-include the
// shared header file. This is a static check of the shipped config; the runtime proof is
// a container response, recorded separately in the task evidence.
console.log("\n▶ 3b. nginx config: every location that adds a header re-includes the shared set...");
const nginxTemplate = fs.readFileSync(
  path.resolve("client/nginx.conf.template"),
  "utf8"
);
const locationBlocks = nginxTemplate.split(/\blocation\s+/).slice(1);
check("nginx template declares at least one location", () => {
  assert.ok(locationBlocks.length > 0);
});
for (const block of locationBlocks) {
  const name = block.split(/\s/)[0];
  if (!/add_header/.test(block)) continue;
  check(`nginx location ${name} re-includes security-headers.conf alongside its own add_header`, () => {
    assert.match(
      block,
      /include\s+\/etc\/nginx\/security-headers\.conf;/,
      `location ${name} sets add_header without re-including the shared security headers, ` +
        "so nginx will drop every inherited security header on those responses"
    );
  });
}

// ---------------------------------------------------------------------------
// 4. Origin policy on mutations — the real middleware over real HTTP
// ---------------------------------------------------------------------------
console.log("\n▶ 4. Origin policy on state-changing requests (real middleware)...");

await checkAsync("A hostile origin cannot clear the price cache", async () => {
  const res = await fetch(`${baseUrl}/api/cache/clear`, {
    method: "POST",
    headers: { Origin: "https://evil.example" }
  });
  assert.equal(res.status, 403, "a cross-site origin must be refused");
});

await checkAsync("A hostile origin cannot change settings", async () => {
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: "PUT",
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    body: JSON.stringify({ preferOrganic: true })
  });
  assert.equal(res.status, 403);
});

await checkAsync("A cross-site form post is refused before it reaches a handler", async () => {
  const res = await fetch(`${baseUrl}/api/cache/clear`, {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "x=1"
  });
  assert.ok(res.status === 403 || res.status === 415, `expected 403 or 415, got ${res.status}`);
});

await checkAsync("A form content type is refused even from an allowed origin", async () => {
  const res = await fetch(`${baseUrl}/api/cache/clear`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:8080",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "x=1"
  });
  assert.equal(res.status, 415);
});

await checkAsync("The configured client origin is accepted", async () => {
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: "PUT",
    headers: { Origin: "http://localhost:8080", "Content-Type": "application/json" },
    body: JSON.stringify({ preferOrganic: false })
  });
  assert.equal(res.status, 200);
});

await checkAsync("A LAN origin is accepted, so the app works away from the server host", async () => {
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: "PUT",
    headers: { Origin: "http://192.168.1.50:8080", "Content-Type": "application/json" },
    body: JSON.stringify({ preferOrganic: false })
  });
  assert.equal(res.status, 200);
});

await checkAsync("A request with no Origin is allowed, the documented CLI exemption", async () => {
  const res = await fetch(`${baseUrl}/api/cache/clear`, { method: "POST" });
  assert.equal(res.status, 200);
});

await checkAsync("Reads are never blocked by the origin policy", async () => {
  const res = await fetch(`${baseUrl}/api/settings`, { headers: { Origin: "https://evil.example" } });
  assert.equal(res.status, 200);
});

check("The origin decision recognises private networks and rejects public ones", () => {
  assert.equal(isPrivateNetworkHost("192.168.1.10"), true);
  assert.equal(isPrivateNetworkHost("10.1.2.3"), true);
  assert.equal(isPrivateNetworkHost("172.20.0.9"), true);
  assert.equal(isPrivateNetworkHost("172.32.0.9"), false, "172.32 is outside RFC1918");
  assert.equal(isPrivateNetworkHost("8.8.8.8"), false);
  assert.equal(isAllowedOrigin("https://evil.example"), false);
  assert.equal(isAllowedOrigin("http://nas.local:8080"), true);
  assert.equal(isAllowedOrigin("null"), false);
  assert.equal(isAllowedOrigin(""), false);
});

// ---------------------------------------------------------------------------
// 5. Production secret handling — the real resolver
// ---------------------------------------------------------------------------
console.log("\n▶ 5. Production shared-secret handling (real implementation)...");

check("Development falls back to the published token for convenience", () => {
  const env = { NODE_ENV: "development" };
  assert.equal(
    resolveSharedSecret({ name: "SCRAPE_TOKEN", value: undefined, devDefault: DEV_SCRAPE_TOKEN, env }),
    DEV_SCRAPE_TOKEN
  );
});

check("Production refuses to run with a missing secret", () => {
  const env = { NODE_ENV: "production" };
  assert.throws(
    () => resolveSharedSecret({ name: "FETCHER_TOKEN", value: "", devDefault: DEV_FETCHER_TOKEN, env }),
    /not set/i
  );
});

check("Production refuses to run with the published development token", () => {
  const env = { NODE_ENV: "production" };
  assert.throws(
    () =>
      resolveSharedSecret({
        name: "SCRAPE_TOKEN",
        value: DEV_SCRAPE_TOKEN,
        devDefault: DEV_SCRAPE_TOKEN,
        env
      }),
    /development token/i
  );
});

check("Production accepts a real secret", () => {
  const env = { NODE_ENV: "production" };
  assert.equal(
    resolveSharedSecret({
      name: "SCRAPE_TOKEN",
      value: "a-real-generated-secret",
      devDefault: DEV_SCRAPE_TOKEN,
      env
    }),
    "a-real-generated-secret"
  );
});

// ---------------------------------------------------------------------------
// 6. Key redaction — the real safe-settings function
// ---------------------------------------------------------------------------
console.log("\n▶ 6. API key redaction (real implementation)...");

const auditKey = `AIzaFAKE-owasp-audit-${Date.now()}`;

await checkAsync("A stored key never appears in the settings response", async () => {
  getUserSettings().geminiApiKey = auditKey;
  const safe = getSafeUserSettings();
  assert.equal(safe.geminiApiKey, undefined);
  assert.ok(!JSON.stringify(safe).includes(auditKey), "the key must not appear anywhere in the safe payload");
  assert.equal(safe.hasGeminiKey, true);

  const res = await fetch(`${baseUrl}/api/settings`);
  const body = await res.text();
  assert.ok(!body.includes(auditKey), "the key must not appear in the HTTP response");
  getUserSettings().geminiApiKey = "";
});

// ---------------------------------------------------------------------------

await new Promise((resolve) => {
  server.closeAllConnections?.();
  server.close(resolve);
});
fs.rmSync(auditDataDir, { recursive: true, force: true });

const outDir = path.resolve("test-results");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
const reportPath = path.join(outDir, "owasp-security-report.json");
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      totalChecks: passed + failed,
      passed,
      failed,
      status: failed === 0 ? "PASSED" : "FAILED",
      note:
        "Every check exercises the application's own implementation. nginx runtime headers " +
        "are proved by a container response recorded in the task evidence, not by this suite."
    },
    null,
    2
  )
);

console.log("\n===============================================================================");
console.log(`📊 OWASP AUDIT RESULTS: ${passed}/${passed + failed} CHECKS PASSED`);
console.log("===============================================================================\n");

if (failed > 0) {
  process.exitCode = 1;
}
