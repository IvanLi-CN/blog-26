#!/usr/bin/env bun

import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TRAILING_SLASH = /\/+$/;
const SITE_DIST_DIR = "site-dist";
const FEED_FILES = ["site-dist/feed.xml", "site-dist/atom.xml", "site-dist/feed.json"] as const;
const BUILD_TIME_PUBLIC_ASSET_PATTERN =
  /(?:https?:\/\/[^"'`\s]+)?\/api\/public\/assets\/[^"'`\s?#]+\/(?:card|cover)\.[^"'`\s?#]+(?:\?[^"'`\s]*)?/g;

type FileCheck = {
  file: string;
  includes: string[];
  excludes: string[];
};

export type VerifyPagesBuildOptions = {
  apiBaseUrl?: string;
  cwd?: string;
  publicSiteBasePath?: string;
  siteUrl: string;
};

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

function assertSameOriginPublicApiBaseUrl(siteUrl: string, apiBaseUrl: string) {
  const siteOrigin = new URL(siteUrl).origin;
  const apiOrigin = new URL(apiBaseUrl).origin;
  if (siteOrigin !== apiOrigin) {
    throw new Error(
      [
        `Expected PUBLIC_API_BASE_URL (${apiBaseUrl}) to share the same origin as PUBLIC_SITE_URL (${siteUrl}).`,
        "This static build emits /api/public/assets/* facade URLs and therefore requires a same-origin live backend/gateway on the public domain.",
      ].join(" ")
    );
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

function toExpectedPagePath(basePath: string, pathname: string) {
  const pagePath = pathname === "/" || pathname.endsWith("/") ? pathname : `${pathname}/`;
  return toExpectedSitePath(basePath, pagePath);
}

function readContent(cwd: string, contents: Map<string, string>, file: string) {
  if (!contents.has(file)) {
    contents.set(file, readFileSync(resolve(cwd, file), "utf8"));
  }
  return contents.get(file) ?? "";
}

function extractBuildTimePublicAssetUrls(content: string) {
  return content.match(BUILD_TIME_PUBLIC_ASSET_PATTERN) ?? [];
}

function listBuildFiles(
  cwd: string,
  directory: string,
  matcher: (relativeFile: string) => boolean
) {
  const root = resolve(cwd, directory);
  if (!existsSync(root)) return [];

  const files: string[] = [];
  const walk = (relativeDir: string) => {
    const absoluteDir = resolve(root, relativeDir);
    const entries = readdirSync(absoluteDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const entry of entries) {
      const nextRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(nextRelative);
        continue;
      }
      const relativeFile = `${directory}/${nextRelative}`;
      if (matcher(relativeFile)) {
        files.push(relativeFile);
      }
    }
  };

  walk("");
  return files;
}

function listSectionDetailPages(cwd: string, section: "posts" | "tags") {
  const sectionDir = resolve(cwd, SITE_DIST_DIR, section);
  if (!existsSync(sectionDir)) return [];

  const entries = readdirSync(sectionDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((entry): entry is Dirent => entry.isDirectory());

  return entries
    .map((entry) => `${SITE_DIST_DIR}/${section}/${entry.name}/index.html`)
    .filter((file) => existsSync(resolve(cwd, file)));
}

function toBuiltHtmlRoute(file: string) {
  if (!file.startsWith(`${SITE_DIST_DIR}/`) || !file.endsWith(".html")) {
    throw new Error(`Cannot derive route from non-html build output: ${file}`);
  }

  const withoutRoot = file.slice(SITE_DIST_DIR.length);
  if (withoutRoot === "/index.html") return "/";
  if (withoutRoot.endsWith("/index.html")) {
    return withoutRoot.slice(0, -"index.html".length);
  }
  return `${withoutRoot.slice(0, -".html".length)}/`;
}

function buildDynamicChecks(
  cwd: string,
  basePath: string,
  siteHost: string,
  siteOrigin: string,
  siteUrl: string
) {
  const checks: FileCheck[] = [
    {
      file: "site-dist/index.html",
      includes: [
        `href="${toExpectedPagePath(basePath, "/posts")}"`,
        `href="${toExpectedPagePath(basePath, "/memos")}"`,
        `href="${toExpectedPagePath(basePath, "/projects")}"`,
        `action="${toExpectedPagePath(basePath, "/search")}"`,
        `href="${toExpectedSitePath(basePath, "/feed.xml")}"`,
        `<link rel="canonical" href="${siteUrl}/"`,
      ],
      excludes: basePath
        ? ['href="/posts"', 'href="/memos"', 'action="/search"']
        : ['href="//posts"', 'href="//memos"', 'action="//search"'],
    },
    {
      file: "site-dist/404.html",
      includes: [`href="${toExpectedSitePath(basePath, "/")}"`],
      excludes: basePath ? ['href="/"'] : ['href="//"'],
    },
    {
      file: "site-dist/feed.xml",
      includes: [],
      excludes: ["/./assets/"],
    },
    {
      file: "site-dist/atom.xml",
      includes: [],
      excludes: ["/./assets/"],
    },
    {
      file: "site-dist/feed.json",
      includes: [],
      excludes: ["/./assets/"],
    },
    {
      file: "site-dist/default-avatar.svg",
      includes: ["<svg"],
      excludes: [],
    },
    {
      file: "site-dist/watermark-ivanli.svg",
      includes: ["<svg", "ivanli.cc"],
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

  const samplePostPage = listSectionDetailPages(cwd, "posts")[0];
  if (samplePostPage) {
    checks.push({
      file: samplePostPage,
      includes: [
        `href="${toExpectedPagePath(basePath, "/posts")}"`,
        `<link rel="canonical" href="${siteUrl}${toBuiltHtmlRoute(samplePostPage)}"`,
      ],
      excludes: basePath ? ['href="/posts"'] : ['href="//posts/'],
    });
  }

  const sampleTagPage = listSectionDetailPages(cwd, "tags")[0];
  if (sampleTagPage) {
    checks.push({
      file: sampleTagPage,
      includes: [
        `href="${toExpectedPagePath(basePath, "/tags")}"`,
        `<link rel="canonical" href="${siteUrl}${toBuiltHtmlRoute(sampleTagPage)}"`,
      ],
      excludes: basePath ? ['href="/tags"'] : ['href="//tags/'],
    });
  }

  return checks;
}

export function verifyPagesBuild(options: VerifyPagesBuildOptions) {
  const cwd = options.cwd ?? process.cwd();
  const siteUrl = options.siteUrl.trim();
  const apiBaseUrl = (options.apiBaseUrl ?? "").trim();
  const rawBasePath = (options.publicSiteBasePath ?? "").trim();

  if (!siteUrl) {
    throw new Error("PUBLIC_SITE_URL is required");
  }

  const basePath = normalizeBasePath(rawBasePath) || deriveBasePathFromSiteUrl(siteUrl);
  const parsedSiteUrl = new URL(siteUrl);
  const siteOrigin = parsedSiteUrl.origin;
  const siteHost = parsedSiteUrl.hostname;

  if (apiBaseUrl) {
    assertSameOriginPublicApiBaseUrl(siteUrl, apiBaseUrl);
  }

  const checks = buildDynamicChecks(cwd, basePath, siteHost, siteOrigin, siteUrl);
  const contents = new Map<string, string>();

  for (const check of checks) {
    const content = readContent(cwd, contents, check.file);
    for (const needle of check.includes) {
      assertIncludes(content, needle, check.file);
    }
    for (const needle of check.excludes) {
      assertExcludes(content, needle, check.file);
    }
  }

  if (apiBaseUrl) {
    const htmlFiles = listBuildFiles(
      cwd,
      SITE_DIST_DIR,
      (file) => file.endsWith(".html") && !file.startsWith(`${SITE_DIST_DIR}/_astro/`)
    );
    const feedFiles = FEED_FILES.filter((file) => existsSync(resolve(cwd, file)));
    const astroFiles = listBuildFiles(cwd, `${SITE_DIST_DIR}/_astro`, (file) =>
      file.endsWith(".js")
    );
    const publicDocumentFiles = listBuildFiles(
      cwd,
      SITE_DIST_DIR,
      (file) =>
        (file.endsWith(".html") || file.endsWith(".xml") || file.endsWith(".json")) &&
        !file.startsWith(`${SITE_DIST_DIR}/_astro/`)
    );

    for (const file of [...astroFiles, ...publicDocumentFiles]) {
      readContent(cwd, contents, file);
    }

    assertIncludesSome(htmlFiles, contents, "/api/public/assets/");
    assertIncludesSome(publicDocumentFiles, contents, `${apiBaseUrl}/api/public/assets/`);
    assertExcludes(
      contents.get("site-dist/index.html") ?? "",
      "/api/files/",
      "site-dist/index.html"
    );
    assertIncludesSome(astroFiles, contents, `PUBLIC_API_BASE_URL:"${apiBaseUrl}"`);
    assertIncludesSome(astroFiles, contents, "/api/public/search");
    assertIncludesSome(astroFiles, contents, "/api/public/comments");
    assertIncludesSome(astroFiles, contents, "/api/public/reactions");

    for (const file of publicDocumentFiles) {
      assertExcludes(contents.get(file) ?? "", "/api/files/", file);
    }

    for (const file of feedFiles) {
      const content = contents.get(file) ?? "";
      assertIncludes(content, `${siteUrl}/posts/`, file);
      assertIncludes(content, `${apiBaseUrl}/api/public/assets/`, file);
    }

    const buildTimePublicAssetHits = htmlFiles.flatMap((file) =>
      extractBuildTimePublicAssetUrls(contents.get(file) ?? "").map((url) => ({ file, url }))
    );

    if (buildTimePublicAssetHits.length === 0) {
      throw new Error(
        "Expected at least one build-time /api/public/assets/* card|cover facade URL in generated HTML."
      );
    }

    for (const hit of buildTimePublicAssetHits) {
      const parsed = new URL(hit.url, siteUrl);
      if (!parsed.searchParams.has("v")) {
        throw new Error(
          `Expected ${hit.file} to version build-time public asset URL with ?v=: ${hit.url}`
        );
      }
    }
  }

  return `Frontend static output verified for ${siteUrl}${basePath || "/"}.`;
}

if (import.meta.main) {
  console.log(
    verifyPagesBuild({
      apiBaseUrl: process.env.PUBLIC_API_BASE_URL,
      publicSiteBasePath: process.env.PUBLIC_SITE_BASE_PATH,
      siteUrl: process.env.PUBLIC_SITE_URL || "",
    })
  );
}
