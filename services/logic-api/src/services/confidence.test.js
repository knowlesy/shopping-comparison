import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatConfidence } from "./confidence.js";

describe("Confidence Metadata Helper", () => {
  it("should generate aggregator match confidence metadata", () => {
    const res = formatConfidence(0.8, "aggregator");
    assert.equal(res.confidenceScore, 0.8);
    assert.equal(res.confidenceSource, "aggregator");
    assert.equal(res.confidence, "80% likely (Aggregator match)");
  });

  it("should generate AI cached match confidence metadata", () => {
    const res = formatConfidence(0.95, "ai-cached");
    assert.equal(res.confidenceScore, 0.95);
    assert.equal(res.confidenceSource, "ai-cached");
    assert.equal(res.confidence, "95% verified (Gemini AI Match - Cached)");
  });

  it("should generate AI live match confidence metadata", () => {
    const res = formatConfidence(0.95, "ai");
    assert.equal(res.confidenceScore, 0.95);
    assert.equal(res.confidenceSource, "ai");
    assert.equal(res.confidence, "95% verified (Gemini AI Match)");
  });

  it("should generate catalog benchmark confidence metadata", () => {
    const res = formatConfidence(1.0, "catalog");
    assert.equal(res.confidenceScore, 1.0);
    assert.equal(res.confidenceSource, "catalog");
    assert.equal(res.confidence, "100% verified (Catalog benchmark)");
  });
});
