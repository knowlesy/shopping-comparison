# GitHub Actions CI/CD, Versioning & Security Workflows 🛠️

This document details the automated continuous integration, conventional-commit semantic versioning, containerization, and security audit pipelines configured for ShoppingWise.

---

## 1. Automated CI/CD & Semantic Release Architecture

```mermaid
flowchart TD
    subgraph Trigger["1. Triggers & Concurrency"]
        Push[git push to master / main]
        Tag[git push tag v*.*.*]
        PR[Pull Request]
        Manual[workflow_dispatch Manual Trigger]
        Cancel["Concurrency Group: Cancel in-progress superseded runs"]
        
        Push --> Cancel
        Tag --> Cancel
        PR --> Cancel
        Manual --> Cancel
    end

    subgraph CI["2. Fast Continuous Integration (~35s)"]
        Cancel --> LintJob[Run ESLint on microservices & client]
        LintJob --> TestJob[Run Node.js 22 Test Runner 110+ Unit Tests]
        TestJob --> CatalogLint[Validate Offline Benchmark Catalog Integrity]
        CatalogLint --> BuildClient[Compile Production Client SPA Bundle]
    end

    subgraph AutoVersion["3. Automated Semantic Versioning"]
        BuildClient --> ParseCommits[Analyze Conventional Commits feat / fix / BREAKING]
        ParseCommits --> CalcSemVer[Compute Next SemVer e.g. v1.2.0]
        CalcSemVer --> VersionOutput[Inject APP_VERSION into Docker Build Args & Image Tags]
    end

    subgraph CD["4. Container Build & Multi-Tag Publishing"]
        VersionOutput --> BuildImages[Build Multi-Service Docker Images with Version]
        BuildImages --> ClientImg["Build client Image (Tagged :latest, :v1.2.0, :sha)"]
        BuildImages --> LogicImg["Build logic-api Image (Tagged :latest, :v1.2.0, :sha)"]
        BuildImages --> ScraperImg["Build scraper-pod Image (Tagged :latest, :v1.2.0, :sha)"]
        ClientImg --> GHCR[Publish to GitHub Container Registry ghcr.io]
        LogicImg --> GHCR
        ScraperImg --> GHCR
    end

    subgraph Security["5. Parallel OWASP Security Audit (~35s)"]
        Cancel -.-> OWASPRun[Run OWASP Top 10 Suite & Dependency Audits]
        OWASPRun --> EphemeralCheck[Ephemeral Test Execution in Sandbox]
        EphemeralCheck --> SecurityPass[✅ Zero Scan Reports Stored or Tracked]
    end
```

---

## 2. Pipeline Stages

### 2.1 Concurrency Cancellation
- **`cancel-in-progress: true`**: Automatically cancels older in-progress runs when rapid commits are pushed, saving runner minutes and eliminating pipeline queue congestion.

### 2.2 Fast Verification Job (`Lint, Test & Build`)
- Executes on every push and pull request.
- Installs dependencies with `npm ci`, runs ESLint, executes the full unit test suite (110+ tests), verifies offline catalog data integrity, and compiles the frontend production bundle.

### 2.3 Automated Semantic Versioning
- Uses Conventional Commits to automatically calculate the next SemVer version (`major`, `minor`, `patch`):
  - `feat:` $\rightarrow$ Minor bump (e.g. `1.1.0` $\rightarrow$ `1.2.0`)
  - `fix:`, `refactor:`, `perf:`, `chore:` $\rightarrow$ Patch bump (e.g. `1.2.0` $\rightarrow$ `1.2.1`)
  - `BREAKING CHANGE:` or `feat!:` $\rightarrow$ Major bump (e.g. `1.2.0` $\rightarrow$ `2.0.0`)
- Automatically injects the calculated version into Docker build arguments (`APP_VERSION`) and image tags.

### 2.4 Multi-Tagged Container Publishing
- Builds and pushes all 3 production images (`client`, `logic-api`, `scraper-pod`) to GitHub Container Registry (`ghcr.io`).
- Pushes multi-tag manifests:
  - `:latest` (Always tracks the newest build)
  - `:v1.2.0` & `:1.2.0` (Semantic release versions)
  - `:<commit-sha>` (Immutable commit artifact tag)

### 2.5 Ephemeral OWASP Security Audits
- Runs in parallel on code pushes.
- Evaluates OWASP Top 10 security rules, route validation, SSRF protections, credential redactions, and high-severity dependency audits without uploading artifacts or storing scan outputs.
