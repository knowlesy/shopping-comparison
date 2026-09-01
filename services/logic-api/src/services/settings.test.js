import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { settingsRouter, getUserSettings, getSafeUserSettings, KNOWN_DIRECT_STORES } from "../routes/settings.js";
import { AiDecisionReviewer } from "./aiDecisionReviewer.js";

describe("Settings Route Security & Key Redaction", () => {
  it("GET /api/settings should never leak geminiApiKey and should return hasGeminiKey boolean", () => {
    const internalSettings = getUserSettings();
    internalSettings.geminiApiKey = "AIzaSySecretTestKey123";

    // Safe settings returned to client
    const safeSettings = getSafeUserSettings();
    assert.equal(safeSettings.geminiApiKey, undefined, "geminiApiKey must NOT be present in safe settings");
    assert.equal(safeSettings.hasGeminiKey, true, "hasGeminiKey must be true when a key is saved");

    // Server-side internal singleton has the key
    assert.equal(internalSettings.geminiApiKey, "AIzaSySecretTestKey123", "Key must be stored internally server-side");

    // AiDecisionReviewer uses server-side key
    assert.equal(AiDecisionReviewer.isEnabled({ aiMatchingEnabled: true }), true);

    // Clear key
    internalSettings.geminiApiKey = "";
    const clearedSafe = getSafeUserSettings();
    assert.equal(clearedSafe.geminiApiKey, undefined);
    assert.equal(typeof clearedSafe.hasGeminiKey, "boolean");
  });
});

describe("Direct Scraper Settings (Step 2)", () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    app = express();
    app.use(express.json());
    app.use("/api/settings", settingsRouter);

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/settings`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("should expose directScrapersEnabled=true and all 5 directStoreAdapters=true in defaults", () => {
    const s = getSafeUserSettings();
    assert.equal(s.directScrapersEnabled, true, "directScrapersEnabled must default to true");
    assert.ok(s.directStoreAdapters, "directStoreAdapters must exist");
    assert.equal(typeof s.directStoreAdapters, "object");

    for (const store of KNOWN_DIRECT_STORES) {
      assert.equal(s.directStoreAdapters[store], true, `directStoreAdapters.${store} must default to true`);
    }
  });

  it("should survive round-trip through PUT to update directScrapersEnabled and directStoreAdapters", async () => {
    const res = await fetch(baseUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directScrapersEnabled: false,
        directStoreAdapters: {
          tesco: false,
          sainsburys: true
        }
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.directScrapersEnabled, false);
    assert.equal(body.directStoreAdapters.tesco, false);
    assert.equal(body.directStoreAdapters.sainsburys, true);
    assert.equal(body.directStoreAdapters.asda, true); // preserved

    // Reset back to defaults
    await fetch(baseUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directScrapersEnabled: true,
        directStoreAdapters: {
          tesco: true,
          sainsburys: true
        }
      })
    });
  });

  it("should reject unknown stores in directStoreAdapters with 400", async () => {
    const res = await fetch(baseUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directStoreAdapters: {
          unknown_supermarket: true
        }
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("Unknown store"));
  });

  it("should reject non-boolean directScrapersEnabled with 400", async () => {
    const res = await fetch(baseUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directScrapersEnabled: "yes"
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("boolean"));
  });

  it("should reject non-boolean directStoreAdapters values with 400", async () => {
    const res = await fetch(baseUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directStoreAdapters: {
          asda: "false"
        }
      })
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("boolean"));
  });

  it("master-off flag bypasses direct tier in settings", () => {
    const settings = getUserSettings();
    settings.directScrapersEnabled = false;

    const safe = getSafeUserSettings();
    assert.equal(safe.directScrapersEnabled, false);

    // Restore
    settings.directScrapersEnabled = true;
    assert.equal(getUserSettings().directScrapersEnabled, true);
  });
});
