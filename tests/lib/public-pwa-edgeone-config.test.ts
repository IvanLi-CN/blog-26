import { describe, expect, it } from "bun:test";
import {
  createEdgeoneCacheConfig,
  EDGEONE_PUBLIC_CACHE_CONTROL,
  findEdgeoneCacheRule,
} from "../../scripts/prepare-edgeone-pwa-config";

describe("EdgeOne public PWA cache config", () => {
  it("covers public pages and assets at a base path without matching API or admin", () => {
    const config = createEdgeoneCacheConfig("/blog-26", [
      "index.html",
      "about/index.html",
      "search/index.html",
      "posts/index.html",
      "posts/example/index.html",
      "memos/index.html",
      "tags/index.html",
      "tags/nature/index.html",
      "projects/index.html",
      "projects/blog-26/index.html",
      "_astro/app-123456.js",
      "_content/assets/post/example/hash/cover.webp",
      "pwa/1234567890abcdef/icon-any-192.png",
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
    expect(findEdgeoneCacheRule(config, "/blog-26/_astro/app-123456.js")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.immutable
    );
    expect(
      findEdgeoneCacheRule(config, "/blog-26/pwa/1234567890abcdef/icon-any-192.png")?.headers[0]
        ?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.immutable);
    expect(findEdgeoneCacheRule(config, "/blog-26/site.webmanifest")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/favicon.svg")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(findEdgeoneCacheRule(config, "/blog-26/favicon.ico")?.headers[0]?.value).toBe(
      EDGEONE_PUBLIC_CACHE_CONTROL.revalidate
    );
    expect(
      findEdgeoneCacheRule(config, "/blog-26/projects/posters/blog-26.webp")?.headers[0]?.value
    ).toBe(EDGEONE_PUBLIC_CACHE_CONTROL.revalidate);
    expect(findEdgeoneCacheRule(config, "/api/health")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/api/public/assets/post/a/cover.webp")).toBeUndefined();
    expect(findEdgeoneCacheRule(config, "/admin/")).toBeUndefined();
  });

  it("builds rules from site output and refuses an unclassified HTML page", () => {
    expect(() => createEdgeoneCacheConfig("", ["index.html", "unknown-route/index.html"])).toThrow(
      "Public HTML route has no EdgeOne HTML cache rule"
    );
  });
});
