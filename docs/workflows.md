# CI, releases and security checks

The authoritative definitions are `.github/workflows/ci.yml` and `owasp.yml`.

CI installs the four npm scopes, runs Node tests, Python offline tests, both historical acceptance
gates, builds the client and runs Playwright against an isolated real API. Test subprocesses use
temporary data; the Node test preloader blocks external global-fetch requests even if a settings
scenario supplies a fake model key. This does not sandbox arbitrary network libraries: retailer and
browser acquisition remain mocked/disabled by the test harness. See [verification](verification.md).

The workflow also restores historical raw fixtures for its offline checks. Local evaluators can use
available private fixtures or the sanitized tracked sample; always record which corpus was evaluated.

Security CI audits root, client, logic-api and scraper-pod npm scopes at moderate severity, and Python
requirements using pip-audit. Scanner failures fail the job; a local passing test is not evidence that
remote CI passed or that all current advisories are absent.

Release jobs derive versions from commits and publish changed services. The stack has four images:
client, logic-api, scraper-pod and store-fetcher. A shared semver/latest label does not establish that
all images contain the same source commit. Select coherent digests and use the operator release overlay
as documented in [deployment guidance](../deploy/k3s/README.md). Building, publishing and deploying are
separate actions; tests do not automatically certify the deployed homelab.
