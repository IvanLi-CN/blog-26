import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { extractBuildTimePublicAssetUrls, verifyPagesBuild } from "./verify-pages-build";

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

function writeV3WatermarkFiles(root: string) {
  writeBuildFile(root, "site-dist/watermark-ivanli-a.light.v3.svg", "<svg fill='#fff'></svg>");
  writeBuildFile(root, "site-dist/watermark-ivanli-a.dark.v3.svg", "<svg fill='#24352d'></svg>");
  writeBuildFile(
    root,
    "site-dist/watermark-ivanli-b.light.v3.svg",
    "<svg fill='#fff'><g class='watermark-domain'><path d='M0 0L1 1'/></g></svg>"
  );
  writeBuildFile(
    root,
    "site-dist/watermark-ivanli-b.dark.v3.svg",
    "<svg fill='#24352d'><g class='watermark-domain'><path d='M0 0L1 1'/></g></svg>"
  );
  writeBuildFile(
    root,
    "site-dist/watermark-ivanli-a.light.v4.svg",
    "<svg viewBox='0 0 796 572' fill='#fff'></svg>"
  );
  writeBuildFile(
    root,
    "site-dist/watermark-ivanli-a.dark.v4.svg",
    "<svg viewBox='0 0 796 572' fill='#24352d'></svg>"
  );
  writeBuildFile(
    root,
    "site-dist/watermark-ivanli-a.light.v5.svg",
    '<svg viewBox="0 0 150 105" fill="#fff"></svg>'
  );
  writeBuildFile(
    root,
    "site-dist/watermark-ivanli-a.dark.v5.svg",
    '<svg viewBox="0 0 150 105" fill="#24352d"></svg>'
  );
}

describe("verify-pages-build", () => {
  it("checks browser media references independently of serialized island props", () => {
    const url = "/api/public/assets/post/hello/hash/cover.webp";
    const content = [
      `<astro-island props="{&quot;image&quot;:[0,&quot;${url}&quot;]}">`,
      `<img src="${url}?v=snapshot&amp;format=webp">`,
      "</astro-island>",
      `<style>.cover { background: url('${url}?v=snapshot'); }</style>`,
      `<script type="application/ld+json">{"image":"${url}?v=snapshot"}</script>`,
    ].join("\n");
    expect(extractBuildTimePublicAssetUrls(content)).toEqual([
      `${url}?v=snapshot&format=webp`,
      `${url}?v=snapshot`,
      `${url}?v=snapshot`,
    ]);
    expect(extractBuildTimePublicAssetUrls(`<img src="${url}">`)).toEqual([url]);
  });

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
    const versionedContentUrl = `/api/public/assets/post/${postSlug}/abcd1234/content.webp?v=${assetVersion}`;

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
        `<a data-testid="post-card-cover"><img src="${versionedCardUrl}"></a>`,
        `<img src="${versionedContentUrl}">`,
        `<img src="/api/public/assets/post/${postSlug}/abcd1234/content.webp">`,
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
    writeBuildFile(cwd, "site-dist/site-assets/default-avatar.svg", "<svg></svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli.svg", "<svg>ivanli.cc</svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli-a.v1.svg", "<svg viewBox='0 0 1 1'></svg>");
    writeBuildFile(
      cwd,
      "site-dist/watermark-ivanli-b.v1.svg",
      "<svg viewBox='0 0 1 1'><g class='watermark-domain'><path d='M0 0L1 1'/></g></svg>"
    );
    writeV3WatermarkFiles(cwd);
    writeBuildFile(
      cwd,
      "site-dist/robots.txt",
      `Host: https://pages.example.test\nSitemap: ${siteUrl}/sitemap.xml`
    );
    writeBuildFile(
      cwd,
      "site-dist/_astro/public-runtime-url.js",
      [
        `const env={PUBLIC_API_BASE_URL:\`${apiBaseUrl}\`};`,
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
    ).toBe(`Frontend static output verified for ${siteUrl}${basePath}.`);
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
    writeBuildFile(cwd, "site-dist/site-assets/default-avatar.svg", "<svg></svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli.svg", "<svg>ivanli.cc</svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli-a.v1.svg", "<svg viewBox='0 0 1 1'></svg>");
    writeBuildFile(
      cwd,
      "site-dist/watermark-ivanli-b.v1.svg",
      "<svg viewBox='0 0 1 1'><g class='watermark-domain'><path d='M0 0L1 1'/></g></svg>"
    );
    writeV3WatermarkFiles(cwd);
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
    writeBuildFile(cwd, "site-dist/site-assets/default-avatar.svg", "<svg></svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli.svg", "<svg>ivanli.cc</svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli-a.v1.svg", "<svg viewBox='0 0 1 1'></svg>");
    writeBuildFile(
      cwd,
      "site-dist/watermark-ivanli-b.v1.svg",
      "<svg viewBox='0 0 1 1'><g class='watermark-domain'><path d='M0 0L1 1'/></g></svg>"
    );
    writeV3WatermarkFiles(cwd);
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
    writeBuildFile(cwd, "site-dist/site-assets/default-avatar.svg", "<svg></svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli.svg", "<svg>ivanli.cc</svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli-a.v1.svg", "<svg viewBox='0 0 1 1'></svg>");
    writeBuildFile(
      cwd,
      "site-dist/watermark-ivanli-b.v1.svg",
      "<svg viewBox='0 0 1 1'><g class='watermark-domain'><path d='M0 0L1 1'/></g></svg>"
    );
    writeV3WatermarkFiles(cwd);
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

  it("fails when the outlined watermark domain group has no drawable paths", () => {
    const cwd = makeTempBuildRoot();
    const siteUrl = "https://pages.example.test/blog-26";

    writeBuildFile(
      cwd,
      "site-dist/index.html",
      [
        `<link rel="canonical" href="${siteUrl}/">`,
        `href="/blog-26/posts/"`,
        `href="/blog-26/memos/"`,
        `href="/blog-26/projects/"`,
        `action="/blog-26/search/"`,
        `href="/blog-26/feed.xml"`,
      ].join("\n")
    );
    writeBuildFile(cwd, "site-dist/404.html", 'href="/blog-26/"');
    writeBuildFile(cwd, "site-dist/feed.xml", "<rss></rss>");
    writeBuildFile(cwd, "site-dist/atom.xml", "<feed></feed>");
    writeBuildFile(cwd, "site-dist/feed.json", "{}");
    writeBuildFile(cwd, "site-dist/site-assets/default-avatar.svg", "<svg></svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli.svg", "<svg>ivanli.cc</svg>");
    writeBuildFile(cwd, "site-dist/watermark-ivanli-a.v1.svg", "<svg viewBox='0 0 1 1'></svg>");
    writeBuildFile(
      cwd,
      "site-dist/watermark-ivanli-b.v1.svg",
      "<svg viewBox='0 0 1 1'><g class='watermark-domain'><path d='M0 0M4 4'/><path d='M0 0Z'/><path d='M4 4L4 4'/><path d='M0 0A1 1 0 0 0 0 0'/></g></svg>"
    );
    writeV3WatermarkFiles(cwd);
    writeBuildFile(
      cwd,
      "site-dist/robots.txt",
      `Host: https://pages.example.test\nSitemap: ${siteUrl}/sitemap.xml`
    );

    expect(() => verifyPagesBuild({ cwd, siteUrl })).toThrow(
      "a drawable path in g.watermark-domain"
    );
  });
});
