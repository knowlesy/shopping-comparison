import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

function getLatestTag() {
  try {
    return execSync('git describe --tags --abbrev=0 2>/dev/null', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function getCommitsSince(tag) {
  try {
    const range = tag ? `${tag}..HEAD` : 'HEAD';
    const log = execSync(`git log ${range} --pretty=format:"%s%n%b---COMMIT_END---"`, { cwd: ROOT_DIR, encoding: 'utf8' });
    return log.split('---COMMIT_END---').map(c => c.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function computeNextVersion(currentVersion, commits) {
  let [major, minor, patch] = currentVersion.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);

  let bump = 'none';
  if (commits.length === 0) {
    return { version: `${major}.${minor}.${patch}`, bump: 'none' };
  }

  for (const msg of commits) {
    const lower = msg.toLowerCase();
    if (msg.includes('BREAKING CHANGE') || /^[a-z]+(\([a-z0-9_-]+\))?!:/.test(msg)) {
      bump = 'major';
      break;
    }
    if (/^feat(\([a-z0-9_-]+\))?:/i.test(msg) && bump !== 'major') {
      bump = 'minor';
    } else if (/^(fix|perf|refactor|chore|docs)(\([a-z0-9_-]+\))?:/i.test(msg) && bump === 'none') {
      bump = 'patch';
    }
  }

  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bump === 'patch') {
    patch += 1;
  } else if (bump === 'none' && commits.length > 0) {
    patch += 1;
    bump = 'patch';
  }

  return { version: `${major}.${minor}.${patch}`, bump };
}

function applyVersion(nextVersion) {
  const packageJsonPaths = [
    path.join(ROOT_DIR, 'package.json'),
    path.join(ROOT_DIR, 'client/package.json'),
    path.join(ROOT_DIR, 'services/logic-api/package.json'),
    path.join(ROOT_DIR, 'services/scraper-pod/package.json'),
  ];

  for (const pkgPath of packageJsonPaths) {
    if (fs.existsSync(pkgPath)) {
      const content = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      content.version = nextVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(content, null, 2) + '\n', 'utf8');
      console.log(`Updated ${path.relative(ROOT_DIR, pkgPath)} -> v${nextVersion}`);
    }
  }

  // Update Dockerfile ARG APP_VERSION
  const dockerfilePath = path.join(ROOT_DIR, 'services/logic-api/Dockerfile');
  if (fs.existsSync(dockerfilePath)) {
    let dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    dockerfile = dockerfile.replace(/ARG APP_VERSION=[^\n]+/, `ARG APP_VERSION=${nextVersion}`);
    fs.writeFileSync(dockerfilePath, dockerfile, 'utf8');
    console.log(`Updated services/logic-api/Dockerfile ARG APP_VERSION=${nextVersion}`);
  }

  // Update CHANGELOG.md if not already present
  const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    let changelog = fs.readFileSync(changelogPath, 'utf8');
    const today = new Date().toISOString().split('T')[0];
    const headerRegex = new RegExp(`##\\s*\\[${nextVersion.replace(/\./g, '\\.')}\\]`);
    if (!headerRegex.test(changelog)) {
      const newEntry = `\n## [${nextVersion}] - ${today}\n\n- Automated release bump via Conventional Commits\n`;
      changelog = changelog.replace(/(# Changelog[^\n]*\n)/, `$1${newEntry}`);
      fs.writeFileSync(changelogPath, changelog, 'utf8');
      console.log(`Added ## [${nextVersion}] header to CHANGELOG.md`);
    }
  }
}

function main() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const currentVersion = rootPkg.version || '1.1.0';
  const latestTag = getLatestTag();
  const commits = getCommitsSince(latestTag);

  const { version: nextVersion, bump } = computeNextVersion(latestTag ? latestTag.replace(/^v/, '') : currentVersion, commits);

  console.log(`Current Base: v${currentVersion} | Latest Tag: ${latestTag || 'None'} | Commits: ${commits.length} | Bump: ${bump} -> Next: v${nextVersion}`);

  if (process.argv.includes('--apply')) {
    applyVersion(nextVersion);
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\ntag=v${nextVersion}\nbump=${bump}\n`);
  }
}

main();
