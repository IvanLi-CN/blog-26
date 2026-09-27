#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  collectStaticFiles,
  createEdgeoneCacheConfig,
  type EdgeoneCacheConfig,
  normalizeBasePath,
} from "./prepare-edgeone-pwa-config";

export async function verifyEdgeonePwaArtifact(
  options: { siteDistDir?: string; artifactDir?: string; basePath?: string } = {}
) {
  const siteDistDir = resolve(
    options.siteDistDir ?? process.env.PUBLIC_SITE_DIST_DIR ?? "site-dist"
  );
  const artifactDir = resolve(
    options.artifactDir ?? process.env.PUBLIC_EDGEONE_ARTIFACT_DIR ?? "edgeone-dist"
  );
  const basePath = normalizeBasePath(options.basePath ?? process.env.PUBLIC_SITE_BASE_PATH ?? "");
  const expected = createEdgeoneCacheConfig(basePath, await collectStaticFiles(siteDistDir));
  const configPath = join(artifactDir, "edgeone.json");
  const actual = JSON.parse(await readFile(configPath, "utf8")) as EdgeoneCacheConfig;

  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `EdgeOne deployment artifact cache rules do not match site output: ${configPath}`
    );
  }

  return { configPath, ruleCount: actual.headers.length };
}

if (import.meta.main) {
  verifyEdgeonePwaArtifact()
    .then(({ configPath, ruleCount }) => {
      console.log(`[public-pwa] verified EdgeOne artifact: ${ruleCount} rules at ${configPath}`);
    })
    .catch((error) => {
      console.error(
        "[verify-edgeone-pwa-artifact]",
        error instanceof Error ? error.message : String(error)
      );
      process.exitCode = 1;
    });
}
