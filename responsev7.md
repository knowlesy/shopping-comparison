# Audit 6/7/8 Final Remediation Response (Steps 1 through 10)

This document records the engineering work performed across all rounds of the Audit 6, 7, and 8 remediation plan per `context.md`, `report7.md`, and `report8.md`.

---

## 🏆 Final Verification Status: ALL 21 GATES PASS (100% GREEN)

```text
> uk-supermarket-shopping-app@1.1.0 verify:audit
> node scripts/verify-audit6.js

— Step 1 —
  ✅ PASS  Bananas 10 matches a bananas product at every store
  ✅ PASS  Red lentils 500 g matches a lentils product (brown acceptable)
  ✅ PASS  Singular↔plural: Courgette 1 matches a Courgettes product (word-boundary fix must pluralize toward the title)
  ✅ PASS  Negative guard intact: Apples 250 g must NOT match spinach/other foods

— Step 2 —
  ✅ PASS  Plums or pears 600 g matches a pears product, never plum tomatoes

— Step 3 —
  ✅ PASS  buildScrapeCacheKey identical for deals vs raw

— Step 4 —
  ✅ PASS  Promotion replaces previous auto-promoted list, never pinned/saved ones
  ✅ PASS  PriceCache exposes search status + promotion of expired unsaved searches

— Step 5 —
  ✅ PASS  Stats API has per-item series route and client has a stats page
  ✅ PASS  recordSnapshot writes per-item×store rows and skips estimated matches

— Step 6 —
  ✅ PASS  eval script has real fixtures with expected picks and an AI mode
  ✅ PASS  In-app AI test endpoint + settings button

— Step 7 —
  ✅ PASS  matching-rules.json exists and penaltyRules.js is an engine, not a wall

— Step 8 —
  ✅ PASS  Real 52-line list is a unit-test fixture (positive + negative outcomes)
  ✅ PASS  recipes suite fails on 0 live hits without --catalog-mode; live-scrape proof script exists

— Step 9 —
  ✅ PASS  Provenance + corpus tests exist: applied deal belongs to the matched product; real promo strings are unit-tested
  ✅ PASS  Invariant sweep: a deal never increases price, never NaN/negative, respects quantity thresholds
  ✅ PASS  Toggle: includeDeals=false yields raw price even when the product has a deal

— Step 10 —
  ✅ PASS  Catalog carries 6+ dealed products across 3+ stores so deals run end-to-end
  ✅ PASS  No stale duplicate matching-rules.json in services dir
  ✅ PASS  Mega-suites report estimated-share/match-rate, not blanket 100% success

✅ ALL GATES PASS — Audit 6 complete.
```

---

## 📦 Commit History & Step Breakdown

### 1. Step 1 (Reopened — `1390c95`): Singular↔Plural Matcher & Semantic Unification
- **Change**: Added `KeywordExtractor.wordMatches(term, text)` with bidirectional whole-word matching (exact words, de-pluralized stems, and `-s`/`-es`/`-oes` pluralization).
- **Semantics**: Unified `matchCount` and primary-term bonuses in `PenaltyRules.scoreCandidate` using `KeywordExtractor.wordMatches`.
- **Species Rule**: Added species rule to prevent `sweet potato` queries from matching ordinary potatoes (`penalty: 150`).
- **Tests**: Verified `Courgette 1` positively matches `Courgettes`, while `Sweet potato 1` remains an honest no-match without catalog coverage.

### 2. Step 2 (`30835bb`): Alternate Terms Tie-Breaking
- **Change**: Extracted `alternateTerms` into secondary keywords and gave primary term a +10 bonus on tie-break.
- **Tests**: Verified `"Plums or pears 600 g"` matches Conference Pears and never plum tomatoes.

### 3. Step 3 (`2da3fe6`): Scrape Cache Key Deals Unification
- **Change**: Unified `buildScrapeCacheKey(query)` to remain independent of deal toggles.
- **Tests**: Verified cache key identity regardless of `includeDeals`.

### 4. Step 4 (`0145ff0`): Search Lifecycle & Auto-Promotion
- **Change**: Added `status: 'unsaved' | 'saved' | 'promoted'` to search entries in `priceCache.js`.
- **Lifecycle**: Implemented `promoteExpiredSearches()` during 72h cache sweeps to promote expiring unsaved searches.
- **Replacement Invariant**: Promoted searches replace previous auto-promoted items while pinned/saved searches are never overwritten.

