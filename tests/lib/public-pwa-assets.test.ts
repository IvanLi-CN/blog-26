import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  APPROVED_BRAND_PNG_SHA256,
  APPROVED_BRAND_SVG_SHA256,
  generatePublicPwaAssets,
} from "../../scripts/generate-public-pwa-assets";
import { verifyPublicPwaAssets } from "../../scripts/verify-public-pwa-assets";
import { createPublicWebManifest, getPublicPwaAssetPaths } from "../../site/lib/public-pwa";

const repoRoot = resolve(import.meta.dir, "../..");
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const path = tempRoots.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

function makeTempRoot() {
  const path = mkdtempSync(resolve(tmpdir(), "public-pwa-assets-"));
  tempRoots.push(path);
  return path;
}

function scopePath(basePath: string, path: string) {
  if (!basePath) return path;
  return path === "/" ? `${basePath}/` : `${basePath}${path}`;
}

describe("public PWA assets", () => {
  it("rebuilds the approved master without changing its vector source", async () => {
    const publicDir = resolve(makeTempRoot(), "public");
    const generated = await generatePublicPwaAssets({ root: repoRoot, publicDir });
    const verified = await verifyPublicPwaAssets({ root: repoRoot, publicDir, siteDistDir: null });

    expect(generated.version).toMatch(/^[a-f0-9]{16}$/);
    expect(verified.version).toBe(generated.version);
    expect(APPROVED_BRAND_SVG_SHA256).toBe(
      "6f7702a37c2b2510dda09503ba55b3eb2cf2b8f5d8dc63aec8e8060ec4228710"
    );
    expect(APPROVED_BRAND_PNG_SHA256).toBe(
      "922b43ef7b0a0328886132b1815c101f0aa037f80793d5ed14c56c527fabe06d"
    );
  });

  it("scopes manifest identity and every icon URL to root or a configured base path", async () => {
    const assets = await getPublicPwaAssetPaths(repoRoot);
    const rootManifest = createPublicWebManifest(assets, (path) => scopePath("", path));
    const baseManifest = createPublicWebManifest(assets, (path) => scopePath("/blog-26", path));

    expect(rootManifest.id).toBe("/");
    expect(rootManifest.start_url).toBe("/");
    expect(rootManifest.scope).toBe("/");
    expect(baseManifest.id).toBe("/blog-26/");
    expect(baseManifest.start_url).toBe("/blog-26/");
    expect(baseManifest.scope).toBe("/blog-26/");
    expect(baseManifest.name).toBe("Ivan's Blog");
    expect(baseManifest.short_name).toBe("Ivan's Blog");
    expect(baseManifest.icons).toHaveLength(4);
    expect(baseManifest.icons.every((icon) => icon.src.startsWith("/blog-26/pwa/"))).toBe(true);
    expect(baseManifest.icons.map((icon) => icon.purpose)).toEqual([
      "any",
      "any",
      "maskable",
      "maskable",
    ]);
  });
});
