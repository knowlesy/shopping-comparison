# ShoppingWise k3s deployment reference ☸️

Reference Kubernetes manifests for the ShoppingWise stack.

> [!WARNING]
> These manifests define a standalone `shoppingwise` namespace and a default local ingress.
> **Do not apply this directory over an existing production deployment** without reviewing
> your ingress hostnames, TLS certificates and secret management strategy.

> [!IMPORTANT]
> Nothing in this repository has been validated against a running cluster. Everything below
> marked **manifest check** is a repository-level check only. Everything marked
> **cluster check** must be run by an operator against the real cluster; until someone does,
> the deployment is unverified. These are not interchangeable.

---

## 1. Service wiring

Traffic path: browser → ingress → `shoppingwise-client` (nginx) → `shoppingwise-logic-api`
→ `shoppingwise-scraper-pod` / `shoppingwise-store-fetcher`.

The client's nginx does not hardcode the API host, because the name differs by platform:

| Platform | Upstream the client proxies `/api/` to |
| --- | --- |
| docker compose | `logic-api:3001` (compose service name; the image default) |
| k3s | `shoppingwise-logic-api:3001` (Service name in the `shoppingwise` namespace) |

`client/nginx.conf.template` renders at container start from `LOGIC_API_UPSTREAM`.
In k3s this comes from `shoppingwise-config`; in Compose it is set on the `client` service.
If it is wrong the client container fails to start (`host not found in upstream`), which in
k3s shows as CrashLoopBackOff — it does not fail silently.

`STORE_FETCHER_URL` and `FETCHER_TOKEN` are injected into **both** `shoppingwise-logic-api`
and `shoppingwise-store-fetcher`. `FETCHER_TOKEN` is deliberately not `optional`: if only one
side got the secret, the other would fall back to its built-in development token and every
direct-adapter request would fail authentication at runtime instead of failing at deploy time.

---

## 2. Deployable image identity

**Read this before choosing a tag.** CI rebuilds only the services whose paths changed, so
the *same* version tag resolves to *different* source commits per image. Verified against
GHCR on 2026-09-20, `v1.4.0` was:

| Image | Built from commit |
| --- | --- |
| client | `a2fe542f790b9a1233baa7ab3fcf1dfbb461a636` |
| logic-api | `8cf7e36575fd43a57614448137cd36fec461e645` |
| scraper-pod | `3492bc0032a9532c8d53752c2cded006be1558ec` |
| store-fetcher | `8cf7e36575fd43a57614448137cd36fec461e645` |

A semver tag is therefore **not** a release identity for this stack. Identity is by digest,
and a release is coherent only when all four digests come from one commit.

`kustomization.yaml` selects all four images by digest in one place. The set currently pinned
is commit `3492bc0032a9532c8d53752c2cded006be1558ec` (2026-09-01) — the newest published set
where all four images were built from the same commit.

> [!CAUTION]
> That set **predates the current repository state**. It is a coherent baseline, not a build
> of the code in this checkout. Deploying it deploys older code. To run current code you must
> publish a new image set and use the release overlay below.

### Verify before rolling out — manifest check

```bash
# What this repository would apply: does each reference exist, and is the set coherent?
node scripts/deploy/verify-images.mjs
```
Read-only: it resolves manifests on GHCR with an anonymous pull token. Exit code is non-zero
if any reference is missing or the four images come from different commits.

### Releasing current code — operator-supplied overlay

```bash
# 1. Push the commit and let CI publish. CI only rebuilds changed services, so confirm
#    all four carry that commit SHA (re-run the workflow with publish_containers=true if not):
node scripts/deploy/verify-images.mjs --commit <full-commit-sha>

# 2. Paste the four digests it prints into deploy/release/kustomization.yaml,
#    set RELEASE_COMMIT, then:
kubectl apply -k deploy/release/
```

`deploy/release/kustomization.yaml` ships with placeholder digests on purpose: applying it
unedited fails loudly rather than deploying an unspecified image set.

