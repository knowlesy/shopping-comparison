import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getSystemVersionInfo, isNewerSemver, resolveChangelogPath } from "../routes/system.js";

describe("System Route & Update Checker", () => {
  it("should single-source version and release date from CHANGELOG.md and package.json", () => {
    const info = getSystemVersionInfo();
    assert.ok(info.version);
    assert.match(info.releaseDate, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("should resolve valid changelog path", () => {
    const p = resolveChangelogPath();
    assert.ok(p && fs.existsSync(p), "Changelog file must exist");
  });

  it("should correctly compare semver tags", () => {
    assert.equal(isNewerSemver("1.2.0", "1.1.0"), true);
    assert.equal(isNewerSemver("v1.1.1", "1.1.0"), true);
    assert.equal(isNewerSemver("2.0.0", "1.1.0"), true);
    assert.equal(isNewerSemver("1.1.0", "1.1.0"), false);
    assert.equal(isNewerSemver("1.0.0", "1.1.0"), false);
    assert.equal(isNewerSemver("v1.0.9", "1.1.0"), false);
  });
});
