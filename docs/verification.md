# Offline verification and acceptance

Run from the repository root after installing declared dependencies:

```sh
npm test
npm run lint
npm run build
npm run test:e2e
npm run test:owasp
npm run verify:audit
npm run verify:infv
npm run eval:real
npm run eval:holdout
npm run eval:stores
services/store-fetcher/.venv/bin/python -m pytest services/store-fetcher/tests
```

The `.venv` command assumes that local environment exists; otherwise use the Python interpreter where
`services/store-fetcher/requirements.txt` was installed. Live acquisition commands are separate and are
not needed for these checks. `npm run test:e2e:no-api -- --grep 'comparison shown in the browser' --timeout=15000`
is an expected-negative sentinel: it must fail when the API is deliberately absent.

`npm test`, the security/gate commands and the Playwright API process load
`tests/support/isolated-env.mjs` before application imports. It selects temporary data, clears model
credentials, prevents environment-file loading and rejects external global-fetch calls. This protects
current fetch-based model/retailer clients even after a settings test enters a dummy key. Tests may
replace external boundaries with explicit fakes. The preloader does not claim an OS-wide network sandbox.
Direct `node --test` invocations should include `--import ./tests/support/isolated-env.mjs`.

## Historical gate reconciliation

Consolidation moved settings into `settingsStore`, comparisons into `comparisonEngine`, and result
construction into `matchResultBuilder`. INFV's old regex checks against the previous files were stale.
Their intent is retained through real regression suites, run once per file in isolated child processes:

| Gate intent | Behavioral proof |
| --- | --- |
| Price-source confidence tiers | confidence and match-result-builder tests |
| Direct adapter / AI stage / logging settings survive saves | settings persistence and validation tests |
| Comparison source telemetry, AI budget and wired-in choices | compare HTTP/SSE tests |
| Direct candidates suppress unnecessary aggregator acquisition | candidate pipeline tests |

UI-control presence checks remain alongside those tests. Gates fail when the child suite fails or times
out. This replaces file-location assumptions; it does not remove the acceptance conditions.

## What passing means

Browser API tests require a real local API and assert its products, quantities, sources and prices.
The separate UI fixture tests prove rendering, not live retailer acquisition. Python tests exercise
adapters, deadlines and thread ownership with offline fakes. Holdout cases used to tune rules become
regressions, not fresh independent accuracy evidence. Synthetic boundaries are reported separately.

Code checks, current dependency advisories, container startup and actual deployment acceptance are
separate verdicts. Live image identity, DNS, persistence, headers, retailer availability and AI uplift
need their own evidence; [deployment guidance](../deploy/k3s/README.md) provides the operator procedure.

## Public CI versus private recording evidence

CI runs `npm run verify:infv -- --public-checkout`. Thirteen checks requiring ignored
retailer recordings are explicitly reported as NOT RUN, never PASS. These cover recording
provenance, corpus depth, store coverage, recorded taxonomy and contamination in the full corpus.
All remaining code, sample and behavioral gates still run and fail normally. The unit suite
retains synthetic contamination regressions; CI also restores historical offline adapter payloads.

`npm run verify:infv` keeps the full local acceptance contract. Run it with the private recordings
before claiming full corpus acceptance; a public CI success establishes only the public-checkout
checks. No live acquisition or publication of private recordings is required by CI.

Manual CI runs with Publish containers enabled rebuild all four images, even if only one
service changed. Use this to recover a failed multi-service release. Ordinary pushes retain
per-service change filters.
