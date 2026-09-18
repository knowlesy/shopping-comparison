import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../../data");
const LOG_FILE = path.join(DATA_DIR, "match_decisions.jsonl");
const MAX_BYTES = 10 * 1024 * 1024; // 10MB maxBytes limit

/**
 * Diagnostic Match Logger (Step 41)
 *
 * Records deterministic and AI matching decisions under DATA_DIR in JSONL format.
 * Opt-in only, bounded in size so it never exhausts k3s volume storage, and strictly
 * redacts all API credentials.
 */
export class MatchLog {
  /**
   * Check if diagnostic match logging is enabled.
   * @param {object} preferences
   * @returns {boolean}
   */
  static isEnabled(preferences = {}) {
    return (
      process.env.ENABLE_MATCH_LOG === "true" ||
      process.env.MATCH_LOG === "true" ||
      process.env.DIAGNOSTIC_LOG === "true" ||
      preferences.enableMatchLog === true ||
      preferences.matchLogging === true
    );
  }

  /**
   * Ensure destination directory exists and bounds log file size.
   * If log file exceeds MAX_BYTES, truncates / rotates to prevent filling volume.
   */
  static _prepareLogFile() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(LOG_FILE)) {
      try {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size >= MAX_BYTES) {
          // Bounded log size limit: rotate old log to .1.jsonl and start fresh
          const backupFile = path.join(DATA_DIR, "match_decisions.1.jsonl");
          try {
            if (fs.existsSync(backupFile)) {
              fs.unlinkSync(backupFile);
            }
            fs.renameSync(LOG_FILE, backupFile);
          } catch {
            // If rename fails, truncate the active log file directly
            fs.truncateSync(LOG_FILE, 0);
          }
        }
      } catch (err) {
        console.warn(`[MatchLog] Failed to rotate/truncate log file: ${err.message}`);
      }
    }
  }

  /**
   * Formats explanation of why runner-up candidate was not chosen.
   */
  static explainRunnerUpLoss(winner, runnerUp) {
    if (!runnerUp || !runnerUp.product) {
      return "No runner-up candidate met the minimum qualification threshold";
    }

    const winScore = winner?.matchScore ?? winner?.score ?? 0;
    const runScore = runnerUp?.matchScore ?? runnerUp?.score ?? 0;
    const scoreDiff = winScore - runScore;

    const reasons = [];
    if (scoreDiff > 0) {
      reasons.push(`Score deficit of ${scoreDiff} pts (${winScore} vs ${runScore})`);
    }

    if (winner?.totalPrice && runnerUp?.totalPrice && runnerUp.totalPrice > winner.totalPrice) {
      const priceDiff = (runnerUp.totalPrice - winner.totalPrice).toFixed(2);
      reasons.push(`Higher basket price (£${runnerUp.totalPrice.toFixed(2)} vs £${winner.totalPrice.toFixed(2)}, +£${priceDiff})`);
    }

    if (runnerUp.penaltyReasons && Array.isArray(runnerUp.penaltyReasons) && runnerUp.penaltyReasons.length > 0) {
      reasons.push(`Penalties applied: ${runnerUp.penaltyReasons.join(", ")}`);
    }

    if (runnerUp.veto) {
      reasons.push(`Veto triggered: ${runnerUp.veto}`);
    }

    return reasons.length > 0
      ? reasons.join("; ")
      : `Scored lower than winner (${winScore} vs ${runScore})`;
  }

  /**
   * Records a matching decision for a single store and ingredient.
   *
   * @param {object} params
   * @param {object|string} params.item - Shopping item or query string
   * @param {string} params.store - Supermarket identifier
   * @param {Array} params.candidates - Evaluated candidates
   * @param {object} params.winner - Winning match/candidate
   * @param {object} [params.runnerUp] - Second best match/candidate
   * @param {object} [params.aiDecision] - AI policy decision & outcome
   * @param {object} [params.preferences] - User preferences (redacted)
   */
  static recordDecision(params = {}) {
    const {
      item = {},
      store = "",
      candidates = [],
      winner = null,
      runnerUp = null,
      aiDecision = { fired: false, reason: "unambiguous_rules_match", changed: false },
      preferences = {}
    } = params;

    if (!this.isEnabled(preferences)) {
      return;
    }

    try {
      this._prepareLogFile();

      const rawText =
        typeof item === "string"
          ? item
          : item.rawText || item.name || item.query || "unknown";

      const supermarket = store || winner?.supermarket || "store";
      const winningScore = winner?.matchScore ?? winner?.score ?? 0;
      const runnerUpScore = runnerUp?.matchScore ?? runnerUp?.score ?? 0;
      const whyRunnerUpLost = this.explainRunnerUpLoss(winner, runnerUp);

      const candidateSummaries = (candidates || []).slice(0, 10).map((c) => {
        const prod = c.product || c;
        return {
          id: prod.id,
          title: prod.title,
          price: prod.price,
          unitPrice: prod.unitPrice,
          packageSize: prod.packageSize,
          packageUnit: prod.packageUnit,
          score: c.score ?? c.matchScore ?? 0,
          source: prod.source || "catalog"
        };
      });

      // Safe non-sensitive preference settings (NEVER serialize raw preferences or API keys)
      const safeConfig = {
        aiAssistLevel: preferences.aiAssistLevel || "off",
        includeDeals: preferences.includeDeals !== false,
        healthierDefault: preferences.healthierDefault === true
      };

      const record = {
        timestamp: new Date().toISOString(),
        rawText,
        query: rawText,
        item: typeof item === "object" ? {
          name: item.name,
          targetQuantity: item.targetQuantity,
          unit: item.unit,
          category: item.category
        } : { name: item },
        store: supermarket,
        supermarket,
        candidateCount: candidates?.length || 0,
        candidatesConsidered: candidateSummaries,
        winner: winner?.product ? {
          id: winner.product.id,
          title: winner.product.title,
          price: winner.product.price,
          totalPrice: winner.totalPrice,
          score: winningScore,
          source: winner.product.source || "catalog"
        } : null,
        winningProduct: winner?.product?.title || null,
        winningScore,
        runnerUp: runnerUp?.product ? {
          id: runnerUp.product.id,
          title: runnerUp.product.title,
          price: runnerUp.product.price,
          totalPrice: runnerUp.totalPrice,
          score: runnerUpScore,
          source: runnerUp.product.source || "catalog"
        } : null,
        runnerUpProduct: runnerUp?.product?.title || null,
        runnerUpScore,
        whyRunnerUpLost,
        rejectedRunnerUpReason: whyRunnerUpLost,
        veto: runnerUp?.veto || null,
        aiDecision: {
          fired: Boolean(aiDecision?.fired),
          reason: aiDecision?.reason || "rules_sufficient",
          changed: Boolean(aiDecision?.changed),
          aiReasoning: aiDecision?.aiReasoning || null
        },
        config: safeConfig
      };

      fs.appendFileSync(LOG_FILE, `${JSON.stringify(record)}\n`, "utf8");
    } catch (err) {
      console.warn(`[MatchLog] Failed to record decision: ${err.message}`);
    }
  }
}

export default MatchLog;
