import { describe, expect, it } from "bun:test";
import {
  getPublicStaticCacheControl,
  PUBLIC_HTML_CACHE_CONTROL,
  REVALIDATED_PUBLIC_ASSET_CACHE_CONTROL,
  VERSIONED_PUBLIC_ASSET_CACHE_CONTROL,
} from "../../src/lib/public-static-cache-policy";

describe("public static cache policy", () => {
  it("revalidates public HTML after a short online-first freshness window", () => {
    expect(
      getPublicStaticCacheControl("/posts/example/", "/site-dist/posts/example/index.html")
    ).toBe(PUBLIC_HTML_CACHE_CONTROL);
  });

  it("keeps only content-versioned static resources immutable", () => {
    expect(
      getPublicStaticCacheControl(
        "/blog-26/_astro/site-a12bcdef.js",
        "/site-dist/_astro/site-a12bcdef.js"
      )
    ).toBe(VERSIONED_PUBLIC_ASSET_CACHE_CONTROL);
    expect(
      getPublicStaticCacheControl(
        "/blog-26/pwa/1234567890abcdef/icon-192.png",
        "/site-dist/pwa/icon.png"
      )
    ).toBe(VERSIONED_PUBLIC_ASSET_CACHE_CONTROL);
    expect(
      getPublicStaticCacheControl(
        "/_content/assets/post/slug/hash/cover.webp",
        "/site-dist/media.webp"
      )
    ).toBe(VERSIONED_PUBLIC_ASSET_CACHE_CONTROL);
  });

  it("revalidates stable assets and leaves non-success, API, and admin paths alone", () => {
    expect(getPublicStaticCacheControl("/site.webmanifest", "/site-dist/site.webmanifest")).toBe(
      REVALIDATED_PUBLIC_ASSET_CACHE_CONTROL
    );
    expect(getPublicStaticCacheControl("/favicon.ico", "/site-dist/favicon.ico")).toBe(
      REVALIDATED_PUBLIC_ASSET_CACHE_CONTROL
    );
    expect(
      getPublicStaticCacheControl("/api/public/assets/post/a/cover.webp", "/site-dist/cover.webp")
    ).toBeNull();
    expect(getPublicStaticCacheControl("/admin/index.html", "/admin/index.html")).toBeNull();
    expect(getPublicStaticCacheControl("/missing/", "/site-dist/404.html", 404)).toBeNull();
  });
});
