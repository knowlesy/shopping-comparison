# Supermarket Direct Adapter Architecture & Authentication Design

> **Notice: Architectural Design Document Only**
> This document specifies the future design for authenticated retailer sessions and basket creation.
> As mandated by project safety and anti-bot policies, **none of the authenticated or basket-writing features described herein are implemented in executable code**.

---

## 1. Architecture as Built

The ShoppingWise scraping subsystem operates as a multi-tier data pipeline designed to deliver high-trust UK supermarket pricing without brittle browser automation or vendor lock-in.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Node candidatePipeline                        │
├────────────────────────────────────────────────────────────────────────┤
│ 1. 72h PriceCache (LRU + Disk Persistence, TTL 72h)                    │
│ 2. Tier 1: Direct Store Adapters (Python Sidecar via curl_cffi TLS)   │
│ 3. Tier 2: Aggregator Scraper (trolley.co.uk fallback via scraper-pod) │
│ 4. Tier 3: Verified Offline Catalog Benchmarks (Labelled Estimated)    │
└────────────────────────────────────────────────────────────────────────┘
```

### Per-Store Adapter Summary & Real-World Reality

1. **Sainsbury's (`sainsburys.py`) — Reachable (24 products)**
   - **Protocol**: Direct REST via Groceries Online API (`/groceries-api/gol-services/product/v1/product`).
   - **Capabilities**: Full structured JSON, unit prices, Nectar member pricing, availability flags, and EAN barcode mapping.
   - **Fragilities**: Requires specific HTTP header ordering (`User-Agent`, `Accept`, `Accept-Language`, `Host`).

2. **Tesco (`tesco.py`) — Reachable (21 products)**
   - **Protocol**: GraphQL Gateway (`xapi.tesco.com/graphql`) and dehydrated Apollo Client SSR state from web search.
   - **Capabilities**: Clubcard pricing, unit pricing, package sizing, stock state.
   - **Fragilities**: Public API keys rotate across major Tesco web releases; Apollo cache extraction from search HTML SSR provides durable resilience against key deprecation.

3. **Morrisons (`morrisons.py`) — Reachable (50 products)**
   - **Protocol**: Server-rendered `window.__INITIAL_STATE__` parsing via `https://groceries.morrisons.com/search?entry=...`.
   - **Capabilities**: 50 product entities per search, unit pricing, promotional tags, brand tagging.
   - **Fragilities**: Large SSR payload (>1MB); requires streaming JSON parser (`json.JSONDecoder().raw_decode`).

4. **Asda (`asda.py`) — Unreachable (Stateless HTTP: 0 products)**
   - **Status**: Direct stateless HTTP returns a 290KB client-side SPA shell without embedded product data.
   - **Camoufox Tier 2 Verification**: Browser rendering executes Salesforce Commerce Cloud client hydration and discovers 12 product links. However, full headless execution is out of scope for lightweight sidecar search latency (<500ms).
   - **Pipeline Behavior**: Falls through to Trolley aggregator or verified catalog benchmarks.

5. **Iceland (`iceland.py`) — Unreachable (Stateless HTTP: 0 products)**
   - **Status**: Mobify PWA shell returns HTTP 200 but initial `productsById` is unpopulated.
   - **Camoufox Tier 2 Verification**: Client-side Algolia search hydrations render 36 product links in browser DOM.
   - **Pipeline Behavior**: Falls through to Trolley aggregator or verified catalog benchmarks.

6. **Aldi & Lidl — Unsupported**
   - Both grocers have discontinued UK direct online grocery delivery (Aldi Click & Collect discontinued; Lidl operates physical in-store only). Labelled as estimated catalog data.

---

## 2. Authenticated Sessions: The Split-Plane Model

To access personalized loyalty card pricing (e.g., personalized Clubcard coupons, Nectar Prices requiring login) or create store baskets, an authenticated session architecture must decouple control from execution.

### Control Plane vs. Data Plane

```
  ┌─────────────────────────────────────────────────────────────┐
  │                 Control Plane (Camoufox/Browser)            │
  │  - Interactive User Login (MFA, Captcha, Consent Prompts)   │
  │  - Captures Session Tokens, Cookies & CSRF Nonces           │
  │  - Performs Token Rotation & Refresh Checks                 │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ Exports Encrypted State
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │              Secure Token Store (Encrypted at Rest)         │
  │  - AES-256-GCM / OS Keychain                                │
  │  - Never logs credentials or plaintext tokens               │
  │  - Strict TTL Expiry & Explicit Revocation                  │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ Loads Scrubbed Session
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                 Data Plane (Python Sidecar / curl_cffi)      │
  │  - Lightweight HTTP GET/POST with harvested session cookies │
  │  - High-throughput, sub-second latency                      │
  │  - Drops immediately to unauthenticated on HTTP 401/403     │
  └─────────────────────────────────────────────────────────────┘
```

