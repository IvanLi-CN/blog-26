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
  delete process.env.PUBLIC_SITE_URL;
  delete process.env.PUBLIC_SITE_BASE_PATH;
  delete (globalThis as typeof globalThis & { window?: Window }).window;
});

describe("public-runtime-url", () => {
  it("uses PUBLIC_API_BASE_URL for api and asset URLs", () => {
    process.env.PUBLIC_API_BASE_URL = "https://api.example.test/";

    expect(getPublicApiBaseUrl()).toBe("https://api.example.test");
    expect(toPublicApiUrl("/api/public/posts")).toBe("https://api.example.test/api/public/posts");
    expect(toPublicAssetUrl("/api/files/local/foo.png")).toBe(
      "https://api.example.test/api/files/local/foo.png"
    );
  });

  it("prefers the current browser origin when the browser is already running", () => {
    (globalThis as typeof globalThis & { window?: Window }).window = {
      location: {
        origin: "http://127.0.0.1:25110",
      },
    } as Window;
    process.env.PUBLIC_API_BASE_URL = "https://api.example.test/";

    expect(getPublicApiBaseUrl()).toBe("http://127.0.0.1:25110");
    expect(toPublicApiUrl("/api/public/posts")).toBe("http://127.0.0.1:25110/api/public/posts");
    expect(toPublicAssetUrl("/api/files/local/foo.png")).toBe(
      "http://127.0.0.1:25110/api/files/local/foo.png"
    );
  });

  it("keeps server-side rendering bound to PUBLIC_API_BASE_URL when no browser origin exists", () => {
    process.env.PUBLIC_API_BASE_URL = "https://ivanli.cc";

    expect(getPublicApiBaseUrl()).toBe("https://ivanli.cc");
    expect(toPublicApiUrl("/api/public/posts")).toBe("https://ivanli.cc/api/public/posts");
  });

  it("falls back to the current browser origin when no public api base is configured", () => {
    (globalThis as typeof globalThis & { window?: Window }).window = {
      location: {
        origin: "http://127.0.0.1:25110",
      },
    } as Window;

    expect(getPublicApiBaseUrl()).toBe("http://127.0.0.1:25110");
    expect(toPublicApiUrl("/api/public/posts")).toBe("http://127.0.0.1:25110/api/public/posts");
    expect(toPublicAssetUrl("/api/files/local/foo.png")).toBe(
      "http://127.0.0.1:25110/api/files/local/foo.png"
    );
  });

  it("keeps relative paths untouched when neither public api base nor browser origin is configured", () => {
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
      "/blog-26/posts/react-hooks-deep-dive/"
    );
    expect(toPublicSitePath("/search?q=React")).toBe("/blog-26/search/?q=React");
  });

  it("keeps public site routes root-relative when PUBLIC_SITE_BASE_PATH is /", () => {
    process.env.PUBLIC_SITE_URL = "https://ivanli.cc";
    process.env.PUBLIC_SITE_BASE_PATH = "/";

    expect(getPublicSiteUrl()).toBe("https://ivanli.cc");
    expect(getPublicSiteBasePath()).toBe("");
    expect(toPublicSitePath("/")).toBe("/");
    expect(toPublicSitePath("/posts")).toBe("/posts/");
    expect(toPublicSitePath("/posts/react-hooks-deep-dive")).toBe("/posts/react-hooks-deep-dive/");
    expect(toPublicSitePath("/search?q=React")).toBe("/search/?q=React");
    expect(toPublicSitePath("/tags/Hardware#posts")).toBe("/tags/Hardware/#posts");
  });

  it("keeps api routes and static asset routes unchanged", () => {
    process.env.PUBLIC_SITE_BASE_PATH = "/blog-26";

    expect(toPublicSitePath("/api/public/search?q=React")).toBe("/api/public/search?q=React");
    expect(toPublicSitePath("/admin/preview/memos/test")).toBe("/admin/preview/memos/test");
    expect(toPublicSitePath("/_astro/BaseLayout.css")).toBe("/_astro/BaseLayout.css");
    expect(toPublicSitePath("/feed.xml")).toBe("/blog-26/feed.xml");
    expect(toPublicSitePath("/favicon.ico")).toBe("/blog-26/favicon.ico");
    expect(toPublicSitePath("/press.html")).toBe("/blog-26/press.html");
  });

  it("does not duplicate base paths while normalizing page routes", () => {
    process.env.PUBLIC_SITE_BASE_PATH = "/blog-26";

    expect(toPublicSitePath("/blog-26/posts/react-hooks-deep-dive")).toBe(
      "/blog-26/posts/react-hooks-deep-dive/"
    );
    expect(toPublicSitePath("/blog-26/search?q=React")).toBe("/blog-26/search/?q=React");
  });

  it("derives a project base path from PUBLIC_SITE_URL when no explicit base path is set", () => {
    process.env.PUBLIC_SITE_URL = "https://pages.example.test/blog-26";

    expect(getPublicSiteBasePath()).toBe("/blog-26");
    expect(toPublicSitePath("/posts/react-hooks-deep-dive")).toBe(
      "/blog-26/posts/react-hooks-deep-dive/"
    );
  });
});
