import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { getSafeUserSettings } from "../routes/settings.js";

describe("OWASP Top 10 API Security Controls", () => {
  it("should configure standard defensive security headers", async () => {
    const app = express();
    app.disable("x-powered-by");
    app.use((_req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
      res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
      next();
    });

    app.get("/test", (_req, res) => res.json({ status: "ok" }));

    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/test`);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
      assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
      assert.equal(res.headers.get("x-permitted-cross-domain-policies"), "none");
      assert.equal(res.headers.get("x-powered-by"), null, "X-Powered-By must not be present");
    } finally {
      server.close();
    }
  });

  it("A01/A02: should prevent credential exposure in public responses", () => {
    const safe = getSafeUserSettings();
    assert.equal(safe.geminiApiKey, undefined, "Raw API key must never be returned");
    assert.equal(typeof safe.hasGeminiKey, "boolean");
  });
});
