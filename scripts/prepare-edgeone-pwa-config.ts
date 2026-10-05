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
  "/about/",
  "/search/",
  "/tags/*",
  "/posts/*",
  "/projects/*",
  "/playbook/*",
  "/memos/",
  "/memos/:slug/",
] as const;

const HTML_FILE_ROUTE_PATTERNS = [
  "/",
  "/about/",
  "/search/",
  "/tags/*",
  "/posts/",
  "/posts/:slug/",
  "/projects/",
  "/projects/:slug/",
  "/playbook/*",
  "/memos/",
  "/memos/:slug/",
] as const;

const DYNAMIC_ROOT_PATHS = new Set(["api", "admin", "mcp"]);
const DYNAMIC_ROUTE_PROBES = [
  "/api",
  "/api/",
  "/api/health",
  "/api/public/snapshot",
  "/api/public/content-bundle",
  "/api/probe",
  "/api/probe/probe",
  "/admin",
  "/admin/",
  "/admin/index.html",
  "/admin/probe",
  "/mcp",
  "/mcp/",
  "/mcp/probe",
] as const;

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
    /^_content\/playbook\/v?\d+\.\d+\.\d+\/[a-f0-9]{64}\//.test(path) ||
    /^pwa\/[a-f0-9]{16}\//.test(path)
  );
}

function isDynamicRouteOutput(path: string) {
  return DYNAMIC_ROOT_PATHS.has(path.split("/", 1)[0] ?? "");
}

function versionedPwaDirectory(path: string) {
  const match = /^pwa\/([a-f0-9]{16})\//.exec(path);
  return match ? `pwa/${match[1]}` : undefined;
}

function rule(source: string, value: string): EdgeoneHeaderRule {
  return { source, headers: [{ key: "Cache-Control", value }] };
}

function safeRootAssetPrefix(name: string) {
  for (let length = 1; length <= name.length; length += 1) {
    const prefix = name.slice(0, length);
    if (![...DYNAMIC_ROOT_PATHS].some((root) => root.startsWith(prefix))) return prefix;
  }
}

