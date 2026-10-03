#!/usr/bin/env bun

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

export const EDGEONE_PUBLIC_CACHE_CONTROL = {
  html: "public, max-age=60, must-revalidate",
  immutable: "public, max-age=31536000, immutable",
  revalidate: "public, max-age=0, must-revalidate",
} as const;

type EdgeoneHeaderRule = {
  source: string;
  headers: { key: string; value: string }[];
};

export type EdgeoneCacheConfig = { headers: EdgeoneHeaderRule[] };

const HTML_ROUTE_PATTERNS = [
  "/",
  "/about*",
  "/search*",
  "/posts/",
  "/posts/:slug/",
  "/memos/",
  "/memos/:slug/",
  "/tags/",
  "/tags/*/",
  "/projects/",
  "/projects/:slug/",
] as const;

const HTML_FALLBACK_PATTERNS = ["/posts*", "/memos*"] as const;

export function normalizeBasePath(raw = "") {
  const value = raw.trim();
  if (!value || value === "/") return "";
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const normalized = withLeadingSlash.replace(/\/+$/, "");
  return normalized === "/" ? "" : normalized;
}

function scopedPath(basePath: string, path: string) {
  const base = normalizeBasePath(basePath);
  return base ? (path === "/" ? `${base}/` : `${base}${path}`) : path;
}

function isVersionedAsset(path: string) {
  return (
    path.startsWith("_astro/") ||
    path.startsWith("_content/assets/") ||
    /^pwa\/[a-f0-9]{16}\//.test(path)
  );
}

function versionedPwaDirectory(path: string) {
  const match = /^pwa\/([a-f0-9]{16})\//.exec(path);
  return match ? `pwa/${match[1]}` : undefined;
}

function rule(source: string, value: string): EdgeoneHeaderRule {
  return { source, headers: [{ key: "Cache-Control", value }] };
}

export function createEdgeoneCacheConfig(basePath: string, staticFiles: readonly string[]) {
  validateHtmlFiles(staticFiles, basePath);
  const normalizedStaticFiles = staticFiles
    .map((path) => path.replaceAll("\\", "/").replace(/^\.\//, ""))
    .filter(Boolean);
  const versionedPwaDirectories = [
    ...new Set(
      normalizedStaticFiles
        .map(versionedPwaDirectory)
        .filter((path): path is string => path !== undefined)
    ),
  ].sort();
  const hasContentAssetFiles = normalizedStaticFiles.some((path) =>
    path.startsWith("_content/assets/")
  );
  const htmlRules = HTML_ROUTE_PATTERNS.map((path) =>
    rule(scopedPath(basePath, path), EDGEONE_PUBLIC_CACHE_CONTROL.html)
  );
  const htmlFallbackRules = HTML_FALLBACK_PATTERNS.map((path) =>
    rule(scopedPath(basePath, path), EDGEONE_PUBLIC_CACHE_CONTROL.html)
  );
  const versionedRules = [
    rule(scopedPath(basePath, "/_astro/*"), EDGEONE_PUBLIC_CACHE_CONTROL.immutable),
    ...(hasContentAssetFiles
      ? [rule(scopedPath(basePath, "/_content/assets/*"), EDGEONE_PUBLIC_CACHE_CONTROL.immutable)]
      : []),
    ...versionedPwaDirectories.map((path) =>
      rule(scopedPath(basePath, `/${path}/*`), EDGEONE_PUBLIC_CACHE_CONTROL.immutable)
    ),
  ];
  const unversionedFiles = normalizedStaticFiles
    .filter((path) => path && !path.endsWith(".html") && path !== "CNAME")
    .filter((path) => !isVersionedAsset(path))
    .sort();
  const exactAssetSources = new Set<string>();
  const assetSources = new Set<string>();
  const projectAssetSources = new Set<string>();
  let hasTagFeedFiles = false;

  for (const path of unversionedFiles) {
    const parent = dirname(path).replaceAll("\\", "/");
    const basename = path.slice(path.lastIndexOf("/") + 1);
    const exactSource = scopedPath(basePath, `/${path}`);

    if (path.startsWith("tags/") && path.endsWith("/feed.xml")) {
      hasTagFeedFiles = true;
      continue;
    }

    const overlapsHtmlRoute = htmlRules.some(({ source }) =>
      edgeoneSourceMatches(source, exactSource)
    );

    if (overlapsHtmlRoute) {
      exactAssetSources.add(exactSource);
      continue;
    }

    if (parent === "." && basename.startsWith("f")) {
      assetSources.add(scopedPath(basePath, "/f*"));
      continue;
    }

    if (path.startsWith("projects/")) {
      const extension = extname(path);
      if (!extension) {
        exactAssetSources.add(exactSource);
        continue;
      }

      const projectDirectoryDepth = path.split("/").length - 2;
      // Project assets share one public cache policy regardless of file type.
      // Keeping one rule per directory depth leaves room under EdgeOne's 30-rule limit.
      const pattern = [
        "projects",
        ...Array.from({ length: projectDirectoryDepth }, (_, index) => `:projectDir${index + 1}`),
        "*",
      ].join("/");
      projectAssetSources.add(scopedPath(basePath, `/${pattern}`));
      continue;
    }

    const useExactPath =
      parent === "." || parent === "_content" || parent === "_astro" || parent === "pwa";
    const source = useExactPath ? exactSource : scopedPath(basePath, `/${parent}/*`);
    assetSources.add(source);
  }

  const config: EdgeoneCacheConfig = {
    headers: [
      ...versionedRules,
      ...[...exactAssetSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...(hasTagFeedFiles
        ? [rule(scopedPath(basePath, "/tags/*/feed.xml"), EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)]
        : []),
      ...htmlRules,
      ...[...assetSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...[...projectAssetSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...htmlFallbackRules,
    ],
  };

  if (config.headers.length > 30) {
    throw new Error(
      `EdgeOne cache policy needs ${config.headers.length} header rules; the limit is 30.`
    );
  }

  const normalizedBase = normalizeBasePath(basePath);
  for (const headerRule of config.headers) {
    if (!headerRule.source.startsWith("/")) {
      throw new Error(`EdgeOne source must start with /: ${headerRule.source}`);
    }
    if (headerRule.source.startsWith("/api/") || headerRule.source.startsWith("/admin/")) {
      throw new Error(
        `EdgeOne cache policy must not match API or admin paths: ${headerRule.source}`
      );
    }
    if (normalizedBase && !headerRule.source.startsWith(`${normalizedBase}/`)) {
      throw new Error(`EdgeOne source escaped the public base path: ${headerRule.source}`);
    }
  }

  return config;
}

function edgeoneSourceMatches(source: string, pathname: string) {
  const placeholder = "__EDGEONE_PARAM__";
  const escaped = source
    .replace(/:[A-Za-z][A-Za-z0-9_]*/g, placeholder)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll(placeholder, "[^/]+");
  return new RegExp(`^${escaped}$`).test(pathname);
}

export function findEdgeoneCacheRule(config: EdgeoneCacheConfig, pathname: string) {
  return config.headers.find((headerRule) => edgeoneSourceMatches(headerRule.source, pathname));
}

export async function collectStaticFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) return collectStaticFiles(root, absolute);
      if (!entry.isFile()) return [];
      return [relative(root, absolute).split(sep).join("/")];
    })
  );
  return nested.flat();
}

