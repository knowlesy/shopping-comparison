# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-08-28

### Added
- **ShoppingWise Rebrand & BSL 1.1 Licensing**: Rebranded application to ShoppingWise UK and adopted the Business Source License 1.1 (BSL 1.1) granting free personal/home use while reserving commercial and rebranding rights to the author.
- **Automated Semantic Release & Container Versioning**: Pipeline automatically derives SemVer version from Conventional Commits, tags releases, and tags container images with release versions.
- **Data-Driven Matching Rules Engine (`data/matching-rules.json`)**: Replaced hardcoded logic checks with an external JSON rules matrix for food species, packaging forms, and primary term bonuses.
- **Full Multibuy & Loyalty Card Pricing Invariants**: Verified 4 deal types (Clubcard, Nectar, multibuy fixed, bundle discounts) across 5 major UK supermarkets in offline benchmark catalog and deal calculator engine.
- **Per-Item 90-Day Price Series Tracking & Stats UI**: Added per-item daily price history (strictly omitting estimated catalog items), `/api/stats/item/:itemKey` series endpoint, and dedicated frontend Stats view.
- **About & Container Build Version in Settings**: Settings modal now displays application release version, container image build tags, runtime status, and a live GitHub release update checker.
- **Mermaid Architecture & User Workflow Docs**: Added comprehensive user journey and CI/CD workflow diagrams in `docs/user-journey.md` and `docs/workflows.md`.
- **CI/CD Concurrency Optimization & Ephemeral OWASP Audits**: Fast ~35s verification builds, automatic cancellation of superseded commits, and zero-artifact security audits.

## [1.1.0] - 2026-08-27

### Added
- **Multibuy & Deal Pricing Engine**: Full promotional deal parser and calculation engine supporting fixed multibuy ("3 for £2"), BOGOF / Buy X Get Y Free ("Buy 2 Get 1 Free"), bundle savings ("Save £1 on 2"), and loyalty member card pricing (Clubcard, Nectar, Morrisons More).
- **Strict Deal Test Suite**: Dedicated automated fixture verification suite `test_deals.js` verifying edge quantities (under-quantity, exact quantity, remainder quantity, multi-bundles).
- **Confidence Level Metric**: Added `confidence` field to all product and match results (defaulting to `"80% likely (Aggregator match)"` for aggregator data).
- **72-Hour Search Pinning & Recent Searches History**: Persistent 72-hour search history with search pinning, allowing shoppers to restore or pin recent searches after closing tabs. Added `enablePastSearches` toggle in Settings for testing.
- **Hybrid Matching Engine (Fuzzy + Gemini 2.5 Flash Fallback)**: Local high-speed deterministic fuzzy matching with an optional Gemini 2.5 Flash fallback for ambiguous or low-confidence matches. Results cached in 72h price cache for token minimisation. Configurable via UI settings or container environment variable `ENABLE_GEMINI_MATCHING=true`.
- **Matching Benchmark**: Benchmark script `compare_matching.js` evaluating 10 sample UK grocery items across all 7 supermarkets.
- **Scaffolded Auth & Supermarket Login Routes**: Added stubbed authentication and supermarket loyalty/account connection endpoints in `/api/auth`, strictly disabled by default (`ENABLE_AUTH = false`).
- **24-Hour Docker Image Update Notifier & Changelog Viewer**: Automatic 24-hour update checker with top notification banner and modal viewing the changelog.
- **Project Roadmap**: Added `TODO.md` outlining direct scraping, automated basket composition, and credential storage.

## [1.0.0] - 2026-08-25

### Added
- Multi-supermarket comparison engine supporting 7 UK grocery chains (ASDA, Tesco, Sainsbury's, Morrisons, Iceland, Aldi, Lidl).
- Smart NLP ingredient parser extracting units, compound multi-packs ($3 \times 400g$), and dietary tags ($5\%$ lean, $0\%$ Greek yogurt, wholewheat, free range, organic).
- Closest-pack sizing configuration with true unit pricing calculation (£/kg, £/L).
- Interactive "Swap Item" replacement picker with real-time basket recalculation.
- Smart split-basket optimizer identifying maximum two-store combined savings.
- Standalone Quick Price Check tool for instant single-item lookups across all 7 supermarkets.
- Past shopping trips archive with historical spending trends, total savings, and supermarket win leaderboard.
- Data-driven food form contamination filtering table in `data/contamination-rules.json`.
- Persistent 72-hour price caching with automatic disk persistence and scrape candidate telemetry.
- Comprehensive 39-test unit test suite (`node:test`) and automated 20-recipe verification suite.
- GitHub Actions CI workflow for automated linting, unit tests, and production build verification.
- System architecture documentation with Mermaid diagrams in `docs/architecture.md`.

### Changed
- Refactored `logic-api` into modular Express routers (`parse`, `compare`, `alternatives`, `settings`, `history`, `favorites`, `ideas`, `cache`).
- Extracted shared candidate pipeline module `candidatePipeline.js` shared across compare, stream, and alternatives.
- Consolidated catalog data into canonical `data/catalog.json`.
- Streamlined Docker build contexts and added root `.dockerignore`.

### Security
- Locked down `scraper-pod` behind internal Docker bridge network (unpublished port 3002).
- Enforced strict fail-closed `x-scrape-token` header authentication on internal scraping endpoints.
- Restricted `logic-api` CORS to configured `CLIENT_ORIGIN`.
- Added `.github/SECURITY.md` vulnerability reporting guidelines.
