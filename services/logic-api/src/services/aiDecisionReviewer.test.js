import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AiDecisionReviewer } from "./aiDecisionReviewer.js";
import { PriceCache } from "./priceCache.js";
import { getUserSettings } from "../routes/settings.js";

describe("AiDecisionReviewer (Hybrid Fallback Gate)", () => {
  const dummyItem = { name: "beef mince", targetQuantity: 500, unit: "g" };

  it("should return null for empty candidates list", async () => {
    const res = await AiDecisionReviewer.reviewCandidates("beef mince", dummyItem, [], { aiMatchingEnabled: true });
    assert.equal(res, null);
  });

  it("should skip AI when aiMatchingEnabled is disabled (even with low score)", async () => {
    const candidates = [
      { score: 30, product: { id: "p1", title: "Beef Mince 500g", price: 2.50 } },
      { score: 25, product: { id: "p2", title: "Pork Mince 500g", price: 2.00 } }
    ];

    const res = await AiDecisionReviewer.reviewCandidates("beef mince", dummyItem, candidates, { aiMatchingEnabled: false });
    assert.equal(res.product.id, "p1");
    assert.equal(res.confidence, undefined);
  });

  it("should skip AI when top candidate is high confidence (score >= 65) with multiple candidates", async () => {
    const candidates = [
      { score: 85, product: { id: "p-best", title: "Organic Beef Mince 500g", price: 3.50 } },
      { score: 70, product: { id: "p-second", title: "Lean Beef Mince 500g", price: 3.20 } },
      { score: 40, product: { id: "p-third", title: "Beef Gravy", price: 1.00 } }
    ];

    const res = await AiDecisionReviewer.reviewCandidates("beef mince", dummyItem, candidates, { aiMatchingEnabled: true });
    // AI must NOT be called since score is 85 >= 65
    assert.equal(res.product.id, "p-best");
    assert.equal(res.score, 85);
  });

  it("should return cached AI decision when available in PriceCache", async () => {
    const internalSettings = getUserSettings();
    const prevKey = internalSettings.geminiApiKey;
    const prevEnabled = internalSettings.aiMatchingEnabled;
    internalSettings.geminiApiKey = "AIzaSyTestMockKey123";
    internalSettings.aiMatchingEnabled = true;

    try {
      const candidates = [
        { score: 45, product: { id: "p-target", title: "Tesco Lean Beef Mince 500g", price: 2.80, supermarket: "tesco" } },
        { score: 30, product: { id: "p-other", title: "Tesco Meatballs 400g", price: 2.50, supermarket: "tesco" } }
      ];

      PriceCache.set("ai-match:beef mince:500:g:tesco", {
        productId: "p-target",
        selectedIndex: 0,
        reasoning: "Matched by target weight 500g"
      });

      const res = await AiDecisionReviewer.reviewCandidates("beef mince", dummyItem, candidates, { aiMatchingEnabled: true });
      assert.equal(res.product.id, "p-target");
      assert.match(res.confidence, /Gemini AI Match - Cached/i);
      assert.equal(res.aiReasoning, "Matched by target weight 500g");
    } finally {
      internalSettings.geminiApiKey = prevKey;
      internalSettings.aiMatchingEnabled = prevEnabled;
    }
  });
});
