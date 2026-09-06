# ShoppingWise Project Roadmap 🛒

## Core Roadmap Items
- [ ] Automated basket composition / direct export to supermarket accounts (design completed in Step 11)
- [ ] Supermarket credential storage & authenticated sessions (design completed in Step 11)
- [ ] AI matching testing phase & fine-tuning

## Completed Milestones (v1.3.0)
- [x] Direct supermarket adapters with store-fetcher sidecar (Tesco, Sainsbury's, Morrisons reachable; Asda and Iceland honestly declared unreachable due to client-side hydration/Algolia; Aldi and Lidl declared unsupported with no UK online grocery platform)
- [x] Multi-supermarket comparison engine for 7 UK grocery chains
- [x] Multibuy & Deal Price Parsing ("3 for £2", "Buy 2 Get 1 Free", "Save £1 on 2", Clubcard/Nectar)
- [x] 72-Hour Search Pinning & Recent Searches History
- [x] Hybrid Matching with local Fuzzy Match + Gemini AI Fallback (gemini-2.5-flash)
- [x] Confidence Level Flag (Direct 0.90, Aggregator 0.60, Catalog 0.40 × Match Confidence)
- [x] Docker Image Update Notifier & Changelog Viewer
- [x] Scaffolding for user auth & supermarket account integration
