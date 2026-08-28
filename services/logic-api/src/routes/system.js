import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const systemRouter = express.Router();

/**
 * Resolve CHANGELOG.md path across local dev and containerized runtime
 */
export function resolveChangelogPath() {
  if (process.env.CHANGELOG_PATH && fs.existsSync(process.env.CHANGELOG_PATH)) {
    return process.env.CHANGELOG_PATH;
  }
  const appRootChangelog = path.resolve(__dirname, '../../CHANGELOG.md');
  if (fs.existsSync(appRootChangelog)) {
    return appRootChangelog;
  }
  const containerChangelog = '/usr/src/app/CHANGELOG.md';
  if (fs.existsSync(containerChangelog)) {
    return containerChangelog;
  }
  const repoRootRelative = path.resolve(__dirname, '../../../../CHANGELOG.md');
  if (fs.existsSync(repoRootRelative)) {
    return repoRootRelative;
  }
  return repoRootRelative;
}

/**
 * Single-sourced Version & Release Date derivation
 */
export function getSystemVersionInfo() {
  let version = process.env.APP_VERSION || '1.1.0';
  let releaseDate = new Date().toISOString().split('T')[0];

  // Try reading logic-api package.json
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version) version = process.env.APP_VERSION || pkg.version;
    }
  } catch {
    // Fall back to env or default
  }

  // Derive releaseDate from the top entry of CHANGELOG.md
  try {
    const changelogFile = resolveChangelogPath();
    if (fs.existsSync(changelogFile)) {
      const content = fs.readFileSync(changelogFile, 'utf8');
      const dateMatch = content.match(/##\s*\[[^\]]+\]\s*-\s*(\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1]) {
        releaseDate = dateMatch[1];
      }
    }
  } catch {
    // Fall back to today
  }

  return { version, releaseDate };
}

/**
 * SemVer comparison helper
 */
export function isNewerSemver(latestTag, currentVer) {
  const cleanLatest = String(latestTag || '').replace(/^v/, '').trim();
  const cleanCurrent = String(currentVer || '').replace(/^v/, '').trim();
  const [lMajor = 0, lMinor = 0, lPatch = 0] = cleanLatest.split('.').map(n => parseInt(n, 10) || 0);
  const [cMajor = 0, cMinor = 0, cPatch = 0] = cleanCurrent.split('.').map(n => parseInt(n, 10) || 0);

  if (lMajor > cMajor) return true;
  if (lMajor === cMajor && lMinor > cMinor) return true;
  if (lMajor === cMajor && lMinor === cMinor && lPatch > cPatch) return true;
  return false;
}

// 24-hour in-memory cache for update checks
let cachedUpdateCheck = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * GET /api/system/version
 * Returns version and container metadata
 */
systemRouter.get('/version', (req, res) => {
  const { version, releaseDate } = getSystemVersionInfo();
  const repoSlug = process.env.GITHUB_REPO || 'knowlesy/shopping-comparison';
  const registryHost = process.env.IMAGE_REGISTRY || 'ghcr.io';

  res.json({
    version,
    releaseDate,
    imageTag: `${registryHost}/${repoSlug}:v${version}`,
    latestImageTag: `${registryHost}/${repoSlug}:latest`,
    clientImage: `${registryHost}/${repoSlug}-client:v${version}`,
    logicApiImage: `${registryHost}/${repoSlug}-logic-api:v${version}`,
    scraperPodImage: `${registryHost}/${repoSlug}-scraper-pod:v${version}`,
    imageRepo: `https://github.com/${repoSlug}/pkgs/container/shopping-comparison-client`,
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * GET /api/system/changelog
 * Returns raw and structured changelog markdown
 */
systemRouter.get('/changelog', (req, res) => {
  const { version } = getSystemVersionInfo();
  try {
    const changelogFile = resolveChangelogPath();
    let changelogContent = '';
    if (fs.existsSync(changelogFile)) {
      changelogContent = fs.readFileSync(changelogFile, 'utf-8');
    } else {
      changelogContent = `# Changelog\n\n## [${version}]\n\n- UK Grocery Price Comparison & Basket Optimizer`;
    }
    res.json({
      version,
      content: changelogContent
    });
  } catch (err) {
    res.status(500).json({ error: `Could not read changelog: ${err.message}` });
  }
});

/**
 * GET /api/system/check-update
 * Checks GitHub Releases API for newer version with 24h server-side caching
 */
systemRouter.get('/check-update', async (req, res) => {
  const { version: currentVersion } = getSystemVersionInfo();
  const repo = process.env.GITHUB_REPO || 'knowlesy/shopping-comparison';
  const now = Date.now();

  if (cachedUpdateCheck && now - lastCheckTime < CACHE_TTL_MS) {
    return res.json({
      ...cachedUpdateCheck,
      currentVersion,
      cached: true
    });
  }

  try {
    const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'TrolleyWise-System-Notifier',
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}`);
    }

    const data = await response.json();
    const latestTag = data.tag_name || data.name || currentVersion;
    const cleanLatest = latestTag.replace(/^v/, '').trim();
    const updateAvailable = isNewerSemver(cleanLatest, currentVersion);

    const result = {
      currentVersion,
      latestVersion: cleanLatest,
      updateAvailable,
      checkedAt: new Date().toISOString(),
      pullCommand: 'docker compose pull && docker compose up -d',
      releaseNotesUrl: data.html_url || `https://github.com/${repo}/releases/tag/${latestTag}`,
      publishedAt: data.published_at || null
    };

    cachedUpdateCheck = result;
    lastCheckTime = now;
    return res.json(result);
  } catch (err) {
    // Graceful fallback on network error or GitHub rate limits - never crash
    return res.json({
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      error: err.message,
      checkedAt: new Date().toISOString(),
      pullCommand: 'docker compose pull && docker compose up -d',
      releaseNotesUrl: `https://github.com/${repo}/releases`
    });
  }
});
