#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const basePath = (process.env.PUBLIC_SITE_BASE_PATH || "").trim();
const siteUrl = (process.env.PUBLIC_SITE_URL || "").trim();
const apiBaseUrl = (process.env.PUBLIC_API_BASE_URL || "").trim();
const siteOrigin = new URL(siteUrl).origin;

if (!basePath || !siteUrl) {
  throw new Error("PUBLIC_SITE_URL and PUBLIC_SITE_BASE_PATH are required");
}

const checks = [
  {
    file: "site-dist/index.html",
    includes: [
      `href="${basePath}/posts"`,
      `href="${basePath}/memos"`,
      `href="${basePath}/projects"`,
      `action="${basePath}/search"`,
      `href="${basePath}/rss.xml"`,
      `<link rel="canonical" href="${siteUrl}/"`,
    ],
    excludes: ['href="/posts"', 'href="/memos"', 'action="/search"'],
  },
  {
    file: "site-dist/posts/react-hooks-deep-dive/index.html",
    includes: [
      `href="${basePath}/tags/React"`,
      `href="${basePath}/posts/`,
      `<link rel="canonical" href="${siteUrl}/posts/react-hooks-deep-dive"`,
    ],
    excludes: ['href="/tags/React"', 'href="/posts/'],
  },
  {
    file: "site-dist/tags/React/index.html",
    includes: [
      `href="${basePath}/tags"`,
      `href="${basePath}/posts/react-hooks-deep-dive"`,
      `<link rel="canonical" href="${siteUrl}/tags/React"`,
    ],
    excludes: ['href="/tags"', 'href="/posts/react-hooks-deep-dive"'],
  },
  {
    file: "site-dist/404.html",
    includes: [`href="${basePath}/"`],
    excludes: ['href="/"'],
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

console.log("GitHub Pages project-path output verified.");
