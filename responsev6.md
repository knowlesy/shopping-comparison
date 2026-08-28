# Audit 6 Remediation Response (Steps 1–3)

This document provides a comprehensive technical record of the work performed for **Steps 1 through 3** of the Audit 6 remediation plan, defined in `context.md` and informed by the empirical evidence in `report6.md`.

---

## 🎯 Executive Summary

The Audit 5 remediation successfully eliminated cross-food garbage matches and established truthful data labeling. However, Audit 6 identified an overcorrection where valid single-noun items (such as bananas and lentils) were rejected, alternative terms were ignored, and deals toggling triggered redundant re-scrapes.

In this phase:
1. **Step 1 (`429ae05`)**: Recalibrated the matching scoring scale and floor (=25), normalized bunch-based produce packaging, fixed plural regex boundaries in pulse/species rules, and added positive regression tests.
2. **Step 2 (`e78b47b`)**: Integrated `item.alternateTerms` into keyword extraction, constrained stemming to whole-word boundaries in noun evidence checks, added explicit plum vs. plum tomato contamination rules, and implemented primary term preference on tie-breaks.
3. **Step 3 (`44005cb`)**: Unified `buildScrapeCacheKey` across deals and raw pricing modes, ensuring the scraper cache key is identical and that switching pricing preferences recomputes in-memory with zero network re-scraping.

All three steps pass their respective verification gates in `scripts/verify-audit6.js` and all **98/98 unit tests** in `npm test` are green with 0 ESLint errors.

---

## 🔍 Detailed Breakdown by Step

### Step 1: Scoring Recalibration & Single-Noun Recovery (CRITICAL)

#### 1. Root Cause Analysis
- **Bananas 10 rejection**: `tesco-bananas-bunch` in `data/catalog.json` defines `packageSize: 1, packageUnit: 'bunch'`. When requested as `Bananas 10`, `PackSelector` calculated `packs = 10`, triggering severe multi-pack penalties (`(packs - 1) * 15 = -135`), resulting in an aggregate score of `-20`, well below the accept floor of 25.
- **Red lentils 500 g rejection**: `Tesco Brown Lentils in Water 400g` was penalized by `pulseRules` (`-80`) because the regex `\blentil\b` failed to match plural `lentils`. With the baseline keyword score at 30, the score dropped to 9.

#### 2. Technical Remediation
- **Packaging Normalization** ([`packSelector.js`](services/logic-api/src/services/packSelector.js)): Added bunch produce normalization in `normalizeAmounts` (`prodAmount = 5` for bunch units matching item/piece requests).
- **Pack Distance Scoring** ([`penaltyRules.js`](services/logic-api/src/services/penaltyRules.js)): Reduced the distance scaling penalty factor and capped multi-pack penalties to `Math.min(25, (packs - 1) * 5)` so sensible pack differences do not veto valid candidates.
- **Regex Boundary Fix** ([`penaltyRules.js`](services/logic-api/src/services/penaltyRules.js)): Updated `pulseRules` and `speciesRules` to match singular and plural word boundaries (`\b${rule.mustContain}s?\b`).
- **Scoring Scale Specification** ([`penaltyRules.js`](services/logic-api/src/services/penaltyRules.js)): Documented the standard scale:
  - `-500`: Hard veto (category mismatch, contamination).
  - `0 to 24`: Marginal / heavily penalized items (rejected by floor).
  - `25`: Accept floor.
  - `50 to 79`: Solid match on primary food noun.
  - `80+`: Highly accurate multi-attribute match.
- **Positive Tests** ([`fuzzyMatcher.test.js`](services/logic-api/src/services/fuzzyMatcher.test.js)): Added tests verifying `Bananas 10`, `Red lentils 500 g`, and `Rolled porridge oats 1 kg` positively match while preserving negative guards.

#### 3. Verification & Commit
- **Gate Command**: `node scripts/verify-audit6.js --step 1`
- **Gate Output**:
  ```text
  — Step 1 —
    ✅ PASS  Bananas 10 matches a bananas product at every store
    ✅ PASS  Red lentils 500 g matches a lentils product (brown acceptable)
    ✅ PASS  Negative guard intact: Apples 250 g must NOT match spinach/other foods
  ```
- **Commit**: `429ae05` — `fix(matcher): recalibrate scoring scale and pack normalization for single-noun items`

---

### Step 2: Use `alternateTerms` & Tame the Stemmer

#### 1. Root Cause Analysis
- `IngredientParser` extracted alternate terms (e.g., `Plums or pears 600 g` -> `name: 'Plums', alternateTerms: ['pears']`), but `KeywordExtractor.extractKeywords` only read `baseItem`, `name`, and `brandPreference`. Consequently, candidates matching "pears" lacked noun evidence.
- Substring stem matching in `hasNounEvidence` allowed `plum` to match inside compound phrases like `plum tomatoes`.

#### 2. Technical Remediation
- **Alternate Terms Keyword Extraction** ([`keywordExtractor.js`](services/logic-api/src/services/keywordExtractor.js)): Included `item.alternateTerms` in token generation.
- **Word-Bounded Noun Evidence** ([`keywordExtractor.js`](services/logic-api/src/services/keywordExtractor.js)): Updated `hasNounEvidence` to evaluate both full keywords and stems with strict word boundaries (`\b${kw}\b` and `\b${stem}\b`).
- **Contamination Rules** ([`data/contamination-rules.json`](data/contamination-rules.json)): Added explicit rule prohibiting `plum tomatoes` when matching queries for fresh `plum`/`plums`.
- **Primary Term Tie-Break** ([`penaltyRules.js`](services/logic-api/src/services/penaltyRules.js)): Added `+10` bonus for candidates matching primary keywords over secondary alternate terms.
- **Unit Tests** ([`keywordExtractor.test.js`](services/logic-api/src/services/keywordExtractor.test.js)): Added test coverage for `alternateTerms` extraction and word-bounded stem matching.

