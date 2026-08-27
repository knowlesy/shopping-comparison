import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getUserSettings, getSafeUserSettings } from "../routes/settings.js";
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
