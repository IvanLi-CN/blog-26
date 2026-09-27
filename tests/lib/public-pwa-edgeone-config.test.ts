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
  it("covers public pages and assets at a base path without matching API or admin", () => {
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
      "_astro/app-123456.js",
      "_content/assets/post/example/hash/cover.webp",
      "pwa/1234567890abcdef/icon-any-192.png",
      "pwa/undigested/icon.png",
      "site.webmanifest",
      "favicon.svg",
      "favicon.ico",
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
    expect(config.headers.some(({ source }) => source === "/blog-26/f*")).toBe(true);
    expect(
      findEdgeoneCacheRule(config, "/blog-26/projects/posters/blog-26.webp")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(
      config.headers.some(({ source }) => source === "/blog-26/projects/:projectDir1/*.webp")
    ).toBe(true);
    expect(findEdgeoneCacheRule(config, "/api/health")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/api/public/assets/post/a/cover.webp")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/api/v1/feed.xml")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/mcp")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/admin/")).toBeUndefined();
  });

  it("builds rules from site output and refuses an unclassified HTML page", () => {
    const unclassifiedHtmlFiles = ["unknown-route/index.html", "feed.html", "nested/feed.html"];

    for (const file of unclassifiedHtmlFiles) {
      expect(() => createEdgeoneCacheConfig("", ["index.html", file])).toThrow(
        "Public HTML route has no EdgeOne HTML cache rule"
      );
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
    expect(config.headers.filter(({ source }) => source === "/tags/*/feed.xml")).toHaveLength(1);
    expect(findEdgeoneCacheRule(config, "/api/public/assets/post/a/cover.webp")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/admin/")).toBeUndefined();
  });

  it("keeps HTML routes ahead of project asset wildcards and narrows overlapping assets", () => {
    const projectOutputFiles = Array.from({ length: 40 }, (_, index) => [
      `projects/project-${index}/index.html`,
      `projects/project-${index}/assets/cover-${index}.webp`,
    ]).flat();
    const config = createEdgeoneCacheConfig("", [
      "index.html",
      "memos/index.html",
      "memos/feed.xml",
      "projects/index.html",
      "projects/posters/blog-26.webp",
      ...projectOutputFiles,
    ]);

    expect(findEdgeoneCacheRule(config, "/memos/")?.headers[0]?.value).toBe(
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
    expect(findEdgeoneCacheRule(config, "/projects/posters/blog-26.webp")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(
      findEdgeoneCacheRule(config, "/projects/project-39/assets/cover-39.webp")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(config.headers.some(({ source }) => source === "/memos/*")).toBe(false);
    expect(
      config.headers.some(({ source }) => source === "/projects/:projectDir1/:projectDir2/*.webp")
    ).toBe(true);
    expect(config.headers.some(({ source }) => source === "/projects/*")).toBe(false);
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

    const generated = await prepareEdgeonePwaConfig({ siteDistDir, artifactDir });
    await expect(verifyEdgeonePwaArtifact({ siteDistDir, artifactDir })).resolves.toEqual({
      configPath: join(artifactDir, "edgeone.json"),
      ruleCount: generated.headers.length,
    });

    const configPath = join(artifactDir, "edgeone.json");
    const written = JSON.parse(await readFile(configPath, "utf8")) as { headers: unknown[] };
    written.headers.pop();
    await writeFile(configPath, `${JSON.stringify(written)}\n`);
    await expect(verifyEdgeonePwaArtifact({ siteDistDir, artifactDir })).rejects.toThrow(
      "do not match site output"
    );
  });
});
