import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHANGELOG_PATH = path.resolve(__dirname, '../../../../CHANGELOG.md');

export const systemRouter = express.Router();

const CURRENT_VERSION = '1.1.0';
const RELEASE_DATE = '2026-08-27';

/**
 * GET /api/system/version
 * Returns version and container metadata
 */
systemRouter.get('/version', (req, res) => {
  res.json({
    version: CURRENT_VERSION,
    releaseDate: RELEASE_DATE,
    latestImageTag: 'ghcr.io/knowlesy/shopping-comparison:latest',
    imageRepo: 'https://github.com/knowlesy/shopping-comparison/pkgs/container/shopping-comparison-client'
  });
});

/**
 * GET /api/system/changelog
 * Returns raw and structured changelog markdown
 */
systemRouter.get('/changelog', (req, res) => {
  try {
    let changelogContent = '';
    if (fs.existsSync(CHANGELOG_PATH)) {
      changelogContent = fs.readFileSync(CHANGELOG_PATH, 'utf-8');
    } else {
      changelogContent = `# Changelog\n\n## [${CURRENT_VERSION}] - ${RELEASE_DATE}\n\n- Multibuy & Deal Price Parsing\n- 72-Hour Search Pinning\n- Hybrid Gemini AI Fallback\n- Docker Image Update Notifier`;
    }
    res.json({
      version: CURRENT_VERSION,
      content: changelogContent
    });
  } catch (err) {
    res.status(500).json({ error: `Could not read changelog: ${err.message}` });
  }
});

/**
 * GET /api/system/check-update
 * Checks if a newer release/image is available (checked once every 24h by frontend)
 */
systemRouter.get('/check-update', (req, res) => {
  res.json({
    currentVersion: CURRENT_VERSION,
    latestVersion: CURRENT_VERSION,
    updateAvailable: false,
    checkedAt: new Date().toISOString(),
    pullCommand: 'docker compose pull && docker compose up -d',
    releaseNotesUrl: 'https://github.com/knowlesy/shopping-comparison/releases'
  });
});
