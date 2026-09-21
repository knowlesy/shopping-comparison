# ShoppingWise architecture

ShoppingWise compares a household grocery list across configured UK supermarkets. Direct retailer
acquisition, Trolley fallback and catalog estimates are data sources for one server-owned matching
and calculation flow. They are not separate browser/server shopping engines.

## Services and ports

| Service | Responsibility | Access |
| --- | --- | --- |
| client | React UI; nginx proxy in containers | Compose 8080; Vite development 5173 |
| logic-api | Parsing, matching, comparisons, settings and persistence | 3001; Compose host binding is loopback only |
| store-fetcher | Python direct retailer adapters | Internal 3003 |
| scraper-pod | Browser-backed aggregator acquisition | Internal 3002 |

Compose nginx uses `logic-api:3001`; k3s sets `LOGIC_API_UPSTREAM=shoppingwise-logic-api:3001`.
Deployment manifests, digest selection and read-only checks are documented in [k3s guidance](../deploy/k3s/README.md).
The pinned base images predate these repairs; use the release overlay for newly built images.

## Comparison flow

1. The browser submits parsed items to `/api/compare` or `/api/compare/stream`.
2. Both handlers call `ComparisonEngine.runComparison`; SSE adds progress/cancellation hooks.
3. `candidatePipeline` checks each query/store cache, tries enabled direct adapters, and uses Trolley
   for stores still missing candidates. Catalog fallback is applied by the server matcher.
4. `PenaltyRules.checkEligibility` supplies hard vetoes shared by rules and AI selection. Optional AI
   review/escalation obeys the selection stage and basket budget; it does not replace price provenance.
5. `MatchResultBuilder` reconstructs product, packs, quantity, deals, lines and confidence together.
6. `BasketCalculator` derives store totals, coverage, delivery and single/two-store recommendations.

The authoritative acquisition cache uses `cache:v3:candidates:<query>:<store>`; legacy combined keys
are compatibility inputs. Successful candidates can live for 72 hours; transient failures use short
cooldowns. A cached product is not a fresh retailer observation. Unsupported/failed retailers can
still appear as explicitly estimated catalog data.

## Editing and ownership

Completed comparisons return an opaque `comparisonId`. `/api/compare/adjust` resolves products and
prices from the server-held snapshot, then uses the same builder/calculator. Caller prices and source
badges are not authoritative. Snapshot lifetime is six hours; older saved baskets require a new
comparison before editing. Unknown or expired snapshots fail without replacing the displayed basket.

Settings PUTs patch the saved settings, merging supported nested maps. Omitting comparison preferences
uses saved settings; a supplied comparison preference object is request-scoped, and omitted fields follow
service defaults rather than a guaranteed deep merge with saved settings.

Settings have one server schema and persistent non-secret allowlist in `settingsStore.js`, saved
atomically under `DATA_DIR`. Legacy browser settings are removed. A UI-entered Gemini key remains in
server memory only; persistent credentials belong in environment/Secrets. The browser awaits saves
and displays rejection. Its remaining local storage is for UI/list/history convenience, not matching
or settings authority. API outages show a retryable error rather than a new browser-calculated basket.

## Limits of the result

Savings require equal item coverage and price provenance on both sides; estimated comparisons are
indicative. Delivery uses configured constants, not live slot quotes or a travel-cost model. Routes
use at most two stores. Exact allocation is limited to 18 flexible choices per pair; larger cases use
bounded improvement. If a competitive route was approximate, `allocationIsExact:false` and explanatory
text disclose that the recommendation is not a proven optimum, even when a single store wins.

Matching evaluations retain known wrong picks and missed matches. A passing ratchet means no measured
regression, not universal correctness or measured AI uplift. See [verification](verification.md).
