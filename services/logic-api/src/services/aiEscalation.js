import { GoogleGenAI } from "@google/genai";
import { composeConfidence } from "./confidence.js";
import { isContaminated } from "./contaminationRules.js";
import { getUserSettings } from "../routes/settings.js";

try {
  process.loadEnvFile();
} catch {}

/**
 * AI Escalation Service
 *
 * Collects items that finished unresolved or low-confidence and sends them
 * once, as a batch, to a stronger model (GEMINI_ESCALATION_MODEL) with their
 * full candidate lists.
 *
 * Hard invariants:
 * - Batched single call (never 1-by-1 retries).
 * - Bounded item cap / budget so a failing basket never creates an unbounded call.
 * - Raises MATCH confidence only; never fabricates or elevates the DATA tier.
 * - Fails closed to honest no-match if candidates cannot satisfy the item.
 */
export class AiEscalation {
  static _clientFactory = null;

  /**
   * Injection seam for offline testing
   */
  static setClientFactory(fn) {
    this._clientFactory = fn;
  }

  static resetClientFactory() {
    this._clientFactory = null;
  }

  /**
   * Escalate a batch of unresolved or low-confidence items to the escalation model.
   *
   * @param {Array<object>} problemItems - Array of { query, item, candidates, supermarket }
   * @param {object} options - Options including budget, maxItems, escalationModel, preferences
   * @returns {Promise<{ calls: number, tokensUsed: number, results: Array<object> }>}
   */
  static async escalateBatch(problemItems, options = {}) {
    if (!Array.isArray(problemItems) || problemItems.length === 0) {
      return { calls: 0, tokensUsed: 0, results: [] };
    }

    const settings = getUserSettings();
    const apiKey =
      settings.geminiApiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY;

    if (!apiKey) {
      return {
        calls: 0,
        tokensUsed: 0,
        results: problemItems.map((p) => ({
          query: p.query,
          product: null,
          reasoning: "AI escalation unavailable: no API key configured",
          escalated: false
        }))
      };
    }

    // Bound the batch size: basket where everything fails must not become unbounded
    const maxItems = Number(process.env.AI_ESCALATION_MAX_ITEMS) || options.maxItems || options.escalationLimit || 10;
    const batchToProcess = problemItems.slice(0, maxItems);

    // Escalation is one batched call per basket, so a 20-per-day model is
    // affordable here where it is not for per-item review.
    const escalationModel =
      process.env.GEMINI_ESCALATION_MODEL ||
      options.escalationModel ||
      "gemini-3.5-flash";

    // Prepare full candidate list for each item in the batch
    const batchPayload = batchToProcess.map((p, bIdx) => {
      const cands = (p.candidates || []).map((c, cIdx) => {
        const prod = c.product || c;
        return {
          candidateIndex: cIdx,
          id: prod.id,
          title: prod.title,
          brand: prod.brand,
          price: prod.price,
          packageSize: prod.packageSize,
          packageUnit: prod.packageUnit,
          unitPrice: prod.unitPrice,
          unitPriceMeasure: prod.unitPriceMeasure,
          deal: prod.deal?.rawText || prod.deal?.description || null,
          packsNeeded: c.packs || 1,
          totalPrice: c.totalPrice || prod.price
        };
      });

      return {
        batchIndex: bIdx,
        query: p.query || p.item?.rawText || p.item?.name,
        targetQuantity: p.item?.targetQuantity || 1,
        unit: p.item?.unit || "items",
        dietary: p.item?.isHealthierPreferred ? "Healthier/Lean" : "Standard",
        fatPercentage: p.item?.fatPercentage ?? "any",
        supermarket: p.supermarket || "store",
        candidateCount: cands.length,
        candidates: cands
      };
    });

    const prompt = `You are a Senior UK Supermarket Pricing Expert.
The following grocery shopping items failed initial automated matching or had low confidence.
For each item in this batch, review its FULL candidate list and select the single best, cheapest genuine match by weight and dietary equivalence. Account for any active multibuy deals.

Selection Rules:
1. COST BEATS EXACT SIZE: When no brand is requested, a larger pack that covers the target quantity at a lower total cost beats an exact size match. Never pick an expensive premium brand solely because its package size matches the target number.
2. WHEN TO DECLINE: Return selectedIndex as null ONLY when no candidate genuinely satisfies the request (e.g. no wholemeal bread, no plain sultanas among scones/cereals, explicit dietary requirement unsatisfied). Do NOT decline merely because no pack matches the requested size exactly; buy the closest sufficient genuine product.

Batch Items:
${JSON.stringify(batchPayload, null, 2)}

Respond with JSON only in this exact format:
{
  "decisions": [
    {
      "batchIndex": 0,
      "selectedIndex": 0,
      "confidence": 0.95,
      "reasoning": "Reason for selection or decline"
    }
  ]
}`;

    let response;
    try {
      const ai = this._clientFactory
        ? this._clientFactory({ apiKey, model: escalationModel })
        : new GoogleGenAI({ apiKey });

      const timeoutMs = 25000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`AI escalation review timed out (${timeoutMs}ms)`)), timeoutMs)
      );

      const requestPromise = ai.models.generateContent({
        model: escalationModel,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });

      response = await Promise.race([requestPromise, timeoutPromise]);
    } catch (err) {
      console.warn(`[AI-Escalation] Batch call failed: ${err.message}`);
      return {
        calls: 1,
        tokensUsed: 0,
        results: batchToProcess.map((p) => ({
          query: p.query,
          product: null,
          reasoning: `Escalation failed closed: ${err.message}`,
          escalated: false
        }))
      };
    }

    const tokensUsed = response?.usageMetadata?.totalTokenCount || 0;
    const rawText = response.text ? response.text.trim() : "";

    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {}
      }
    }

    const decisionsList = parsed?.decisions || (Array.isArray(parsed) ? parsed : []);
    const decisionsMap = new Map();
    decisionsList.forEach((d) => {
      if (typeof d.batchIndex === "number") {
        decisionsMap.set(d.batchIndex, d);
      }
    });

    const results = batchToProcess.map((p, bIdx) => {
      const dec = decisionsMap.get(bIdx);
      const cands = p.candidates || [];

      if (!dec || dec.selectedIndex === null || dec.selectedIndex === undefined) {
        return {
          query: p.query,
          product: null,
          packsNeeded: 1,
          totalQuantity: 0,
          totalPrice: 0,
          matchConfidence: 0.95,
          matchSource: "ai-escalation",
          reasoning: dec?.reasoning || "Model declined all candidates: honest no match",
          escalated: true
        };
      }

      const idx = Number(dec.selectedIndex);
      if (isNaN(idx) || idx < 0 || idx >= cands.length) {
        return {
          query: p.query,
          product: null,
          packsNeeded: 1,
          totalQuantity: 0,
          totalPrice: 0,
          matchConfidence: 0.95,
          matchSource: "ai-escalation",
          reasoning: "Out-of-range candidate index returned by escalation model; rejected",
          escalated: true
        };
      }

      const chosen = cands[idx];
      const prod = chosen.product || chosen;

      // Re-apply contamination guard
      const itemText = `${p.item?.name || ""} ${p.query || ""}`.toLowerCase();
      const prodTitle = (prod.title || "").toLowerCase();
      if (isContaminated(itemText, prodTitle)) {
        return {
          query: p.query,
          product: null,
          packsNeeded: 1,
          totalQuantity: 0,
          totalPrice: 0,
          matchConfidence: 0.95,
          matchSource: "ai-escalation",
          reasoning: `Contamination rule vetoed selection: "${prod.title}"`,
          escalated: true
        };
      }

      // Step 16 rule: Elevate MATCH confidence only; DATA tier is determined by product source
      const prodSource = prod.source || "catalog";
      const conf = composeConfidence({
        dataSource: prodSource,
        matchConfidence: Math.min(Math.max(Number(dec.confidence) || 0.9, 0.5), 0.99),
        matchSource: "ai-escalation",
        store: p.supermarket || prod.supermarket || "store"
      });

      return {
        ...chosen,
        ...conf,
        product: prod,
        packsNeeded: chosen.packs || 1,
        totalQuantity: chosen.totalQty || chosen.packageSize || 1,
        totalPrice: chosen.totalPrice || prod.price || 0,
        reasoning: dec?.reasoning || '',
        aiReasoning: dec?.reasoning || '',
        escalated: true
      };
    });

    return {
      calls: 1,
      tokensUsed,
      results
    };
  }
}