1. **Control Plane (Interactive Harvest)**:
   - Full browser (Camoufox) is launched only when the user explicitly requests session connection.
   - The user completes login, handles multi-factor authentication (MFA/SMS), and solves any interactive challenge.
   - Upon successful login, the control plane harvests cookie jars (`Set-Cookie`), bearer tokens, and CSRF tokens, then closes the browser.

2. **Data Plane (Stateless High-Speed Execution)**:
   - The sidecar attaches harvested cookies and authorization headers to fast `curl_cffi` HTTP requests.
   - No browser runs during standard recipe/list comparison searches.

### Credential & Token Storage Lifecycle

- **Encryption at Rest**: Any stored session credentials or bearer tokens must be encrypted using `AES-256-GCM` with a key stored in the host system keychain (e.g., macOS Keychain, Linux Secret Service) or an injected master key (`SESSION_SECRET_KEY`).
- **No Plaintext Logging**: Logging interceptors must redact `Cookie`, `Authorization`, `X-CSRF-Token`, and `Set-Cookie` headers.
- **Token Rotation & Expiry**:
  - Retailer session tokens expire within 15–60 minutes unless refreshed.
  - The control plane maintains a `refresh_token` flow where supported, or alerts the user when session re-authentication is required.
- **Explicit Revocation (`logout`)**:
  - The Settings UI must provide an explicit **"Disconnect Store Account"** button per retailer.
  - Disconnection sends an explicit revocation/logout request to the retailer's auth endpoint and wipes the encrypted token file from disk immediately.

---

## 3. Remote Basket Creation ("Add to Basket")

A frequent feature request is one-click synchronization of the optimized shopping list into a retailer basket.

### Requirements & Mechanics
1. **API Endpoints**:
   - Tesco: GraphQL mutation `addToBasket(items: [{productId, quantity}])`.
   - Sainsbury's: `POST /api/v1/basket/item` with CSRF header and valid session cookie.
2. **Item Mapping**:
   - Matches must provide the verified retailer SKU/ID. Loose title search matches must never be sent to basket creation without explicit user confirmation.
3. **Safety Boundaries (Strict Invariants)**:
   - **Per-Action Confirmation**: Basket creation must require explicit, intentional user initiation. It must never run automatically or in the background.
   - **Strictly No Checkout or Payment**: Under no circumstances should the system navigate to checkout, place an order, or process payments. Basket creation stops strictly at the cart level.
   - **Account Ban Risk Disclosure**: Major UK grocers employ automated anti-bot fraud detection on account actions. Synchronizing 50 items via rapid API calls carries a non-zero risk of temporary account flagging or slot cancellation. The user must be shown a clear warning acknowledging this risk prior to first use.

---

## 4. Cloud Migration & Residential Proxy Architecture

When migrating the sidecar from local residential execution to cloud container environments (AWS ECS, GCP Cloud Run, or Hetzner VPS), cloud datacenter IP blocks (ASN 16509, 15169, 24940, etc.) are blocked at the TLS handshake by Akamai and Cloudflare.

### Proxy Layer Integration
- The sidecar provides a zero-configuration default where `PROXY_URL` is unset, utilizing the home network residential IP.
- In cloud environments, the proxy layer routes outbound `curl_cffi` sessions through a dedicated residential proxy provider:
  ```bash
  PROXY_URL=http://user:pass@residential.proxy-provider.io:10000
  PROXY_TYPE=residential  # residential | static_isp | datacenter
  ```
- **Connection Pooling & IP Stickiness**:
  - Retailer sessions must use sticky IP sessions (same IP for the duration of a multi-step search or basket creation) to prevent triggering geo-anomaly fraud rules.
  - Inter-request delays (Gaussian distributed 1.2s ± 0.4s) must remain active even behind residential proxies.

---

## 5. Security & Invariant Checklist

- [x] No credentials or passwords hardcoded in repository tree.
- [x] Split control/data plane architecture isolated from search execution.
- [x] Token storage encrypted at rest with explicit revocation hooks.
- [x] Basket creation bounded: no checkout, no payment, opt-in only.
- [x] Politeness engine and circuit breakers stay active across all tiers.

---

## 6. Public Repository Data Hygiene & Historical Fixtures

