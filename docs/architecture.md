# ShoppingWise UK System Architecture & Technical Specifications 📐

ShoppingWise UK is an agentic, high-performance grocery price comparison and basket optimization engine designed to evaluate product prices, package sizing, and healthier dietary alternatives across 7 major UK supermarkets: **ASDA**, **Tesco**, **Sainsbury's**, **Morrisons**, **Iceland**, **Aldi**, and **Lidl**.

---

## 1. High-Level System Architecture

```mermaid
graph TB
  subgraph "User Tier"
    Browser["React 18 + Vite + Tailwind Client (Port 5173)"]
  end

  subgraph "Microservices Stack (Docker Compose)"
    LogicAPI["Logic API Service (Express.js, Port 3001)"]
    ScraperPod["Scraper Pod Daemon (Playwright/Chromium, Port 3002)"]
    
    subgraph "Core Engines (services/logic-api)"
      CandidatePipe["Candidate Pipeline (services/candidatePipeline.js)"]
      FuzzyMatcher["Fuzzy Matcher (services/fuzzyMatcher.js)"]
      BasketCalc["Basket Calculator (services/basketCalculator.js)"]
      PriceCache["Price Cache (services/priceCache.js) - 72h TTL"]
    end
  end

  subgraph "Data Tier"
    CatalogJSON["data/catalog.json (Canonical 7-Store Catalog)"]
    RulesJSON["data/contamination-rules.json (Contamination Table)"]
  end

  subgraph "External Scrape Targets"
    SupermarketLive["Supermarket Live Search Targets"]
  end

  Browser -->|"POST /api/compare<br/>POST /api/compare/stream (SSE)"| LogicAPI
  LogicAPI --> CandidatePipe
  CandidatePipe --> PriceCache
  PriceCache -.->|"Cache Miss"| ScraperPod
  ScraperPod -->|"Headless Chromium Scrape"| SupermarketLive
  CandidatePipe --> CatalogJSON
  CandidatePipe --> RulesJSON
  LogicAPI --> FuzzyMatcher
  LogicAPI --> BasketCalc
  FuzzyMatcher --> RulesJSON
  FuzzyMatcher --> CatalogJSON
```

---

## 2. Component Pipeline & Data Flow

When a user submits a multi-item grocery list or searches for a single recipe ingredient, the request flows through the following pipeline:

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant Client as React Client (5173)
  participant API as Logic API (3001)
  participant Pipe as Candidate Pipeline
  participant Cache as Price Cache (72h)
  participant Scraper as Scraper Pod (3002)
  participant Matcher as Fuzzy Matcher
  participant Calc as Basket Calculator

  User->>Client: Input ingredient list (e.g. 900g 5% lean beef mince)
  Client->>API: POST /api/compare or POST /api/compare/stream
  API->>Pipe: getOrFetchCandidates(coreQuery, enabledStores)
  Pipe->>Cache: Check cache key (cache:v2:scrape:query:stores)
  alt Cache Hit
    Cache-->>Pipe: Return cached candidate products
  else Cache Miss
    Pipe->>Scraper: Bounded scrape request (x-scrape-token auth)
    Scraper-->>Pipe: Raw DOM / Parsed product candidates
    Pipe->>Cache: Store in persistent cache (72h TTL)
  end
  Pipe-->>API: Candidate products + source telemetry
  loop For each enabled Supermarket
    API->>Matcher: matchProduct(store, item, candidates, preferences)
    Matcher->>Matcher: Apply Contamination Rules & Pack Sizing
    Matcher-->>API: Optimal store match + alternatives
  end
  API->>Calc: computeComparison(items, storeMatchesMap, enabledStores)
  Calc->>Calc: Calculate store totals, delivery fees & split basket
  Calc-->>API: Full comparison matrix + split savings + metadata
  API-->>Client: JSON / SSE stream payload
  Client-->>User: Render real-time price & sizing matrix
```

---

## 3. Core Subsystems

### 3.1 Contamination Filter & Food Form Safety
To prevent cross-category contamination (e.g., Scotch eggs or mayonnaise matching fresh egg requests, or crisps matching fresh potatoes), matching is governed by a data-driven rules table in [`data/contamination-rules.json`](../data/contamination-rules.json):

- **Eggs**: Matches `egg`/`eggs`; strictly prohibits `scotch`, `mayo`, `mayonnaise`, `custard`, `creme egg`, `chocolate egg`, `noodles`, `sandwich filler`, `sweets`.
- **Potatoes**: Matches `potato`/`potatoes`; prohibits `crisps`, `chips`, `waffles`, `croquettes`, `potato salad in mayo`, `ready meal`, `snack`.
- **Milk**: Matches `milk`; prohibits `chocolate milk`, `milkshake`, `condensed`, `evaporated`, `powdered`, `flavoured`.
- **Greek Yogurt**: Matches `yogurt`/`yoghurt`/`greek`; prohibits `drink`, `corner`, `split pot`, `frubes`, `munch bunch`, `dessert`.
- **Raw Meat**: Matches raw cuts/mince; prohibits `canned`, `tinned`, `in gravy`, `pie filling`, `pet food`.
- **Garlic & Spinach**: Prohibits `garlic bread`/`baguettes` for fresh bulbs, and `pasta bake`/`pie` for fresh spinach leaves.

### 3.2 Closest-Pack Sizing Engine
The algorithm calculates:
$$\text{Packs Needed} = \left\lceil \frac{\text{Target Quantity}}{\text{Package Size}} \right\rceil$$
Unit prices (£/kg or £/L) are computed uniformly to allow accurate comparison between differing multi-pack formats and individual units.

### 3.3 Smart Split-Basket Optimization
Identifies the minimum-cost two-store combination when shopping across multiple supermarkets, accounting for minimum delivery thresholds and per-item lowest prices.
