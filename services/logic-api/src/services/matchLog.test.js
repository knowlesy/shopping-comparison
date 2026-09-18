import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MatchLog } from "./matchLog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../../data");
const LOG_FILE = path.join(DATA_DIR, "match_decisions.jsonl");

describe("MatchLog Diagnostic Logger", () => {
  const originalEnv = process.env.ENABLE_MATCH_LOG;

  beforeEach(() => {
    process.env.ENABLE_MATCH_LOG = "true";
    if (fs.existsSync(LOG_FILE)) {
      try {
        fs.unlinkSync(LOG_FILE);
      } catch {}
    }
  });

  afterEach(() => {
    process.env.ENABLE_MATCH_LOG = originalEnv;
    if (fs.existsSync(LOG_FILE)) {
      try {
        fs.unlinkSync(LOG_FILE);
      } catch {}
    }
  });

  it("should be enabled via environment variable or preferences", () => {
    process.env.ENABLE_MATCH_LOG = "true";
    assert.equal(MatchLog.isEnabled({}), true);

    process.env.ENABLE_MATCH_LOG = "false";
    assert.equal(MatchLog.isEnabled({}), false);
    assert.equal(MatchLog.isEnabled({ enableMatchLog: true }), true);
  });

  it("should record a structured matching decision with runner-up explanation", () => {
    const item = {
      name: "Greek yogurt 0% 1 kg",
      rawText: "Greek yogurt 0% 1 kg",
      targetQuantity: 1000,
      unit: "g",
      category: "dairy"
    };

    const winner = {
      product: { id: "fage-0-1kg", title: "Fage Total 0% Fat Strained Yoghurt 1kg", price: 4.25, source: "direct" },
      matchScore: 92,
      totalPrice: 4.25
    };

    const runnerUp = {
      product: { id: "morrisons-greek-0", title: "Morrisons Greek Style Natural Yogurt 0% Fat 500g", price: 1.50, source: "direct" },
      score: 80,
      totalPrice: 3.00,
      penaltyReasons: ["pack size shortfall"]
    };

    const candidates = [
      { product: winner.product, score: 92 },
      { product: runnerUp.product, score: 80 }
    ];

    MatchLog.recordDecision({
      item,
      store: "morrisons",
      candidates,
      winner,
      runnerUp,
      aiDecision: { fired: false, reason: "confident_unambiguous_match", changed: false },
      preferences: { geminiApiKey: "SECRET_KEY_NEVER_LOG", aiAssistLevel: "balanced" }
    });

    assert.equal(fs.existsSync(LOG_FILE), true);
    const content = fs.readFileSync(LOG_FILE, "utf8").trim();
    assert.ok(content.length > 0);

    const record = JSON.parse(content);
    assert.equal(record.rawText, "Greek yogurt 0% 1 kg");
    assert.equal(record.store, "morrisons");
    assert.equal(record.winningProduct, "Fage Total 0% Fat Strained Yoghurt 1kg");
    assert.equal(record.winningScore, 92);
    assert.equal(record.runnerUpProduct, "Morrisons Greek Style Natural Yogurt 0% Fat 500g");
    assert.equal(record.runnerUpScore, 80);
    assert.ok(record.whyRunnerUpLost.includes("Score deficit"));
    assert.equal(record.aiDecision.fired, false);

    // Verify SECRET API KEY is never serialized or present in log
    assert.equal(content.includes("SECRET_KEY_NEVER_LOG"), false);
  });

  it("should truncate/rotate when log exceeds maxBytes limit", () => {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Write 10MB dummy data to simulate large log
    fs.writeFileSync(LOG_FILE, "X".repeat(10 * 1024 * 1024 + 10));

    MatchLog.recordDecision({
      item: { rawText: "Milk 2 pints" },
      store: "tesco",
      candidates: [],
      winner: null
    });

    const stats = fs.statSync(LOG_FILE);
    // Log must have rotated/truncated and be far below 10MB
    assert.ok(stats.size < 1024 * 1024);
  });
});
