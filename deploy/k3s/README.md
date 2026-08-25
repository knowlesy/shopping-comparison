# TrolleyWise k3s & GitOps Reference Guide ☸️

This directory contains reference Kubernetes manifests for deploying the TrolleyWise stack to a k3s cluster.

> [!WARNING]
> These manifests define a standalone `trolleywise` namespace, unencrypted placeholder secrets, and a default local ingress. **Do not apply this directory directly over an existing production deployment** without reviewing your ingress hostnames, TLS certificates, and secret management strategy.

---

## 🔐 1. Secrets Management

Never commit production authentication tokens to Git. Before applying the stack, provision the secret dynamically:

```bash
# 1. Create namespace
kubectl create namespace trolleywise

# 2. Generate a 48-char random token for inter-service scraper authentication
kubectl create secret generic trolleywise-secret \
  --namespace trolleywise \
  --from-literal=SCRAPE_TOKEN="$(openssl rand -hex 24)" \
  --from-literal=GEMINI_API_KEY=""
```

Alternatively, use **SealedSecrets**, **Vault**, or the **External Secrets Operator (ESO)**.

---

## 🔄 2. GitOps & Automatic Image Updates (Argo CD / Renovate)

CI builds and pushes two tags on every push:
1. `:latest` (floating)
2. `:${{ github.sha }}` (immutable commit SHA)

### Option A: Pinning Immutable SHA Tags with Renovate
To enable automated GitOps pull requests on new builds, pin the image tags in `03-scraper-pod.yaml`, `04-logic-api.yaml`, and `05-client.yaml` to the commit SHA:
```yaml
image: ghcr.io/knowlesy/shopping-comparison-client:<commit-sha>
```
Renovate will automatically detect new image tags on GHCR and submit PRs with the updated SHA.

### Option B: Argo CD Image Updater
If using Argo CD Image Updater, annotate your ArgoCD `Application` manifest to track the latest build and commit changes back to Git automatically:
```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: client=ghcr.io/knowlesy/shopping-comparison-client,api=ghcr.io/knowlesy/shopping-comparison-logic-api,scraper=ghcr.io/knowlesy/shopping-comparison-scraper-pod
    argocd-image-updater.argoproj.io/client.update-strategy: latest
    argocd-image-updater.argoproj.io/write-back-method: git
```

---

## 🚀 3. Manual Deployment (Reference)

```bash
# Apply using kustomize
kubectl apply -k deploy/k3s/
```