export function createEdgeoneCacheConfig(basePath: string, staticFiles: readonly string[]) {
  const cacheableStaticFiles = staticFiles
    .map((path) => path.replaceAll("\\", "/").replace(/^\.\//, ""))
    .filter(Boolean)
    .filter((path) => !isDynamicRouteOutput(path));
  validateHtmlFiles(cacheableStaticFiles, basePath);
  const versionedPwaDirectories = [
    ...new Set(
      cacheableStaticFiles
        .map(versionedPwaDirectory)
        .filter((path): path is string => path !== undefined)
    ),
  ].sort();
  const hasContentAssetFiles = cacheableStaticFiles.some((path) =>
    path.startsWith("_content/assets/")
  );
  const htmlRules = HTML_ROUTE_PATTERNS.map((path) =>
    rule(scopedPath(basePath, path), EDGEONE_PUBLIC_CACHE_CONTROL.html)
  );
  const playbookEditionDirectories = [
    ...new Set(
      cacheableStaticFiles
        .filter((path) => /^_content\/playbook\/v?\d+\.\d+\.\d+\/[a-f0-9]{64}\//.test(path))
        .map((path) => path.split("/").slice(0, 4).join("/"))
    ),
  ].sort();
  const versionedRules = [
    ...playbookEditionDirectories.map((path) =>
      rule(scopedPath(basePath, `/${path}/*`), EDGEONE_PUBLIC_CACHE_CONTROL.immutable)
    ),
    rule(scopedPath(basePath, "/_astro/*"), EDGEONE_PUBLIC_CACHE_CONTROL.immutable),
    ...(hasContentAssetFiles
      ? [rule(scopedPath(basePath, "/_content/assets/*"), EDGEONE_PUBLIC_CACHE_CONTROL.immutable)]
      : []),
    ...versionedPwaDirectories.map((path) =>
      rule(scopedPath(basePath, `/${path}/*`), EDGEONE_PUBLIC_CACHE_CONTROL.immutable)
    ),
    ...playbookEditionDirectories.map((path) => ({
      source: scopedPath(basePath, `/${path}/policies/*`),
      headers: [
        { key: "Cache-Control", value: EDGEONE_PUBLIC_CACHE_CONTROL.immutable },
        { key: "Content-Type", value: "text/plain; charset=utf-8" },
        { key: "Content-Disposition", value: "attachment" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    })),
  ];
  const unversionedFiles = cacheableStaticFiles
    .filter((path) => path && !path.endsWith(".html") && path !== "CNAME")
    .filter((path) => !isVersionedAsset(path))
    .sort();
  const exactAssetSources = new Set<string>();
  const assetRootSources = new Set<string>();
  const postRouteAssetSources = new Set<string>();
  const projectRouteAssetSources = new Set<string>();
  const pwaAssetRootSources = new Set<string>();
  const rootAssetSources = new Set<string>();
  const tagFeedSources = new Set<string>();

  for (const path of unversionedFiles) {
    const parent = dirname(path).replaceAll("\\", "/");
    const exactSource = scopedPath(basePath, `/${path}`);

    if (path.startsWith("tags/") && path.endsWith("/feed.xml")) {
      const source = path === "tags/feed.xml" ? "/tags/feed.xml" : "/tags/*/feed.xml";
      tagFeedSources.add(scopedPath(basePath, source));
      continue;
    }

    const [root, slug] = path.split("/");
    const overlapsHtmlRoute = htmlRules.some(({ source }) =>
      edgeoneSourceMatches(source, exactSource)
    );

    const pathSegments = path.split("/");

    if (root === "posts" && slug && pathSegments.length >= 3 && extname(path)) {
      const source = pathSegments.length === 3 ? "/posts/:slug/:asset" : "/posts/:slug/:parent/*";
      postRouteAssetSources.add(scopedPath(basePath, source));
      continue;
    }

    if (root === "projects") {
      if (extname(path)) {
        const source =
          pathSegments.length === 3
            ? "/projects/:slug/:asset"
            : pathSegments.length > 3
              ? "/projects/:slug/:parent/*"
              : undefined;
        if (source) projectRouteAssetSources.add(scopedPath(basePath, source));
        else exactAssetSources.add(exactSource);
      } else {
        exactAssetSources.add(exactSource);
      }
      continue;
    }

    if (root === "tags") {
      exactAssetSources.add(exactSource);
      continue;
    }

    if (overlapsHtmlRoute) {
      exactAssetSources.add(exactSource);
      continue;
    }

    if (root === "pwa") {
      const source = parent === "pwa" ? exactSource : scopedPath(basePath, `/${parent}/*`);
      pwaAssetRootSources.add(source);
      continue;
    }

    if (parent === ".") {
      const basename = path.slice(path.lastIndexOf("/") + 1);
      if (DYNAMIC_ROOT_PATHS.has(basename)) continue;

      const prefix = safeRootAssetPrefix(basename);
      if (prefix) {
        rootAssetSources.add(scopedPath(basePath, `/${prefix}*`));
      } else {
        rootAssetSources.add(exactSource);
      }
      continue;
    }

    if (!root) {
      exactAssetSources.add(exactSource);
      continue;
    }
    assetRootSources.add(scopedPath(basePath, `/${root}/*`));
  }

  const config: EdgeoneCacheConfig = {
    headers: [
      // Root assets precede HTML routes; route-specific assets and versioned rules follow.
      ...[...assetRootSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...[...rootAssetSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...htmlRules,
      ...[...tagFeedSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...[...projectRouteAssetSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...[...postRouteAssetSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...[...pwaAssetRootSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...[...exactAssetSources]
        .sort()
        .map((source) => rule(source, EDGEONE_PUBLIC_CACHE_CONTROL.revalidate)),
      ...versionedRules,
    ],
  };

  if (config.headers.length > 30) {
    throw new Error(
      `EdgeOne cache policy needs ${config.headers.length} header rules; the limit is 30: ${config.headers.map(({ source }) => source).join(", ")}`
    );
  }

  const normalizedBase = normalizeBasePath(basePath);
  for (const headerRule of config.headers) {
    if (headerRule.source.split("*").length > 2) {
      throw new Error(`EdgeOne source may contain at most one wildcard: ${headerRule.source}`);
    }
    if (!headerRule.source.startsWith("/")) {
      throw new Error(`EdgeOne source must start with /: ${headerRule.source}`);
    }
    if (normalizedBase && !headerRule.source.startsWith(`${normalizedBase}/`)) {
      throw new Error(`EdgeOne source escaped the public base path: ${headerRule.source}`);
    }
  }

  const dynamicRoutePaths = new Set(
    DYNAMIC_ROUTE_PROBES.flatMap((path) => [path, scopedPath(basePath, path)])
  );
  const dynamicRouteMatches = [...dynamicRoutePaths].filter((path) =>
    config.headers.some(({ source }) => edgeoneSourceMatches(source, path))
  );
  if (dynamicRouteMatches.length > 0) {
    throw new Error(
      `EdgeOne cache policy must not match dynamic routes: ${dynamicRouteMatches.join(", ")}`
    );
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
  for (let index = config.headers.length - 1; index >= 0; index -= 1) {
    const headerRule = config.headers[index];
    if (headerRule && edgeoneSourceMatches(headerRule.source, pathname)) return headerRule;
  }
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
    const represented = HTML_FILE_ROUTE_PATTERNS.some((source) =>
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
