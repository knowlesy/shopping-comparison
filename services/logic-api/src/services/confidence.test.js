import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatConfidence, composeConfidence, CONFIDENCE_BY_SOURCE, DEFAULT_CONFIDENCE } from "./confidence.js";

describe("Confidence Metadata Helper", () => {
  it("should export CONFIDENCE_BY_SOURCE with ordering invariant direct > aggregator > catalog", () => {
    assert.ok(CONFIDENCE_BY_SOURCE, "CONFIDENCE_BY_SOURCE should exist");
    assert.equal(CONFIDENCE_BY_SOURCE.ai, 0.95);
    assert.equal(CONFIDENCE_BY_SOURCE.direct, 0.90);
    assert.equal(CONFIDENCE_BY_SOURCE.aggregator, 0.60);
    assert.equal(CONFIDENCE_BY_SOURCE.catalog, 0.40);
    assert.equal(DEFAULT_CONFIDENCE, CONFIDENCE_BY_SOURCE);

    // Ordering invariant
    assert.ok(CONFIDENCE_BY_SOURCE.ai > CONFIDENCE_BY_SOURCE.direct, "ai > direct");
    assert.ok(CONFIDENCE_BY_SOURCE.direct > CONFIDENCE_BY_SOURCE.aggregator, "direct > aggregator");
    assert.ok(CONFIDENCE_BY_SOURCE.aggregator > CONFIDENCE_BY_SOURCE.catalog, "aggregator > catalog");
  });

  it("should generate direct match confidence metadata with store name", () => {
    const res = formatConfidence(0.9, "direct", null, "tesco");
    assert.equal(res.confidenceScore, 0.9);
    assert.equal(res.confidenceSource, "direct");
    assert.equal(res.confidence, "90% verified (Tesco direct)");
  });

  it("should generate direct match confidence metadata without store name", () => {
    const res = formatConfidence(0.9, "direct");
    assert.equal(res.confidenceScore, 0.9);
    assert.equal(res.confidenceSource, "direct");
    assert.equal(res.confidence, "90% verified (direct)");
    assert.ok(!res.confidence.toLowerCase().includes("aggregator"), "should not mention aggregator");
  });

  it("should generate aggregator match confidence metadata at 0.60", () => {
    const res = formatConfidence(0.6, "aggregator");
    assert.equal(res.confidenceScore, 0.6);
    assert.equal(res.confidenceSource, "aggregator");
    assert.equal(res.confidence, "60% likely (Aggregator match)");
  });

  it("should generate catalog benchmark confidence metadata at 0.40", () => {
    const res = formatConfidence(0.4, "catalog");
    assert.equal(res.confidenceScore, 0.4);
    assert.equal(res.confidenceSource, "catalog");
    assert.equal(res.confidence, "40% verified (Catalog benchmark)");
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

  it("should default score from CONFIDENCE_BY_SOURCE when omitted", () => {
    const directRes = formatConfidence(null, "direct", null, "sainsburys");
    assert.equal(directRes.confidenceScore, 0.9);
    assert.equal(directRes.confidence, "90% verified (Sainsbury's direct)");

    const aggRes = formatConfidence(null, "aggregator");
    assert.equal(aggRes.confidenceScore, 0.6);
    assert.equal(aggRes.confidence, "60% likely (Aggregator match)");

    const catRes = formatConfidence(null, "catalog");
    assert.equal(catRes.confidenceScore, 0.4);
  });

  it("should compose two-axis confidence preserving data tier caps", () => {
    const direct1 = composeConfidence({ dataSource: "direct", matchConfidence: 1 });
    assert.equal(direct1.dataConfidence, 0.90);
    assert.equal(direct1.matchConfidence, 1);
    assert.equal(direct1.confidenceScore, 0.90);

    const directHalf = composeConfidence({ dataSource: "direct", matchConfidence: 0.5 });
    assert.equal(directHalf.confidenceScore, 0.45);
    assert.ok(directHalf.confidenceScore < direct1.confidenceScore);

    const catalog1 = composeConfidence({ dataSource: "catalog", matchConfidence: 1 });
    assert.equal(catalog1.dataConfidence, 0.40);
    assert.equal(catalog1.confidenceScore, 0.40);

    // Critical Step 16 invariant: AI matching on catalog data NEVER exceeds 0.40
    const aiOnCatalog = composeConfidence({ dataSource: "catalog", matchConfidence: 0.95, matchSource: "ai", store: "tesco" });
    assert.equal(aiOnCatalog.dataConfidence, 0.40);
    assert.equal(aiOnCatalog.confidenceScore, 0.38);
    assert.ok(aiOnCatalog.confidenceScore <= 0.40);
    assert.match(aiOnCatalog.confidence, /Tesco catalog/i);
    assert.match(aiOnCatalog.confidence, /Gemini AI Match/i);
  });
});
