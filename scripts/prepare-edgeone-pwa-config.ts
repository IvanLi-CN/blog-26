#!/usr/bin/env bun

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

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
  const htmlRules = [
    rule(scopedPath(basePath, "/"), EDGEONE_PUBLIC_CACHE_CONTROL.html),
    ...["/about*", "/search*", "/posts*", "/memos*", "/tags*"].map((path) =>
      rule(scopedPath(basePath, path), EDGEONE_PUBLIC_CACHE_CONTROL.html)
    ),
    rule(scopedPath(basePath, "/projects/"), EDGEONE_PUBLIC_CACHE_CONTROL.html),
    rule(scopedPath(basePath, "/projects/:slug/"), EDGEONE_PUBLIC_CACHE_CONTROL.html),
  ];
  const versionedRules = [
    rule(scopedPath(basePath, "/_astro/*"), EDGEONE_PUBLIC_CACHE_CONTROL.immutable),
    rule(scopedPath(basePath, "/_content/assets/*"), EDGEONE_PUBLIC_CACHE_CONTROL.immutable),
    ...versionedPwaDirectories.map((path) =>
      rule(scopedPath(basePath, `/${path}/*`), EDGEONE_PUBLIC_CACHE_CONTROL.immutable)
    ),
  ];
  const unversionedFiles = normalizedStaticFiles
    .filter((path) => path && !path.endsWith(".html") && path !== "CNAME")
    .filter((path) => !isVersionedAsset(path))
    .sort();
  const assetSources = new Set<string>();

  for (const path of unversionedFiles) {
    const parent = dirname(path).replaceAll("\\", "/");
    const basename = path.slice(path.lastIndexOf("/") + 1);
    if (parent === "." && /^favicon\.(?:ico|svg)$/.test(basename)) {
      assetSources.add(scopedPath(basePath, "/favicon.*"));
      continue;
    }
    const useExactPath =
      parent === "." || parent === "_content" || parent === "_astro" || parent === "pwa";
    const source = useExactPath
      ? scopedPath(basePath, `/${path}`)
      : scopedPath(basePath, `/${parent}/*`);
    assetSources.add(source);
  }

  const config: EdgeoneCacheConfig = {
    headers: [
      ...versionedRules,
      ...[...assetSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...htmlRules,
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

async function collectStaticFiles(root: string, directory = root): Promise<string[]> {
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
    const represented = [
      "/",
      "/about*",
      "/search*",
      "/posts*",
      "/memos*",
      "/tags*",
      "/projects/",
      "/projects/:slug/",
    ].some((source) => edgeoneSourceMatches(scopedPath(normalizedBase, source), scoped));
    if (!represented) throw new Error(`Public HTML route has no EdgeOne HTML cache rule: ${file}`);
  }
}

export async function prepareEdgeonePwaConfig(
  options: { siteDistDir?: string; artifactDir?: string; basePath?: string } = {}
) {
  const siteDistDir = resolve(options.siteDistDir ?? "site-dist");
  const artifactDir = resolve(options.artifactDir ?? "edgeone-dist");
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
