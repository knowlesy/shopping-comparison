import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getDeployedImages, getSystemVersionInfo, isNewerSemver, resolveChangelogPath } from "../routes/system.js";

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

  describe("deployed image identity", () => {
    const IMAGE_VARS = [
      "CLIENT_IMAGE",
      "LOGIC_API_IMAGE",
      "SCRAPER_POD_IMAGE",
      "STORE_FETCHER_IMAGE"
    ];
    let saved;

    beforeEach(() => {
      saved = Object.fromEntries(IMAGE_VARS.map((k) => [k, process.env[k]]));
      for (const k of IMAGE_VARS) delete process.env[k];
    });

    afterEach(() => {
      for (const k of IMAGE_VARS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });

    it("reports nothing rather than inventing image tags when the deployment is silent", () => {
      const { images, imageIdentitySource } = getDeployedImages();
      assert.equal(imageIdentitySource, "unreported");
      for (const key of Object.keys(images)) {
        assert.equal(images[key], null, `${key} must be null, not a version-derived guess`);
      }
      // Guard the actual regression: the app version must never leak into an image string.
      const { version } = getSystemVersionInfo();
      const serialized = JSON.stringify(images);
      assert.ok(
        !serialized.includes(`:v${version}`),
        "image identity must not be derived from the app version"
      );
    });

    it("reports all four images when the deployment states them", () => {
      process.env.CLIENT_IMAGE = "ghcr.io/knowlesy/shopping-comparison-client@sha256:aaa";
      process.env.LOGIC_API_IMAGE = "ghcr.io/knowlesy/shopping-comparison-logic-api@sha256:bbb";
      process.env.SCRAPER_POD_IMAGE = "ghcr.io/knowlesy/shopping-comparison-scraper-pod@sha256:ccc";
      process.env.STORE_FETCHER_IMAGE = "ghcr.io/knowlesy/shopping-comparison-store-fetcher@sha256:ddd";

      const { images, imageIdentitySource } = getDeployedImages();
      assert.equal(imageIdentitySource, "environment");
      assert.equal(images.clientImage, process.env.CLIENT_IMAGE);
      assert.equal(images.logicApiImage, process.env.LOGIC_API_IMAGE);
      assert.equal(images.scraperPodImage, process.env.SCRAPER_POD_IMAGE);
      assert.equal(
        images.storeFetcherImage,
        process.env.STORE_FETCHER_IMAGE,
        "the store-fetcher is the fourth deployable image and must be reportable"
      );
    });
  });
});