#### 3. Verification & Commit
- **Gate Command**: `node scripts/verify-audit6.js --step 2`
- **Gate Output**:
  ```text
  — Step 2 —
    ✅ PASS  Plums or pears 600 g matches a pears product, never plum tomatoes
  ```
- **Commit**: `e78b47b` — `fix(matcher): include alternateTerms in keyword extraction and word-bound stem matching`

---

### Step 3: Unified Deals Scrape Caching

#### 1. Root Cause Analysis
- `candidatePipeline.js` previously constructed cache keys with a `:deals` or `:raw` suffix based on `preferences.includeDeals`.
- Because scraped products already include both `price` (base price) and `deal` (multibuy / clubcard / promotional metadata), splitting the cache key caused redundant scrape operations whenever the user toggled the deals preference.

#### 2. Technical Remediation
- **Unified Cache Key** ([`candidatePipeline.js`](services/logic-api/src/services/candidatePipeline.js)): Removed `includeDeals` parameter from `buildScrapeCacheKey` so keys format consistently as `cache:v2:scrape:${normalizedQuery}:${sortedStores}`.
- **Backward Compatibility** ([`candidatePipeline.js`](services/logic-api/src/services/candidatePipeline.js)): Added fallback check to read legacy `:deals` and `:raw` tagged keys if an un-migrated entry exists.
- **Unit Tests** ([`candidatePipeline.test.js`](services/logic-api/src/services/candidatePipeline.test.js)): Verified that `buildScrapeCacheKey` generates identical keys for both deals and raw modes.

#### 3. Verification & Commit
- **Gate Command**: `node scripts/verify-audit6.js --step 3`
- **Gate Output**:
  ```text
  — Step 3 —
    ✅ PASS  buildScrapeCacheKey identical for deals vs raw
  ```
- **Commit**: `44005cb` — `fix(pipeline): unify buildScrapeCacheKey across deals and raw pricing modes`

---

## 📊 Full Verification Gate Status (`npm run verify:audit`)

```text
> uk-supermarket-shopping-app@1.1.0 verify:audit
> node scripts/verify-audit6.js

— Step 1 —
  ✅ PASS  Bananas 10 matches a bananas product at every store
  ✅ PASS  Red lentils 500 g matches a lentils product (brown acceptable)
  ✅ PASS  Negative guard intact: Apples 250 g must NOT match spinach/other foods

— Step 2 —
  ✅ PASS  Plums or pears 600 g matches a pears product, never plum tomatoes

— Step 3 —
  ✅ PASS  buildScrapeCacheKey identical for deals vs raw

— Step 4 —
  ❌ FAIL  PriceCache exposes search status + promotion of expired unsaved searches
— Step 5 —
  ❌ FAIL  Stats API has per-item series route and client has a stats page
— Step 6 —
  ❌ FAIL  eval script has real fixtures with expected picks and an AI mode
— Step 7 —
  ❌ FAIL  matching-rules.json exists and penaltyRules.js is an engine, not a wall
— Step 8 —
  ❌ FAIL  Real 52-line list is a unit-test fixture (positive + negative outcomes)
— Step 9 —
  ❌ FAIL  Provenance + corpus tests exist: applied deal belongs to the matched product; real promo strings are unit-tested
  ✅ PASS  Invariant sweep: a deal never increases price, never NaN/negative, respects quantity thresholds
  ✅ PASS  Toggle: includeDeals=false yields raw price even when the product has a deal
```

---

## 📋 Summary of Modified Files

| File | Key Changes |
| :--- | :--- |
| [`services/logic-api/src/services/packSelector.js`](services/logic-api/src/services/packSelector.js) | Bunch produce normalization (`prodAmount = 5`). |
| [`services/logic-api/src/services/penaltyRules.js`](services/logic-api/src/services/penaltyRules.js) | Scoring scale calibration, plural regex matching, distance/pack rebalance, primary keyword bonus. |
| [`services/logic-api/src/services/fuzzyMatcher.test.js`](services/logic-api/src/services/fuzzyMatcher.test.js) | Positive regression test coverage (`Bananas 10`, `Red lentils 500 g`, `Rolled oats 1 kg`). |
| [`services/logic-api/src/services/keywordExtractor.js`](services/logic-api/src/services/keywordExtractor.js) | `alternateTerms` inclusion and word-bounded stem matching in `hasNounEvidence`. |
| [`services/logic-api/src/services/keywordExtractor.test.js`](services/logic-api/src/services/keywordExtractor.test.js) | Unit tests for alternate terms and word-bounded stem evidence. |
| [`data/contamination-rules.json`](data/contamination-rules.json) | Prohibit `plum tomatoes` when searching for `plum`/`plums`. |
| [`services/logic-api/src/services/candidatePipeline.js`](services/logic-api/src/services/candidatePipeline.js) | Unified `buildScrapeCacheKey` across pricing modes with legacy key compatibility. |
| [`services/logic-api/src/services/candidatePipeline.test.js`](services/logic-api/src/services/candidatePipeline.test.js) | Assert identical cache keys for deals vs. raw modes. |
