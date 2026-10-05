import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEdgeoneCacheConfig,
  EDGEONE_PUBLIC_CACHE_CONTROL,
  findEdgeoneCacheRule,
  prepareEdgeonePwaConfig,
} from "../../scripts/prepare-edgeone-pwa-config";
import { verifyEdgeonePwaArtifact } from "../../scripts/verify-edgeone-pwa-artifact";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("EdgeOne public PWA cache config", () => {
  it("covers public pages and assets at a base path without matching API, admin, or gateway", () => {
    const config = createEdgeoneCacheConfig("/blog-26", [
      "index.html",
      "about/index.html",
      "search/index.html",
      "posts/index.html",
      "posts/example/index.html",
      "memos/index.html",
      "memos/feed.xml",
      "tags/index.html",
      "tags/nature/index.html",
      "tags/nature/feed.xml",
      "projects/index.html",
      "projects/blog-26/index.html",
      "playbook/index.html",
      "playbook/topics/delivery/index.html",
      "_astro/app-123456.js",
      "_content/assets/post/example/hash/cover.webp",
      `_content/playbook/v3.0.0/${"a".repeat(64)}/catalog.json`,
      `_content/playbook/v3.0.0/${"a".repeat(64)}/policies/safe-release/SKILL.md`,
      "_content/playbook/manifest.json",
      "pwa/1234567890abcdef/icon-any-192.png",
      "pwa/undigested/icon.png",
      "site.webmanifest",
      "favicon.svg",
      "favicon.ico",
      "favicon-dark.ico",
      "ivan-blog-mark.svg",
      "projects/posters/blog-26.webp",
    ]);

    expect(findEdgeoneCacheRule(config, "/blog-26/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/posts/example/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/projects/blog-26/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/playbook/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(
      findEdgeoneCacheRule(config, "/blog-26/playbook/topics/delivery/")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.html);
    expect(
      findEdgeoneCacheRule(
        config,
        `/blog-26/_content/playbook/v3.0.0/${"a".repeat(64)}/policies/safe-release/SKILL.md`
      )?.headers
    ).toEqual([
      { key: "Cache-Control", value: EDGEONE_PUBLIC_CACHE_CONTROL.immutable },
      { key: "Content-Type", value: "text/plain; charset=utf-8" },
      { key: "Content-Disposition", value: "attachment" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ]);
    expect(
      findEdgeoneCacheRule(config, "/blog-26/_content/playbook/manifest.json")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(findEdgeoneCacheRule(config, "/blog-26/memos/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/tags/nature/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/tags/nature/feed.xml")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/memos/feed.xml")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/_astro/app-123456.js")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.immutable
    );
    expect(
      findEdgeoneCacheRule(config, "/blog-26/pwa/1234567890abcdef/icon-any-192.png")?.headers[0]
        ?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.immutable);
    expect(
      findEdgeoneCacheRule(config, "/blog-26/pwa/undigested/icon.png")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(config.headers.some(({ source }) => source === "/blog-26/pwa/*")).toBe(false);
    expect(findEdgeoneCacheRule(config, "/blog-26/site.webmanifest")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/favicon.svg")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/favicon.ico")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/favicon-dark.ico")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(config.headers.some(({ source }) => source === "/blog-26/:rootAsset")).toBe(false);
    expect(config.headers.some(({ source }) => source === "/blog-26/f*")).toBe(true);
    expect(
      findEdgeoneCacheRule(config, "/blog-26/projects/posters/blog-26.webp")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(config.headers.some(({ source }) => source === "/blog-26/projects/*")).toBe(true);
    expect(findEdgeoneCacheRule(config, "/blog-26/api")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/blog-26/api/health")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/blog-26/api/public/assets/post/a/cover.webp")).toBe(
      undefined
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/api/v1/feed.xml")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/blog-26/mcp")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/blog-26/admin")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/blog-26/admin/")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/api/health")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/mcp")).toBeUndefined();
  });

  it("builds rules from site output and refuses an unclassified HTML page", () => {
    const unclassifiedHtmlFiles = ["unknown-route/index.html", "feed.html", "nested/feed.html"];

    for (const file of unclassifiedHtmlFiles) {
      expect(() => createEdgeoneCacheConfig("", ["index.html", file])).toThrow(
        "Public HTML route has no EdgeOne HTML cache rule"
      );
    }
  });

  it("excludes dynamic route trees and colliding HTML from public cache rules", () => {
    const config = createEdgeoneCacheConfig("/blog-26", [
      "index.html",
      "memos/index.html",
      "_astro/site.js",
      "favicon.ico",
      "api/index.html",
      "api/internal/data.json",
      "api/probe.json",
      "admin/index.html",
      "admin/static/x.js",
      "mcp/index.html",
      "mcp/internal/data.json",
      "mcp/asset.json",
    ]);

    expect(findEdgeoneCacheRule(config, "/blog-26/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/_astro/site.js")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.immutable
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/favicon.ico")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );

    for (const root of ["api", "admin", "mcp"]) {
      for (const suffix of ["", "/", "/index.html", "/probe.json", "/internal/data.json"]) {
        expect(findEdgeoneCacheRule(config, `/blog-26/${root}${suffix}`)).toBeUndefined();
        expect(findEdgeoneCacheRule(config, `/${root}${suffix}`)).toBeUndefined();
      }
    }
  });

  it("keeps nested tag pages and feeds within the EdgeOne rule limit", () => {
    const tagSegments = [
      "Hardware/Component/OperationalAmplifier",
      "HomeLab/内网穿透",
      "Software/FreeCAD",
      ...Array.from({ length: 36 }, (_, index) => `Topic/Group-${index}/Tag-${index}`),
    ];
    const tagOutputFiles = tagSegments.flatMap((tag) => [
      `tags/${tag}/index.html`,
      `tags/${tag}/feed.xml`,
    ]);
    const config = createEdgeoneCacheConfig("", [
      "index.html",
      "tags/index.html",
      ...tagOutputFiles,
      "_astro/app-123456.js",
      "_content/assets/post/example/hash/cover.webp",
      "_content/media-manifest.json",
      "site.webmanifest",
      "favicon.svg",
      "projects/posters/blog-26.webp",
      "projects/social/blog-26-640.webp",
      "atom.xml",
      "feed.json",
      "feed.xml",
      "rss.xml",
      "sitemap.xml",
    ]);

    expect(config.headers.length).toBeLessThanOrEqual(30);
    expect(
      findEdgeoneCacheRule(config, "/tags/Hardware/Component/OperationalAmplifier/")?.headers[0]
        ?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.html);
    expect(
      findEdgeoneCacheRule(config, "/tags/Hardware/Component/OperationalAmplifier/feed.xml")
        ?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(config.headers.filter(({ source }) => source === "/tags/*")).toHaveLength(1);
    expect(findEdgeoneCacheRule(config, "/api/public/assets/post/a/cover.webp")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/admin/")).toBeUndefined();
  });

  it("groups memo pagination JSON without exceeding EdgeOne rule limits", () => {
    const memoPages = Array.from({ length: 57 }, (_, index) => `memos/data/${index + 1}.json`);
    const config = createEdgeoneCacheConfig("", [
      "index.html",
      "memos/index.html",
      "memos/memo-56/index.html",
      ...memoPages,
    ]);

    expect(config.headers.length).toBeLessThanOrEqual(30);
    expect(findEdgeoneCacheRule(config, "/memos/memo-56/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/memos/data/57.json")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(config.headers.filter(({ source }) => source === "/memos/*")).toHaveLength(1);
    expect(config.headers.some(({ source }) => source === "/memos/data/57.json")).toBe(false);
  });

  it("keeps Post and Memo detail pages ahead of nested static asset rules", () => {
    const config = createEdgeoneCacheConfig("", [
      "index.html",
      "posts/index.html",
      "posts/example/index.html",
      "posts/example/metadata.json",
      "memos/index.html",
      "memos/memo-1/index.html",
      "memos/memo-1/metadata.json",
      "memos/feed.xml",
    ]);

    expect(findEdgeoneCacheRule(config, "/posts/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/posts/example/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/posts/example/metadata.json")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/memos/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/memos/memo-1/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/memos/memo-1/metadata.json")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/memos/feed.xml")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
  });

  it("groups large Post and Memo resource trees without changing detail page caching", () => {
    const postAssets = Array.from(
      { length: 120 },
      (_, index) => `posts/post-${index}/assets/cover-${index}.webp`
    );
    const memoAssets = Array.from(
      { length: 276 },
      (_, index) => `memos/memo-${index}/assets/content-${index}.webp`
    );
    const memoPages = Array.from({ length: 28 }, (_, index) => `memos/data/${index + 1}.json`);
    const config = createEdgeoneCacheConfig("", [
      "index.html",
      "posts/index.html",
      "posts/memo.with.dot/index.html",
      "memos/index.html",
      "memos/memo.with.dot/index.html",
      "memos/feed.xml",
      ...postAssets,
      ...memoAssets,
      ...memoPages,
    ]);

    expect(config.headers.length).toBeLessThanOrEqual(30);
    expect(findEdgeoneCacheRule(config, "/posts/memo.with.dot/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/memos/memo.with.dot/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(
      findEdgeoneCacheRule(config, "/posts/post-119/assets/cover-119.webp")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(
      findEdgeoneCacheRule(config, "/memos/memo-275/assets/content-275.webp")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(findEdgeoneCacheRule(config, "/memos/data/28.json")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(config.headers.filter(({ source }) => source === "/posts/:slug/*.*")).toHaveLength(1);
    expect(config.headers.filter(({ source }) => source === "/memos/*")).toHaveLength(1);
    expect(config.headers.some(({ source }) => source.includes("post-119"))).toBe(false);
    expect(config.headers.some(({ source }) => source.includes("memo-275"))).toBe(false);
  });

  it("keeps a combined public artifact within the EdgeOne rule limit", () => {
    const rootAssets = [
      "atom.xml",
      "default-avatar.svg",
      "favicon-dark.ico",
      "favicon.ico",
      "favicon.svg",
      "feed.json",
      "feed.xml",
      "file.svg",
      "globe.svg",
      "ivan-blog-mark.svg",
      "mcp",
      "next.svg",
      "robots.txt",
      "rss.xml",
      "site.webmanifest",
      "sitemap.xml",
      "vercel.svg",
      "watermark-ivanli.svg",
      "window.svg",
    ];
    const editionRoot = `_content/playbook/v2.3.3/${"a".repeat(64)}`;
    const releasePages = [
      ...Array.from({ length: 20 }, (_, index) => `posts/release-post-${index}/index.html`),
      ...Array.from({ length: 276 }, (_, index) => `memos/release-memo-${index}/index.html`),
      ...Array.from({ length: 28 }, (_, index) => `memos/data/${index + 1}.json`),
      ...Array.from({ length: 20 }, (_, index) => `tags/topic-${index}/child-${index}/index.html`),
      ...Array.from({ length: 20 }, (_, index) => `tags/topic-${index}/child-${index}/feed.xml`),
    ];
    const releaseMedia = Array.from(
      { length: 228 },
      (_, index) => `_content/assets/memo/release-memo-${index}/hash/content.webp`
    );
    const config = createEdgeoneCacheConfig("", [
      "index.html",
      "about/index.html",
      "search/index.html",
      "posts/index.html",
      "posts/example/index.html",
      "memos/index.html",
      "memos/memo-1/index.html",
      "memos/feed.xml",
      "memos/data/1.json",
      "tags/index.html",
      "tags/software/dev/index.html",
      "tags/software/dev/feed.xml",
      "projects/index.html",
      "projects/example/index.html",
      "projects/posters/example.webp",
      "_astro/app-123456.js",
      "_content/assets/post/example/hash/cover.webp",
      "_content/media-manifest.json",
      `_content/playbook/manifest.json`,
      `${editionRoot}/catalog.json`,
      `${editionRoot}/search-documents.json`,
      `${editionRoot}/public-snapshot.json`,
      `${editionRoot}/playbook-public-manifest.json`,
      `${editionRoot}/playbook-public.tar.gz`,
      `${editionRoot}/policies/safe-release/SKILL.md`,
      `${editionRoot}/policies/safe-release/scripts/verify.sh`,
      "pwa/1234567890abcdef/icon-any-192.png",
      ...releasePages,
      ...releaseMedia,
      ...rootAssets,
    ]);

    expect(config.headers.length).toBeLessThanOrEqual(30);
    expect(config.headers.some(({ source }) => source === "/:rootAsset")).toBe(false);
    expect(config.headers.some(({ source }) => source === "/f*")).toBe(true);
    expect(config.headers.some(({ source }) => source === "/r*")).toBe(true);
    expect(config.headers.some(({ source }) => source === "/w*")).toBe(true);
    expect(config.headers.some(({ source }) => source === "/at*")).toBe(true);
    expect(config.headers.some(({ source }) => source === "/a*")).toBe(false);
    for (const path of rootAssets) {
      if (path === "mcp") {
        expect(findEdgeoneCacheRule(config, `/${path}`)).toBeUndefined();
      } else {
        expect(findEdgeoneCacheRule(config, `/${path}`)?.headers[0]?.value).toBe(
          EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
        );
      }
    }
    expect(findEdgeoneCacheRule(config, "/posts/example/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/memos/memo-1/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/memos/feed.xml")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(
      findEdgeoneCacheRule(config, "/_content/assets/post/example/hash/cover.webp")?.headers[0]
        ?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.immutable);
    expect(findEdgeoneCacheRule(config, "/_content/media-manifest.json")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/tags/software/dev/feed.xml")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/search/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/search/deep-route")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    for (const path of [
      "/api",
      "/api/",
      "/api/health",
      "/api/public/snapshot",
      "/api/public/content-bundle",
      "/api/public/assets/post/a/cover.webp",
      "/api/probe",
      "/api/probe/probe",
      "/admin",
      "/admin/",
      "/admin/index.html",
      "/admin/probe",
      "/mcp",
      "/mcp/",
      "/mcp/probe",
    ]) {
      expect(findEdgeoneCacheRule(config, path)).toBeUndefined();
    }
  });

  it("keeps HTML routes ahead of project asset directory rules", () => {
    const projectOutputFiles = Array.from({ length: 40 }, (_, index) => [
      `projects/project-${index}/index.html`,
      `projects/project-${index}/assets/cover-${index}.webp`,
    ]).flat();
    const deeplyNestedProjectAssets = Array.from({ length: 20 }, (_, depth) => {
      const nestedDirectories = Array.from({ length: depth + 1 }, (_, index) => `nested-${index}`);
      return `projects/deep-${depth}/${nestedDirectories.join("/")}/asset-${depth}.webp`;
    });
    const config = createEdgeoneCacheConfig("", [
      "index.html",
      "memos/index.html",
      "memos/feed.xml",
      "projects/index.html",
      "projects/project.with.dot/index.html",
      "projects/posters/blog-26.webp",
      "projects/project-without-extension/NOTICE",
      ...projectOutputFiles,
      ...deeplyNestedProjectAssets,
    ]);

    expect(findEdgeoneCacheRule(config, "/memos/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/memos/example/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/memos/feed.xml")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/projects/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/projects/project-39/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/projects/project.with.dot/")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.html
    );
    expect(findEdgeoneCacheRule(config, "/projects/posters/blog-26.webp")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(
      findEdgeoneCacheRule(config, "/projects/project-39/assets/cover-39.webp")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(
      findEdgeoneCacheRule(config, "/projects/deep-19/nested-0/nested-1/asset-19.webp")?.headers[0]
        ?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(
      findEdgeoneCacheRule(config, "/projects/project-without-extension/NOTICE")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(config.headers.some(({ source }) => source === "/memos/*")).toBe(true);
    expect(config.headers.filter(({ source }) => source === "/projects/*")).toHaveLength(1);
    expect(config.headers.some(({ source }) => source.startsWith("/projects/:projectDir"))).toBe(
      false
    );
    expect(config.headers.some(({ source }) => source === "/projects/*.*")).toBe(false);
    expect(config.headers.some(({ source }) => source === "/_content/assets/*")).toBe(false);
    expect(config.headers.length).toBeLessThanOrEqual(30);
  });

  it("verifies the staged EdgeOne artifact config against the site output", async () => {
    const root = await mkdtemp(join(tmpdir(), "public-pwa-edgeone-artifact-"));
    temporaryRoots.push(root);
    const siteDistDir = join(root, "site-dist");
    const artifactDir = join(root, "edgeone-dist");
    await mkdir(join(siteDistDir, "memos"), { recursive: true });
    await writeFile(join(siteDistDir, "index.html"), "<main>home</main>");
    await writeFile(join(siteDistDir, "memos", "index.html"), "<main>memos</main>");
    await writeFile(join(siteDistDir, "memos", "feed.xml"), "<feed />");
    await mkdir(join(artifactDir, "memos"), { recursive: true });
    await mkdir(join(artifactDir, "edge-functions"), { recursive: true });
    await writeFile(join(artifactDir, "index.html"), "<main>home</main>");
    await writeFile(join(artifactDir, "memos", "index.html"), "<main>memos</main>");
    await writeFile(join(artifactDir, "memos", "feed.xml"), "<feed />");
    await writeFile(join(artifactDir, "edge-functions", "index.js"), "export {};");

    const generated = await prepareEdgeonePwaConfig({ siteDistDir, artifactDir });
    await expect(verifyEdgeonePwaArtifact({ siteDistDir, artifactDir })).resolves.toEqual({
      configPath: join(artifactDir, "edgeone.json"),
      ruleCount: generated.headers.length,
    });

    await writeFile(join(artifactDir, "index.html"), "<main>changed</main>");
    await expect(verifyEdgeonePwaArtifact({ siteDistDir, artifactDir })).rejects.toThrow(
      "file content differs from site output: index.html"
    );
    await writeFile(join(artifactDir, "index.html"), "<main>home</main>");

    await writeFile(join(artifactDir, "extra.txt"), "unexpected");
    await expect(verifyEdgeonePwaArtifact({ siteDistDir, artifactDir })).rejects.toThrow(
      "0 missing, 1 extra"
    );
    await rm(join(artifactDir, "extra.txt"));

    await rm(join(artifactDir, "memos", "feed.xml"));
    await expect(verifyEdgeonePwaArtifact({ siteDistDir, artifactDir })).rejects.toThrow(
      "1 missing, 0 extra"
    );
    await writeFile(join(artifactDir, "memos", "feed.xml"), "<feed />");

    const configPath = join(artifactDir, "edgeone.json");
    const written = JSON.parse(await readFile(configPath, "utf8")) as { headers: unknown[] };
    written.headers.pop();
    await writeFile(configPath, `${JSON.stringify(written)}\n`);
    await expect(verifyEdgeonePwaArtifact({ siteDistDir, artifactDir })).rejects.toThrow(
      "do not match site output"
    );
  });
});
