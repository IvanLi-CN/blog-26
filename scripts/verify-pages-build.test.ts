import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { verifyPagesBuild } from "./verify-pages-build";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { force: true, recursive: true });
  }
});

function makeTempBuildRoot() {
  const root = mkdtempSync(resolve(tmpdir(), "verify-pages-build-"));
  tempRoots.push(root);
  return root;
}

function writeBuildFile(root: string, relativePath: string, content: string) {
  const absolutePath = resolve(root, relativePath);
  mkdirSync(resolve(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

describe("verify-pages-build", () => {
  it("verifies a non-fixture static build by discovering real post and tag pages", () => {
    const cwd = makeTempBuildRoot();
    const siteUrl = "https://pages.example.test/blog-26";
    const apiBaseUrl = "https://pages.example.test";
    const basePath = "/blog-26";
    const postSlug = "ship-notes";
    const tagSlug = "observability";
    const mediaUrl = `${apiBaseUrl}/api/public/assets/post/${postSlug}/abcd1234/cover.webp`;
    const assetVersion = "2026-06-18T19%3A32%3A50.122Z";
    const versionedRelativeMediaUrl = `/api/public/assets/post/${postSlug}/abcd1234/cover.webp?v=${assetVersion}`;
    const versionedAbsoluteMediaUrl = `${mediaUrl}?v=${assetVersion}`;
    const versionedCardUrl = `/api/public/assets/post/${postSlug}/abcd1234/card.webp?v=${assetVersion}`;

    writeBuildFile(
      cwd,
      "site-dist/index.html",
      [
        `<link rel="canonical" href="${siteUrl}/">`,
        `href="${basePath}/posts/"`,
        `href="${basePath}/memos/"`,
        `href="${basePath}/projects/"`,
        `action="${basePath}/search/"`,
        `href="${basePath}/feed.xml"`,
        `<img src="${versionedCardUrl}">`,
      ].join("\n")
    );
    writeBuildFile(
      cwd,
      `site-dist/posts/${postSlug}/index.html`,
      [
        `<link rel="canonical" href="${siteUrl}/posts/${postSlug}/">`,
        `href="${basePath}/posts/"`,
        `<meta property="og:image" content="${versionedAbsoluteMediaUrl}">`,
        `<img src="${versionedRelativeMediaUrl}">`,
      ].join("\n")
    );
    writeBuildFile(
      cwd,
      `site-dist/tags/${tagSlug}/index.html`,
      [
        `<link rel="canonical" href="${siteUrl}/tags/${tagSlug}/">`,
        `href="${basePath}/tags/"`,
        `href="${basePath}/posts/${postSlug}/"`,
      ].join("\n")
    );
    writeBuildFile(cwd, "site-dist/404.html", `href="${basePath}/"`);
    writeBuildFile(
      cwd,
      "site-dist/feed.xml",
      `<rss><channel><item><link>${siteUrl}/posts/${postSlug}/</link><enclosure url="${mediaUrl}" /></item></channel></rss>`
    );
    writeBuildFile(
      cwd,
      "site-dist/atom.xml",
      `<feed><entry><link href="${siteUrl}/posts/${postSlug}/"/><link href="${mediaUrl}"/></entry></feed>`
    );
    writeBuildFile(
      cwd,
      "site-dist/feed.json",
      `{"items":[{"url":"${siteUrl}/posts/${postSlug}/","image":"${mediaUrl}"}]}`
    );
    writeBuildFile(cwd, "site-dist/default-avatar.svg", "<svg></svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli.svg", "<svg>ivanli.cc</svg>");
    writeBuildFile(
      cwd,
      "site-dist/robots.txt",
      `Host: https://pages.example.test\nSitemap: ${siteUrl}/sitemap.xml`
    );
    writeBuildFile(
      cwd,
      "site-dist/_astro/public-runtime-url.js",
      [
        `const env={PUBLIC_API_BASE_URL:"${apiBaseUrl}"};`,
        `fetch("/api/public/search");`,
        `fetch("/api/public/comments");`,
        `fetch("/api/public/reactions");`,
      ].join("\n")
    );

    expect(
      verifyPagesBuild({
        apiBaseUrl,
        cwd,
        publicSiteBasePath: `${basePath}/`,
        siteUrl,
      })
    ).toBe(`GitHub Pages output verified for ${siteUrl}${basePath}.`);
  });

  it("fails when a discovered public document still leaks raw file URLs", () => {
    const cwd = makeTempBuildRoot();
    const siteUrl = "https://ivanli.cc";
    const apiBaseUrl = "https://ivanli.cc";
    const assetVersion = "2026-06-18T19%3A32%3A50.122Z";

    writeBuildFile(
      cwd,
      "site-dist/index.html",
      [
        `<link rel="canonical" href="${siteUrl}/">`,
        `href="/posts/"`,
        `href="/memos/"`,
        `href="/projects/"`,
        `action="/search/"`,
        `href="/feed.xml"`,
        `<img src="/api/public/assets/post/release-fix/hash1234/card.webp?v=${assetVersion}">`,
        `<img src="/api/files/local/leak.webp">`,
      ].join("\n")
    );
    writeBuildFile(
      cwd,
      "site-dist/posts/release-fix/index.html",
      [
        `<link rel="canonical" href="${siteUrl}/posts/release-fix/">`,
        `href="/posts/"`,
        `<img src="/api/public/assets/post/release-fix/hash1234/cover.webp?v=${assetVersion}">`,
      ].join("\n")
    );
    writeBuildFile(
      cwd,
      "site-dist/tags/release/index.html",
      [`<link rel="canonical" href="${siteUrl}/tags/release/">`, `href="/tags/"`].join("\n")
    );
    writeBuildFile(cwd, "site-dist/404.html", 'href="/"');
    writeBuildFile(
      cwd,
      "site-dist/feed.xml",
      `<rss><channel><item><link>${siteUrl}/posts/release-fix/</link><enclosure url="${siteUrl}/api/public/assets/post/release-fix/hash1234/cover.webp" /></item></channel></rss>`
    );
    writeBuildFile(
      cwd,
      "site-dist/atom.xml",
      `<feed><entry><link href="${siteUrl}/posts/release-fix/"/><link href="${siteUrl}/api/public/assets/post/release-fix/hash1234/cover.webp"/></entry></feed>`
    );
    writeBuildFile(
      cwd,
      "site-dist/feed.json",
      `{"items":[{"url":"${siteUrl}/posts/release-fix/","image":"${siteUrl}/api/public/assets/post/release-fix/hash1234/cover.webp"}]}`
    );
    writeBuildFile(cwd, "site-dist/default-avatar.svg", "<svg></svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli.svg", "<svg>ivanli.cc</svg>");
    writeBuildFile(
      cwd,
      "site-dist/robots.txt",
      `Host: ${siteUrl}\nSitemap: ${siteUrl}/sitemap.xml`
    );
    writeBuildFile(cwd, "site-dist/CNAME", "ivanli.cc");
    writeBuildFile(
      cwd,
      "site-dist/_astro/public-runtime-url.js",
      [
        `const env={PUBLIC_API_BASE_URL:"${apiBaseUrl}"};`,
        `fetch("/api/public/search");`,
        `fetch("/api/public/comments");`,
        `fetch("/api/public/reactions");`,
      ].join("\n")
    );

    expect(() =>
      verifyPagesBuild({
        apiBaseUrl,
        cwd,
        publicSiteBasePath: "/",
        siteUrl,
      })
    ).toThrow("/api/files/");
  });

  it("fails when any generated feed drops the facade asset contract", () => {
    const cwd = makeTempBuildRoot();
    const siteUrl = "https://ivanli.cc";
    const apiBaseUrl = "https://ivanli.cc";
    const mediaUrl = `${apiBaseUrl}/api/public/assets/post/release-fix/hash1234/cover.webp`;
    const assetVersion = "2026-06-18T19%3A32%3A50.122Z";

    writeBuildFile(
      cwd,
      "site-dist/index.html",
      [
        `<link rel="canonical" href="${siteUrl}/">`,
        `href="/posts/"`,
        `href="/memos/"`,
        `href="/projects/"`,
        `action="/search/"`,
        `href="/feed.xml"`,
        `<img src="/api/public/assets/post/release-fix/hash1234/card.webp?v=${assetVersion}">`,
      ].join("\n")
    );
    writeBuildFile(
      cwd,
      "site-dist/posts/release-fix/index.html",
      [
        `<link rel="canonical" href="${siteUrl}/posts/release-fix/">`,
        `href="/posts/"`,
        `<img src="/api/public/assets/post/release-fix/hash1234/cover.webp?v=${assetVersion}">`,
      ].join("\n")
    );
    writeBuildFile(
      cwd,
      "site-dist/tags/release/index.html",
      [`<link rel="canonical" href="${siteUrl}/tags/release/">`, `href="/tags/"`].join("\n")
    );
    writeBuildFile(cwd, "site-dist/404.html", 'href="/"');
    writeBuildFile(
      cwd,
      "site-dist/feed.xml",
      `<rss><channel><item><link>${siteUrl}/posts/release-fix/</link><enclosure url="${mediaUrl}" /></item></channel></rss>`
    );
    writeBuildFile(
      cwd,
      "site-dist/atom.xml",
      `<feed><entry><link href="${siteUrl}/posts/release-fix/"/><link href="${mediaUrl}"/></entry></feed>`
    );
    writeBuildFile(
      cwd,
      "site-dist/feed.json",
      `{"items":[{"url":"${siteUrl}/posts/release-fix/","image":"https://cdn.example.test/release-fix.webp"}]}`
    );
    writeBuildFile(cwd, "site-dist/default-avatar.svg", "<svg></svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli.svg", "<svg>ivanli.cc</svg>");
    writeBuildFile(
      cwd,
      "site-dist/robots.txt",
      `Host: ${siteUrl}\nSitemap: ${siteUrl}/sitemap.xml`
    );
    writeBuildFile(cwd, "site-dist/CNAME", "ivanli.cc");
    writeBuildFile(
      cwd,
      "site-dist/_astro/public-runtime-url.js",
      [
        `const env={PUBLIC_API_BASE_URL:"${apiBaseUrl}"};`,
        `fetch("/api/public/search");`,
        `fetch("/api/public/comments");`,
        `fetch("/api/public/reactions");`,
      ].join("\n")
    );

    expect(() =>
      verifyPagesBuild({
        apiBaseUrl,
        cwd,
        publicSiteBasePath: "/",
        siteUrl,
      })
    ).toThrow(`${apiBaseUrl}/api/public/assets/`);
  });

  it("fails when build-time card or cover facade urls miss the snapshot version query", () => {
    const cwd = makeTempBuildRoot();
    const siteUrl = "https://ivanli.cc";
    const apiBaseUrl = "https://ivanli.cc";

    writeBuildFile(
      cwd,
      "site-dist/index.html",
      [
        `<link rel="canonical" href="${siteUrl}/">`,
        `href="/posts/"`,
        `href="/memos/"`,
        `href="/projects/"`,
        `action="/search/"`,
        `href="/feed.xml"`,
        `<img src="/api/public/assets/post/release-fix/hash1234/card.webp">`,
      ].join("\n")
    );
    writeBuildFile(
      cwd,
      "site-dist/posts/release-fix/index.html",
      [
        `<link rel="canonical" href="${siteUrl}/posts/release-fix/">`,
        `href="/posts/"`,
        `<meta property="og:image" content="${siteUrl}/api/public/assets/post/release-fix/hash1234/cover.webp">`,
      ].join("\n")
    );
    writeBuildFile(
      cwd,
      "site-dist/tags/release/index.html",
      [`<link rel="canonical" href="${siteUrl}/tags/release/">`, `href="/tags/"`].join("\n")
    );
    writeBuildFile(cwd, "site-dist/404.html", 'href="/"');
    writeBuildFile(
      cwd,
      "site-dist/feed.xml",
      `<rss><channel><item><link>${siteUrl}/posts/release-fix/</link><enclosure url="${siteUrl}/api/public/assets/post/release-fix/hash1234/cover.webp" /></item></channel></rss>`
    );
    writeBuildFile(
      cwd,
      "site-dist/atom.xml",
      `<feed><entry><link href="${siteUrl}/posts/release-fix/"/><link href="${siteUrl}/api/public/assets/post/release-fix/hash1234/cover.webp"/></entry></feed>`
    );
    writeBuildFile(
      cwd,
      "site-dist/feed.json",
      `{"items":[{"url":"${siteUrl}/posts/release-fix/","image":"${siteUrl}/api/public/assets/post/release-fix/hash1234/cover.webp"}]}`
    );
    writeBuildFile(cwd, "site-dist/default-avatar.svg", "<svg></svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli.svg", "<svg>ivanli.cc</svg>");
    writeBuildFile(
      cwd,
      "site-dist/robots.txt",
      `Host: ${siteUrl}\nSitemap: ${siteUrl}/sitemap.xml`
    );
    writeBuildFile(cwd, "site-dist/CNAME", "ivanli.cc");
    writeBuildFile(
      cwd,
      "site-dist/_astro/public-runtime-url.js",
      [
        `const env={PUBLIC_API_BASE_URL:"${apiBaseUrl}"};`,
        `fetch("/api/public/search");`,
        `fetch("/api/public/comments");`,
        `fetch("/api/public/reactions");`,
      ].join("\n")
    );

    expect(() =>
      verifyPagesBuild({
        apiBaseUrl,
        cwd,
        publicSiteBasePath: "/",
        siteUrl,
      })
    ).toThrow("version build-time public asset URL with ?v=");
  });
});
