#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TRAILING_SLASH = /\/+$/;

function assertIncludes(content: string, needle: string, file: string) {
  if (!content.includes(needle)) {
    throw new Error(`Expected ${file} to include: ${needle}`);
  }
}

function assertExcludes(content: string, needle: string, file: string) {
  if (content.includes(needle)) {
    throw new Error(`Expected ${file} to exclude: ${needle}`);
  }
}

function assertIncludesSome(
  files: readonly string[],
  contents: ReadonlyMap<string, string>,
  needle: string
) {
  const hit = files.find((file) => contents.get(file)?.includes(needle));
  if (!hit) {
    throw new Error(`Expected one of [${files.join(", ")}] to include: ${needle}`);
  }
}

function normalizeBasePath(raw: string) {
  const value = raw.trim();
  if (!value || value === "/") return "";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const normalized = withLeadingSlash.replace(TRAILING_SLASH, "");
  return normalized === "/" ? "" : normalized;
}

function deriveBasePathFromSiteUrl(rawSiteUrl: string) {
  if (!rawSiteUrl) return "";
  try {
    return normalizeBasePath(new URL(rawSiteUrl).pathname);
  } catch {
    return "";
  }
}

function toExpectedSitePath(basePath: string, pathname: string) {
  if (!basePath) return pathname;
  return pathname === "/" ? `${basePath}/` : `${basePath}${pathname}`;
}

const rawBasePath = (process.env.PUBLIC_SITE_BASE_PATH || "").trim();
const siteUrl = (process.env.PUBLIC_SITE_URL || "").trim();
const apiBaseUrl = (process.env.PUBLIC_API_BASE_URL || "").trim();
const basePath = normalizeBasePath(rawBasePath) || deriveBasePathFromSiteUrl(siteUrl);
const siteOrigin = new URL(siteUrl).origin;
const siteHost = new URL(siteUrl).hostname;

if (!siteUrl) {
  throw new Error("PUBLIC_SITE_URL is required");
}

const checks = [
  {
    file: "site-dist/index.html",
    includes: [
      `href="${toExpectedSitePath(basePath, "/posts")}"`,
      `href="${toExpectedSitePath(basePath, "/memos")}"`,
      `href="${toExpectedSitePath(basePath, "/projects")}"`,
      `action="${toExpectedSitePath(basePath, "/search")}"`,
      `href="${toExpectedSitePath(basePath, "/rss.xml")}"`,
      `<link rel="canonical" href="${siteUrl}/"`,
    ],
    excludes: basePath
      ? ['href="/posts"', 'href="/memos"', 'action="/search"']
      : ['href="//posts"', 'href="//memos"', 'action="//search"'],
  },
  {
    file: "site-dist/posts/react-hooks-deep-dive/index.html",
    includes: [
      `href="${toExpectedSitePath(basePath, "/tags/React")}"`,
      `href="${toExpectedSitePath(basePath, "/posts/")}`,
      `<link rel="canonical" href="${siteUrl}/posts/react-hooks-deep-dive"`,
    ],
    excludes: basePath ? ['href="/tags/React"', 'href="/posts/'] : ['href="//posts/'],
  },
  {
    file: "site-dist/tags/React/index.html",
    includes: [
      `href="${toExpectedSitePath(basePath, "/tags")}"`,
      `href="${toExpectedSitePath(basePath, "/posts/react-hooks-deep-dive")}"`,
      `<link rel="canonical" href="${siteUrl}/tags/React"`,
    ],
    excludes: basePath
      ? ['href="/tags"', 'href="/posts/react-hooks-deep-dive"']
      : ['href="//tags"', 'href="//posts/react-hooks-deep-dive"'],
  },
  {
    file: "site-dist/404.html",
    includes: [`href="${toExpectedSitePath(basePath, "/")}"`],
    excludes: basePath ? ['href="/"'] : ['href="//"'],
  },
  {
    file: "site-dist/feed.xml",
    includes: [`<link>${siteUrl}/posts/react-hooks-deep-dive</link>`],
    excludes: ["/./assets/"],
  },
  {
    file: "site-dist/atom.xml",
    includes: [`<link href="${siteUrl}/posts/react-hooks-deep-dive"/>`],
    excludes: ["/./assets/"],
  },
  {
    file: "site-dist/feed.json",
    includes: [`"url": "${siteUrl}/posts/react-hooks-deep-dive"`],
    excludes: ["/./assets/"],
  },
  {
    file: "site-dist/default-avatar.svg",
    includes: ["<svg"],
    excludes: [],
  },
  {
    file: "site-dist/robots.txt",
    includes: [`Host: ${siteOrigin}`, `Sitemap: ${siteUrl}/sitemap.xml`],
    excludes: siteOrigin === siteUrl ? [] : [`Host: ${siteUrl}`],
  },
];

if (!basePath) {
  checks.push({
    file: "site-dist/CNAME",
    includes: [siteHost],
    excludes: [],
  });
}

const contents = new Map<string, string>();

for (const check of checks) {
  const absoluteFile = resolve(process.cwd(), check.file);
  const content = readFileSync(absoluteFile, "utf8");
  contents.set(check.file, content);
  for (const needle of check.includes) {
    assertIncludes(content, needle, check.file);
  }
  for (const needle of check.excludes) {
    assertExcludes(content, needle, check.file);
  }
}

if (apiBaseUrl) {
  assertIncludes(
    contents.get("site-dist/index.html") ?? "",
    `${apiBaseUrl}/api/files/`,
    "site-dist/index.html"
  );
  assertIncludes(
    contents.get("site-dist/posts/react-hooks-deep-dive/index.html") ?? "",
    `${apiBaseUrl}/api/files/`,
    "site-dist/posts/react-hooks-deep-dive/index.html"
  );

  const astroDir = resolve(process.cwd(), "site-dist/_astro");
  const astroFiles = readdirSync(astroDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => `site-dist/_astro/${name}`);

  for (const file of astroFiles) {
    contents.set(file, readFileSync(resolve(process.cwd(), file), "utf8"));
  }

  assertIncludesSome(astroFiles, contents, `PUBLIC_API_BASE_URL:"${apiBaseUrl}"`);
  assertIncludesSome(astroFiles, contents, "/api/public/search");
  assertIncludesSome(astroFiles, contents, "/api/public/comments");
  assertIncludesSome(astroFiles, contents, "/api/public/reactions");

  assertIncludes(
    contents.get("site-dist/feed.xml") ?? "",
    `${apiBaseUrl}/api/files/`,
    "site-dist/feed.xml"
  );
  assertIncludes(
    contents.get("site-dist/atom.xml") ?? "",
    `${apiBaseUrl}/api/files/`,
    "site-dist/atom.xml"
  );
  assertIncludes(
    contents.get("site-dist/feed.json") ?? "",
    `${apiBaseUrl}/api/files/`,
    "site-dist/feed.json"
  );
}

console.log(`GitHub Pages output verified for ${siteUrl}${basePath || "/"}.`);