function validateHtmlFiles(staticFiles: readonly string[], basePath: string) {
  const normalizedBase = normalizeBasePath(basePath);
  for (const file of staticFiles.filter((path) => path.endsWith(".html") && path !== "404.html")) {
    const urlPath =
      file === "index.html"
        ? "/"
        : file.endsWith("/index.html")
          ? `/${file.slice(0, -"/index.html".length)}/`
          : `/${file}`;
    const scoped = scopedPath(normalizedBase, urlPath);
    const represented = [...HTML_ROUTE_PATTERNS, ...HTML_FALLBACK_PATTERNS].some((source) =>
      edgeoneSourceMatches(scopedPath(normalizedBase, source), scoped)
    );
    if (!represented) throw new Error(`Public HTML route has no EdgeOne HTML cache rule: ${file}`);
  }
}

export async function prepareEdgeonePwaConfig(
  options: { siteDistDir?: string; artifactDir?: string; basePath?: string } = {}
) {
  const siteDistDir = resolve(options.siteDistDir ?? "site-dist");
  const artifactDir = resolve(
    options.artifactDir ?? process.env.PUBLIC_EDGEONE_ARTIFACT_DIR ?? "edgeone-dist"
  );
  const staticFiles = await collectStaticFiles(siteDistDir);
  const config = createEdgeoneCacheConfig(
    options.basePath ?? process.env.PUBLIC_SITE_BASE_PATH ?? "",
    staticFiles
  );
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    join(artifactDir, "edgeone.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8"
  );
  return config;
}

if (import.meta.main) {
  prepareEdgeonePwaConfig()
    .then((config) => {
      console.log(`Prepared EdgeOne public cache rules: ${config.headers.length}`);
    })
    .catch((error) => {
      console.error(
        "[prepare-edgeone-pwa-config]",
        error instanceof Error ? error.message : String(error)
      );
      process.exitCode = 1;
    });
}