- **Raw Payload Untracking**: In accordance with Step 15 & 17 repository sanitization policies, large raw retailer payloads (`tests/fixtures/store-payloads/*.json` and `tests/fixtures/reality-fixtures.json`) are untracked from git via `git rm --cached` and excluded via `.gitignore`.
- **Sample Tracking for CI**: To allow offline replay testing and verification ratchets on fresh checkouts without network calls, a sanitized, trimmed subset (`tests/fixtures/reality-sample.json` < 256KB) and reachability status (`_reachability.json`) remain tracked in version control.
- **Git History Retention Notice**: Per project policy, git history is not rewritten; earlier historical commits retain the scrubbed initial payload fixtures, but no ongoing retailer corpora are committed.

---

## 7. Sidecar Request Boundaries

The store-fetcher works through retailers **sequentially**. Without a bound, a single
`/search` outlives the Node caller: `StoreFetcherClient` aborts its own `fetch` after its
timeout, but that abort is invisible to the sidecar, which keeps contacting the remaining
retailers with nobody waiting for the answer.

### Whole-request deadline

`POST /search` accepts an optional `timeoutMs`. `StoreFetcherClient` sends its own budget,
so both sides work to the same deadline.

| Setting | Env var | Default |
| --- | --- | --- |
| Budget when the caller sends none | `SEARCH_DEFAULT_TIMEOUT_MS` | 30000 |
| Hard cap on any caller's request | `SEARCH_MAX_TIMEOUT_MS` | 60000 |
| Probe budget | `PROBE_DEFAULT_TIMEOUT_MS` | 45000 |

The cap belongs to the sidecar: how long this service is willing to work is its decision,
not the caller's. A caller that sends nothing gets the default, so callers written before
this contract are unaffected.

Within a request:

- Stores are attempted **in request order** until the budget is spent.
- A store is only started when at least `MIN_USEFUL_SLICE_SEC` (1s) remains — less than
  that is consumed by the politeness delay alone.
- A store that was never attempted gets `status: "deadline_exceeded"` with empty
  `products`, so a caller can distinguish "no results" from "never asked".
- Results already collected are always returned; running out of time never discards work.
- The politeness delay is clamped to the remaining budget, so a sleep is never the reason
  a request outlives its caller.
- Each adapter receives the deadline and clamps its own HTTP/browser timeout to
  `deadline.clamp(...)`, so one slow store cannot consume the whole budget.

The response carries a `deadline` block:

```json
{ "budgetMs": 2500, "elapsedMs": 2013, "remainingMs": 487,
  "minUsefulSliceMs": 1000, "exceeded": false, "acceptingNewWork": false }
```

`exceeded` and `acceptingNewWork` are different questions. A request commonly stops
starting stores while time technically remains, because what is left is too short to be
worth another round trip. Reporting only `exceeded` would leave the skipped stores
unexplained.

**Limitation.** The deadline bounds when work *starts* and how long each operation is
*allowed* to take. It cannot cancel a synchronous call already running inside `curl_cffi`
or a browser page — Python threads are not cancellable. A single operation can therefore
overrun the budget by up to its own clamped timeout. Making that cancellable would mean
moving retailer work to separate processes, which is a larger change than this boundary.

### Browser thread ownership

Camoufox exposes Playwright's **synchronous** API, whose handles are bound to the thread
that created them. FastAPI runs `def` endpoints in a worker threadpool, so two overlapping
`/search` requests land on two different threads and would both reach the shared
`browser_service` singleton. Using a handle from another thread is undefined behaviour,
not merely a race.

`Tier2Browser` therefore submits every browser touch — start, `new_page`, close — to one
dedicated single-worker executor. That thread is the browser's only owner, and because the
executor has exactly one worker, overlapping renders queue instead of interleaving.
`_assert_owner_thread()` raises if anything reaches the browser from another thread, so a
future caller that bypasses the executor fails loudly rather than corrupting state.

`render_page` accepts `wait_timeout_ms` to bound how long the *caller* waits. On overrun it
returns `{"success": false, "timedOut": true}`; the owner thread keeps finishing that
render and the next caller queues behind it. Pages are closed in a `finally` block so a
failed render does not leak a page into the reused browser.

### Verification status

`services/store-fetcher/tests/test_server_contract.py` covers the probe handler, the
deadline contract and browser ownership using deterministic delayed adapters and an
ownership-sensitive fake browser. **No test launches a real browser or contacts a
retailer.** Real Camoufox behaviour under concurrent requests, and adapter behaviour
against live retailer responses, still need confirmation in the container.

## Current ownership and verification

The server's per-store candidate cache and shared comparison operation are documented in
[architecture.md](architecture.md). Direct → Trolley → estimated catalog remains a source acquisition
policy, not multiple independent matching engines. Historical reachability observations above are
snapshots, not guarantees of current retailer availability. Use [verification.md](verification.md)
for offline regression commands; live acceptance remains a separate operator check.
