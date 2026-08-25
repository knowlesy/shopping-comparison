# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