---

## 3. Secrets

Never commit tokens. Provision the secret before applying:

```bash
kubectl create namespace shoppingwise

kubectl create secret generic shoppingwise-secret \
  --namespace shoppingwise \
  --from-literal=SCRAPE_TOKEN="$(openssl rand -hex 24)" \
  --from-literal=FETCHER_TOKEN="$(openssl rand -hex 24)" \
  --from-literal=GEMINI_API_KEY=""
```

All three keys are required. `FETCHER_TOKEN` is read by both `shoppingwise-logic-api` and
`shoppingwise-store-fetcher`; if the key is missing, both pods stay in
`CreateContainerConfigError` instead of starting with mismatched tokens. That loud failure is
the point. SealedSecrets, Vault or the External Secrets Operator all work here.

---

## 4. Deploy

```bash
kubectl kustomize deploy/k3s          # manifest check: render and read before applying
kubectl apply -k deploy/k3s/          # pinned baseline set (older code — see section 2)
```

---

## 5. Post-deployment checks — cluster check

These require cluster access and are **read-only**. A repository check never substitutes for them.

### 5.1 Which images are actually running

```bash
node scripts/deploy/verify-images.mjs --cluster

# or directly:
kubectl -n shoppingwise get pods \
  -o custom-columns='POD:.metadata.name,IMAGE:.spec.containers[*].image,RUNNING_DIGEST:.status.containerStatuses[*].imageID'
```
`imageID` is the digest actually running. Compare it with the digests in `kustomization.yaml`
(or the release overlay). A mismatch means a node is running a cached image.

### 5.2 Connectivity

```bash
kubectl -n shoppingwise get pods,svc,endpoints

# client -> logic-api, through the same nginx path the browser uses
kubectl -n shoppingwise exec deploy/shoppingwise-client -- \
  wget -qO- http://localhost:8080/api/system/version

# logic-api -> sidecars
kubectl -n shoppingwise exec deploy/shoppingwise-logic-api -- \
  wget -qO- http://shoppingwise-store-fetcher:3003/health
kubectl -n shoppingwise exec deploy/shoppingwise-logic-api -- \
  wget -qO- http://shoppingwise-scraper-pod:3002/health
```
An empty `endpoints` list for a Service means no ready pod matches its selector.

### 5.3 Restart and persistence

`shoppingwise-logic-api` writes its cache, history and settings to `/data`, backed by the
`shoppingwise-logic-api-data` PVC. To confirm a restart preserves them:

```bash
# before
kubectl -n shoppingwise exec deploy/shoppingwise-logic-api -- ls -l /data
kubectl -n shoppingwise exec deploy/shoppingwise-logic-api -- \
  wget -qO- http://localhost:3001/api/cache/stats

kubectl -n shoppingwise rollout restart deploy/shoppingwise-logic-api
kubectl -n shoppingwise rollout status deploy/shoppingwise-logic-api

# after — file list and entry count must match
kubectl -n shoppingwise exec deploy/shoppingwise-logic-api -- ls -l /data
kubectl -n shoppingwise exec deploy/shoppingwise-logic-api -- \
  wget -qO- http://localhost:3001/api/cache/stats

kubectl -n shoppingwise get pvc shoppingwise-logic-api-data
```
The PVC is `ReadWriteOnce`, so the Deployment stays at one replica; a rolling update can
briefly block while the old pod releases the volume.

---

## 6. GitOps notes

CI publishes several tags per image (`latest`, `v<version>`, `<version>`, `<commit-sha>`, and
a second `shopping-comparison/<service>` path). Only the commit-SHA tags are safe to reason
about, and only after `verify-images.mjs` confirms all four exist for the same commit.

- **Renovate**: pin commit-SHA tags and let it raise PRs. Verify coherence before merging —
  Renovate updates each image independently and will happily mix commits.
- **Argo CD Image Updater**: a `latest` update strategy will mix commits across the four
  images for the same reason. Prefer digest pinning through the release overlay.