### 5. Step 5 (`4d4b65d`): Per-Item Price Series & Frontend Stats Page
- **Change**: Extended `PriceHistory.recordSnapshot` to record daily per-item price rows per store (`itemPrices`/`itemRows`), strictly excluding estimated catalog items (`isEstimated: true`).
- **API**: Added `GET /api/stats/item/:itemKey` endpoint.
- **Frontend**: Built `StatsPage.tsx` with win rates, match provenance breakdown, and historical item series inspector, integrated into `Header.tsx` and `App.tsx`.

### 6. Step 6 (`0d890dc`): Real AI Matching Fixtures & In-App Test Route
- **Fixtures**: Created `tests/fixtures/ai-matching-fixtures.json` with 6 ambiguous fixtures drawn directly from the owner's real 52-line list (`report5.md §2`).
- **Harness**: Rebuilt `scripts/eval-ai-matching.js` to support `--rules` (offline deterministic mode, achieving 100% accuracy on fixtures) and live AI mode.
- **In-App**: Added `POST /api/settings/ai-test` and "Test AI matching" button with real-time pass/fail badge in `SettingsModal.tsx`.

### 7. Step 7 (`b4bd26e`): Data-Driven Matching Rules
- **Data File**: Created `data/matching-rules.json` with all cut lists, species rules, pulse rules, supplement terms, breaded terms, ready meal terms, and unit approximations.
- **Engine Refactor**: Refactored `services/logic-api/src/services/penaltyRules.js` to load `data/matching-rules.json` with multi-path resolution and eliminated hardcoded `.includes(` chains (0 remaining).

### 8. Step 8 (`2a9c985`): Reality Fixtures, Honest Recipe Suite & Live Scrape Proof Tool
- **Fixtures Suite**: Created `services/logic-api/src/services/realList.test.js` evaluating the owner's real 52-line list (`report5.md §2`), including sentinel lines `"Maris Piper potatoes 1.8"`, `"Tinned sardines in olive oil 2 x 120"`, and `"Reduced-salt stock cubes"`.
- **Honest Recipe Gate**: Updated `tests/verify-20-recipes.js` to fail if live API hits = 0 unless `--catalog-mode` is explicitly provided with a loud warning banner.
- **Proof Tool**: Created `scripts/dev/prove-live-scrape.js` for manual diagnostic verification of live scraper execution on real host machines.

### 9. Step 9 (`b5a015c`): Real Deal Strings Corpus & Provenance Leak Tests
- **Corpus**: Created `tests/fixtures/deal-strings.json` with real UK promotional structures ("3 for £2", "Any 2 for £5", "Buy 2 Get 1 Free", "Save £1 when you buy 2", "£1.50 Clubcard Price", "Nectar Price £2.00") and garbage edge cases.
- **Provenance Tests**: Added comprehensive test suites to `services/logic-api/src/services/dealCalculator.test.js` asserting that an applied deal belongs strictly to the matched product itself and never leaks from another candidate or store.

### 10. Step 10 (`241187a`): Final Cleanup (Catalog Deals, Rule Deduplication & Mega-Suite Honesty)
- **Catalog Deals**: Added 6+ dealed products in `data/catalog.json` spanning 5 supermarkets (Tesco, Sainsbury's, Asda, Morrisons, Iceland) and 4 deal structures (Clubcard, Nectar, multibuy, bundle discount, BOGOF). Added unit tests in `packSelector.test.js` asserting deal application and raw revert.
- **Duplicate Rules Cleanup**: Deleted stale duplicate `services/logic-api/src/services/matching-rules.json`.
- **Mega-Suite Honesty**: Updated `tests/food-form-and-variety-audit.js` and `tests/uncached-20-lists-30-items-audit.js` to report Data Mode, match rate, and estimated share disclosure instead of blanket unconditional success banners.

---

## 🧪 Verification & Health Metrics

- **Unit Tests (`npm test`)**: 110/110 tests passing (100% green).
- **Linter (`npm run lint`)**: 0 errors, 0 warnings.
- **Catalog Linter**: All 635 offline catalog products verified valid.
- **Full Verification Suite (`npm run verify:audit`)**: All 10 steps / 21 gates PASS.
