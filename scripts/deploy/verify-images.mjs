#!/usr/bin/env node
/**
 * Read-only deployable-image identity check.
 *
 * Answers the only two questions that matter before a rollout:
 *   1. Do the image references this repository would apply actually exist?
 *   2. Were all four built from the SAME commit, and which one?
 *
 * It never writes anything, never contacts a cluster unless asked, and never
 * publishes or pulls an image — it reads GHCR manifests over HTTPS with an
 * anonymous pull token.
 *
 * Usage:
 *   node scripts/deploy/verify-images.mjs                 # check deploy/k3s as rendered
 *   node scripts/deploy/verify-images.mjs --dir deploy/release
 *   node scripts/deploy/verify-images.mjs --commit <sha>  # check a candidate release set
 *   node scripts/deploy/verify-images.mjs --cluster       # also read what k3s is running
 *
 * Exit code 0 only when every reference resolves and the set is coherent.
 */
import { execFileSync } from 'child_process';

const REGISTRY = 'ghcr.io';
const OWNER = 'knowlesy';
const SERVICES = ['client', 'logic-api', 'scraper-pod', 'store-fetcher'];
const NAMESPACE = 'shoppingwise';

const MANIFEST_ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json'
].join(',');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const repoFor = (service) => `${OWNER}/shopping-comparison-${service}`;

async function pullToken(service) {
  const url = `https://${REGISTRY}/token?scope=repository:${repoFor(service)}:pull&service=${REGISTRY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`token request failed: HTTP ${res.status}`);
  return (await res.json()).token;
}

async function resolveDigest(service, reference, token) {
  const res = await fetch(`https://${REGISTRY}/v2/${repoFor(service)}/manifests/${reference}`, {
    method: 'HEAD',
    headers: { Authorization: `Bearer ${token}`, Accept: MANIFEST_ACCEPT }
  });
  if (!res.ok) return null;
  return res.headers.get('docker-content-digest');
}

async function listTags(service, token) {
  const res = await fetch(`https://${REGISTRY}/v2/${repoFor(service)}/tags/list?n=1000`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return [];
  return (await res.json()).tags || [];
}

const isCommitTag = (t) => /^[0-9a-f]{40}$/.test(t);

/** Which commit-SHA tags point at this digest — i.e. what source commit is this build? */
async function sourceCommitsFor(service, digest, token) {
  const commitTags = (await listTags(service, token)).filter(isCommitTag);
  const found = [];
  for (const tag of commitTags) {
    if ((await resolveDigest(service, tag, token)) === digest) found.push(tag);
  }
  return found;
}

/** Image references this repository would actually apply, taken from rendered output. */
function renderedReferences(dir) {
  let rendered;
  try {
    rendered = execFileSync('kubectl', ['kustomize', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`could not render ${dir}: ${err.stderr?.toString().trim() || err.message}`);
  }
  const refs = {};
  for (const line of rendered.split('\n')) {
    const m = line.match(/^\s*image:\s*(\S+)$/);
    if (!m) continue;
    const service = SERVICES.find((s) => m[1].includes(`shopping-comparison-${s}`));
    if (service) refs[service] = m[1];
  }
  return refs;
}

function referencePart(ref) {
  const at = ref.indexOf('@');
  if (at !== -1) return ref.slice(at + 1);
  const lastColon = ref.lastIndexOf(':');
  return lastColon > ref.lastIndexOf('/') ? ref.slice(lastColon + 1) : 'latest';
}

function readCluster() {
  try {
    const out = execFileSync(
      'kubectl',
      ['-n', NAMESPACE, 'get', 'pods', '-o',
       'jsonpath={range .items[*]}{.metadata.name}{"\\t"}{range .status.containerStatuses[*]}{.image}{" "}{.imageID}{"\\n"}{end}{end}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return out.trim();
  } catch (err) {
    return `UNAVAILABLE: ${err.stderr?.toString().trim() || err.message}`;
  }
}

async function main() {
  const commitMode = arg('--commit');
  const dir = arg('--dir', 'deploy/k3s');
  const wantCluster = process.argv.includes('--cluster');

  let references;
  if (typeof commitMode === 'string') {
    console.log(`Candidate release set: every image tagged ${commitMode}\n`);
    references = Object.fromEntries(
      SERVICES.map((s) => [s, `${REGISTRY}/${repoFor(s)}:${commitMode}`])
    );
  } else {
    console.log(`Image references rendered from ${dir}\n`);
    references = renderedReferences(dir);
  }

  const missing = SERVICES.filter((s) => !references[s]);
  if (missing.length) {
    console.error(`FAIL: no image reference found for: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const results = {};
  let allResolved = true;

  for (const service of SERVICES) {
    const ref = references[service];
    const token = await pullToken(service);
    const digest = await resolveDigest(service, referencePart(ref), token);
    if (!digest) {
      console.log(`  ${service.padEnd(14)} ${ref}\n  ${''.padEnd(14)} NOT PUBLISHED — this reference does not exist on ${REGISTRY}\n`);
      results[service] = { ref, digest: null, commits: [] };
      allResolved = false;
      continue;
    }
    const commits = await sourceCommitsFor(service, digest, token);
    results[service] = { ref, digest, commits };
    console.log(`  ${service.padEnd(14)} ${ref}`);
    console.log(`  ${''.padEnd(14)} digest ${digest}`);
    console.log(`  ${''.padEnd(14)} built from ${commits.length ? commits.join(', ') : 'unknown commit (no commit-SHA tag points at this digest)'}\n`);
  }

  const commitSets = SERVICES.map((s) => new Set(results[s].commits));
  const shared = commitSets.reduce((acc, set) => new Set([...acc].filter((c) => set.has(c))));
  const coherent = shared.size > 0;

  console.log('---');
  if (!allResolved) {
    console.log('RESULT: FAIL — at least one image reference does not exist. Do not roll out.');
    process.exitCode = 1;
  } else if (coherent) {
    console.log(`RESULT: COHERENT — all four images were built from ${[...shared].join(', ')}.`);
  } else {
    console.log('RESULT: INCOHERENT — the four images come from different commits.');
    console.log('        Build one set from a single commit and use deploy/release/ rather than mixing.');
    process.exitCode = 1;
  }

  if (typeof commitMode === 'string' && allResolved) {
    console.log('\nPaste into deploy/release/kustomization.yaml:');
    for (const s of SERVICES) {
      console.log(`  - name: ${REGISTRY}/${repoFor(s)}`);
      console.log(`    digest: ${results[s].digest}`);
    }
  }

  console.log('\nThis checked the REGISTRY and the manifests in this repository.');
  console.log('It is not evidence about any running cluster.');

  if (wantCluster) {
    console.log('\n--- Images actually running in the cluster (read-only) ---');
    console.log(readCluster());
  } else {
    console.log('Add --cluster to also read what the cluster is running (requires kubectl access).');
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
});
