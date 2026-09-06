import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AiEscalation } from "./aiEscalation.js";

const fakeClient = (responseJson, opts = {}) => ({
  models: {
    generateContent: async () => {
      if (opts.throw) throw new Error("simulated failure");
      return {
        text: typeof responseJson === "string" ? responseJson : JSON.stringify(responseJson),
        usageMetadata: { totalTokenCount: opts.tokens || 142 }
      };
    }
  }
});

const sampleProblemItems = () => [
  {
    query: "Wholemeal bread 1 loaf",
    item: { name: "Wholemeal bread", targetQuantity: 1, unit: "loaf" },
    candidates: [
      { product: { id: "c1", title: "Tesco White Toastie Bread 800g", price: 1.20, source: "direct", supermarket: "tesco" }, totalPrice: 1.20 },
      { product: { id: "c2", title: "Tesco Wholemeal Medium Sliced Bread 800g", price: 1.45, source: "direct", supermarket: "tesco" }, totalPrice: 1.45 }
    ],
    supermarket: "tesco"
  },
  {
    query: "Greek yogurt 0% 1 kg",
    item: { name: "Greek yogurt", targetQuantity: 1, unit: "kg", fatPercentage: 0 },
    candidates: [
      { product: { id: "y1", title: "Tesco Greek Style Yogurt 500g", price: 1.15, source: "direct", supermarket: "tesco" }, totalPrice: 2.30 }
    ],
    supermarket: "tesco"
  }
];

describe("AiEscalation Unit Suite", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-fake-key";
    AiEscalation.resetClientFactory();
  });

  afterEach(() => {
    AiEscalation.resetClientFactory();
  });

  it("should return empty results with 0 calls for empty batch", async () => {
    const res = await AiEscalation.escalateBatch([]);
    assert.equal(res.calls, 0);
    assert.equal(res.tokensUsed, 0);
    assert.deepEqual(res.results, []);
  });

  it("should send batched items to escalation model and map winning candidates", async () => {
    AiEscalation.setClientFactory(() =>
      fakeClient({
        decisions: [
          { batchIndex: 0, selectedIndex: 1, confidence: 0.96, reasoning: "Candidate 1 is genuine wholemeal bread" },
          { batchIndex: 1, selectedIndex: null, confidence: 0.95, reasoning: "No 0% fat option available" }
        ]
      }, { tokens: 350 })
    );

    const res = await AiEscalation.escalateBatch(sampleProblemItems());
    assert.equal(res.calls, 1);
    assert.equal(res.tokensUsed, 350);
    assert.equal(res.results.length, 2);

    // Item 0 resolved to wholemeal bread (c2)
    assert.equal(res.results[0].product.id, "c2");
    assert.equal(res.results[0].matchConfidence, 0.96);
    assert.equal(res.results[0].dataConfidence, 0.90); // direct source tier preserved
    assert.equal(res.results[0].matchSource, "ai-escalation");

    // Item 1 declined honestly
    assert.equal(res.results[1].product, null);
    assert.equal(res.results[1].matchSource, "ai-escalation");
    assert.match(res.results[1].reasoning, /No 0% fat/i);
  });

  it("should enforce batch bounding and not exceed maxItems limit", async () => {
    let receivedPayload = null;
    AiEscalation.setClientFactory(() => ({
      models: {
        generateContent: async ({ contents }) => {
          receivedPayload = contents;
          return {
            text: JSON.stringify({ decisions: [] }),
            usageMetadata: { totalTokenCount: 100 }
          };
        }
      }
    }));

    const items = Array.from({ length: 15 }, (_, i) => ({
      query: `Item ${i}`,
      item: { name: `Item ${i}` },
      candidates: []
    }));

    const res = await AiEscalation.escalateBatch(items, { maxItems: 3 });
    assert.equal(res.results.length, 3);
    assert.ok(receivedPayload);
  });

  it("should reject out-of-range candidate indices returned by model", async () => {
    AiEscalation.setClientFactory(() =>
      fakeClient({
        decisions: [
          { batchIndex: 0, selectedIndex: 99, confidence: 0.95, reasoning: "bogus index" }
        ]
      })
    );

    const res = await AiEscalation.escalateBatch([sampleProblemItems()[0]]);
    assert.equal(res.results[0].product, null);
    assert.match(res.results[0].reasoning, /out-of-range/i);
  });

  it("should enforce contamination rules on escalation picks", async () => {
    const hummusItem = [{
      query: "Hummus 200 g",
      item: { name: "Hummus", targetQuantity: 200, unit: "g" },
      candidates: [
        { product: { id: "h-chips", title: "Eat Real Hummus Chips 45g", price: 1.0, source: "direct" } }
      ]
    }];

    AiEscalation.setClientFactory(() =>
      fakeClient({
        decisions: [
          { batchIndex: 0, selectedIndex: 0, confidence: 0.98, reasoning: "looks tasty" }
        ]
      })
    );

    const res = await AiEscalation.escalateBatch(hummusItem);
    assert.equal(res.results[0].product, null);
    assert.match(res.results[0].reasoning, /contamination/i);
  });
});
