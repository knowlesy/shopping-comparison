# GitHub Actions CI/CD & Security Workflows 🛠️

This document details the automated continuous integration, containerization, and security audit pipelines configured for the repository.

---

## 1. Automated CI/CD Pipeline Architecture

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

    subgraph CI["2. Fast Continuous Integration (~30s)"]
        Cancel --> LintJob[Run ESLint on microservices & client]
        LintJob --> TestJob[Run Node.js 22 Test Runner 110+ Unit Tests]
        TestJob --> CatalogLint[Validate Offline Benchmark Catalog Integrity]
        CatalogLint --> BuildClient[Compile Production Client SPA Bundle]
    end

    subgraph CD["3. Container Build & Publishing (Release Gated)"]
        BuildClient --> IsRelease{Is Release Tag v*.* or Manual Dispatch?}
        IsRelease -- No (Standard Commit) --> SkipDocker[✅ Skip Heavy Container Builds - Finish in ~35s]
        IsRelease -- Yes (Release) --> BuildImages[Build & Tag Multi-Service Docker Images]
        BuildImages --> ClientImg[Build client Image]
        BuildImages --> LogicImg[Build logic-api Image]
        BuildImages --> ScraperImg[Build scraper-pod Image]
        ClientImg --> GHCR[Publish to GitHub Container Registry ghcr.io]
        LogicImg --> GHCR
        ScraperImg --> GHCR
    end

    subgraph Security["4. Parallel OWASP Security Audit (~30s)"]
        Cancel -.-> OWASPRun[Run OWASP Top 10 Suite & Dependency Audits]
        OWASPRun --> EphemeralCheck[Ephemeral Test Execution in Sandbox]
        EphemeralCheck --> SecurityPass[✅ Zero Scan Reports Stored or Tracked]
    end
```

---

## 2. Pipeline Stages

### 2.1 Concurrency Cancellation
- **`cancel-in-progress: true`**: Automatically cancels older in-progress runs when rapid commits are pushed, saving runner minutes and eliminating pipeline queue congestion.

### 2.2 Fast 30-Second Verification Job
- Executes on every push and pull request.
- Installs dependencies with `npm ci`, runs ESLint, executes the full unit test suite (110+ tests), verifies offline catalog data integrity, and compiles the frontend production bundle.

### 2.3 Gated Container Image Publishing
- Container images (`client`, `logic-api`, `scraper-pod`) are built and pushed to GitHub Container Registry (`ghcr.io`) **only** on:
  - **Release Tags**: Pushing a SemVer release tag (e.g. `git tag v1.1.0 && git push origin v1.1.0`).
  - **Manual Dispatch**: Triggering "Run workflow" with `publish_containers: true` from the GitHub Actions UI.
- Normal feature/fix commits complete in ~35 seconds without generating redundant container image churn.

### 2.4 Ephemeral OWASP Security Audits
- Runs in parallel on code pushes.
- Evaluates OWASP Top 10 security rules, route validation, SSRF protections, credential redactions, and high-severity dependency audits without uploading artifacts or storing scan outputs.
