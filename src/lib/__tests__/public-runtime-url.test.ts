import { afterEach, describe, expect, it } from "bun:test";
import {
  getPublicApiBaseUrl,
  getPublicSiteBasePath,
  getPublicSiteUrl,
  toPublicApiUrl,
  toPublicAssetUrl,
  toPublicSitePath,
} from "@/lib/public-runtime-url";

afterEach(() => {
  delete process.env.PUBLIC_API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  delete process.env.PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.PUBLIC_SITE_BASE_PATH;
  delete process.env.NEXT_PUBLIC_SITE_BASE_PATH;
});

describe("public-runtime-url", () => {
  it("uses PUBLIC_API_BASE_URL for api and asset URLs", () => {
    process.env.PUBLIC_API_BASE_URL = "https://api.example.test/";

    expect(getPublicApiBaseUrl()).toBe("https://api.example.test");
    expect(toPublicApiUrl("/api/public/posts")).toBe("https://api.example.test/api/public/posts");
    expect(toPublicAssetUrl("/api/files/webdav/foo.png")).toBe(
      "https://api.example.test/api/files/webdav/foo.png"
    );
  });

  it("keeps relative paths untouched when no public api base is configured", () => {
    expect(getPublicApiBaseUrl()).toBe("");
    expect(toPublicApiUrl("/api/public/posts")).toBe("/api/public/posts");
    expect(toPublicAssetUrl("/images/foo.png")).toBe("/images/foo.png");
  });

  it("prefixes public site routes with PUBLIC_SITE_BASE_PATH", () => {
    process.env.PUBLIC_SITE_URL = "https://pages.example.test/blog-26";
    process.env.PUBLIC_SITE_BASE_PATH = "/blog-26/";

    expect(getPublicSiteUrl()).toBe("https://pages.example.test/blog-26");
    expect(getPublicSiteBasePath()).toBe("/blog-26");
    expect(toPublicSitePath("/")).toBe("/blog-26/");
    expect(toPublicSitePath("/posts/react-hooks-deep-dive")).toBe(
      "/blog-26/posts/react-hooks-deep-dive"
    );
    expect(toPublicSitePath("/search?q=React")).toBe("/blog-26/search?q=React");
  });

  it("keeps public site routes root-relative when PUBLIC_SITE_BASE_PATH is /", () => {
    process.env.PUBLIC_SITE_URL = "https://ivanli.cc";
    process.env.PUBLIC_SITE_BASE_PATH = "/";

    expect(getPublicSiteUrl()).toBe("https://ivanli.cc");
    expect(getPublicSiteBasePath()).toBe("");
    expect(toPublicSitePath("/")).toBe("/");
    expect(toPublicSitePath("/posts/react-hooks-deep-dive")).toBe("/posts/react-hooks-deep-dive");
    expect(toPublicSitePath("/search?q=React")).toBe("/search?q=React");
  });

  it("keeps api routes and already-prefixed site routes unchanged", () => {
    process.env.PUBLIC_SITE_BASE_PATH = "/blog-26";

    expect(toPublicSitePath("/api/public/search?q=React")).toBe("/api/public/search?q=React");
    expect(toPublicSitePath("/admin/preview/memos/test")).toBe("/admin/preview/memos/test");
    expect(toPublicSitePath("/blog-26/posts/react-hooks-deep-dive")).toBe(
      "/blog-26/posts/react-hooks-deep-dive"
    );
  });

  it("derives a project base path from PUBLIC_SITE_URL when no explicit base path is set", () => {
    process.env.PUBLIC_SITE_URL = "https://pages.example.test/blog-26";

    expect(getPublicSiteBasePath()).toBe("/blog-26");
    expect(toPublicSitePath("/posts/react-hooks-deep-dive")).toBe(
      "/blog-26/posts/react-hooks-deep-dive"
    );
  });
});
