#!/usr/bin/env bun

import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

export const PUBLIC_MEDIA_FACADE_PREFIX = "/api/public/assets/";
export const STATIC_MEDIA_PREFIX = "/_content/assets/";
export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MAX_FILES = 20_000;
export const DEFAULT_MAX_PROJECT_BYTES = 5 * 1024 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".htm",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);
const PUBLIC_MEDIA_URL_RE = /(?:https?:\/\/[^"'`\s<>]+)?\/api\/public\/assets\/[^"'`\s<>]+/g;
const TRAILING_URL_PUNCTUATION_RE = /[.,;:!?)}\]]+$/u;

export type PublicMediaPackageStatus = "packaged" | "external";

export type PublicMediaManifestEntry = {
  sourcePath: string;
  outputPath: string | null;
  bytes: number;
  status: PublicMediaPackageStatus;
  reason: string | null;
};

export type PublicMediaManifest = {
  schemaVersion: 1;
  maxBytes: number;
  entries: PublicMediaManifestEntry[];
  packagedCount: number;
  packagedBytes: number;
  externalCount: number;
};

export type PublicMediaFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type PublicMediaPackageOptions = {
  cwd?: string;
  siteDistDir?: string;
  mediaOrigin?: string;
  siteUrl?: string;
  siteBasePath?: string;
  maxBytes?: number;
  maxFiles?: number;
  maxProjectBytes?: number;
  fetchImpl?: PublicMediaFetcher;
};

type AssetReference = {
  raw: string;
  sourcePath: string;
  sourceUrl: URL;
  fetchUrl: string;
  staticPath: string;
  replacement: (status: PublicMediaPackageStatus) => string;
};

type DownloadResult = {
  status: PublicMediaPackageStatus;
  bytes: number;
  body?: Uint8Array;
  reason: string | null;
};

function normalizeOrigin(value: string, name: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${name} must be an HTTPS origin without credentials`);
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${name} must contain only an origin`);
  }
  return parsed.origin;
}

function normalizeBasePath(raw: string) {
  const value = raw.trim();
  if (!value || value === "/") return "";
  const normalized = `/${value.replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "" : normalized;
}

function sitePath(basePath: string, path: string) {
  return basePath ? `${basePath}${path}` : path;
}

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//iu.test(value);
}

function trimUrlToken(value: string) {
  return value.replace(TRAILING_URL_PUNCTUATION_RE, "");
}

export function extractPublicMediaUrls(content: string) {
  return [...content.matchAll(PUBLIC_MEDIA_URL_RE)].map((match) => trimUrlToken(match[0]));
}

function assertSafeAssetPath(pathname: string) {
  const relativePath = pathname.slice(PUBLIC_MEDIA_FACADE_PREFIX.length);
  if (
    !relativePath ||
    relativePath.split("/").some((segment) => {
      if (!segment || segment === "." || segment === ".." || /%2f|%5c/iu.test(segment)) {
        return true;
      }
      try {
        const decoded = decodeURIComponent(segment);
        return decoded === "." || decoded === "..";
      } catch {
        return false;
      }
    })
  ) {
    throw new Error(`Invalid public media path: ${pathname}`);
  }
  return relativePath;
}

function getTextFiles(root: string) {
  const files: string[] = [];
  const walk = async (directory: string) => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(absolutePath);
      }
    }
  };
  return walk(root).then(() => files);
}

function extractReferences(
  content: string,
  siteUrl: string,
  mediaOrigin: string,
  basePath: string
) {
  const references: AssetReference[] = [];
  for (const raw of extractPublicMediaUrls(content)) {
    const sourceUrl = new URL(raw, siteUrl);
    if (!sourceUrl.pathname.startsWith(PUBLIC_MEDIA_FACADE_PREFIX)) continue;

    const relativePath = assertSafeAssetPath(sourceUrl.pathname);
    const sourcePath = `${sourceUrl.pathname}${sourceUrl.search}`;
    const fetchUrl = `${mediaOrigin}${sourceUrl.pathname}${sourceUrl.search}`;
    const outputPath = sitePath(basePath, `${STATIC_MEDIA_PREFIX}${relativePath}`);
    const suffix = `${sourceUrl.search}${sourceUrl.hash}`;
    const absolute = isAbsoluteHttpUrl(raw);
    references.push({
      raw,
      sourcePath,
      sourceUrl,
      fetchUrl,
      staticPath: outputPath,
      replacement: (status) => {
        if (status === "external") {
          return `${mediaOrigin}${sourceUrl.pathname}${suffix}`;
        }
        const path = `${outputPath}${suffix}`;
        return absolute ? `${new URL(siteUrl).origin}${path}` : path;
      },
    });
  }
  return references;
}

function readContentLength(response: Response) {
  const value = response.headers.get("content-length");
  if (!value || !/^\d+$/u.test(value)) return null;
  return Number(value);
}

async function readResponseWithinLimit(response: Response, maxBytes: number) {
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength <= maxBytes
      ? { body: buffer, tooLarge: false }
      : { body: undefined, tooLarge: true };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { body: undefined, tooLarge: true };
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, tooLarge: false };
}

const MAX_MEDIA_REDIRECTS = 5;

async function fetchMediaWithinOrigin(
  url: string,
  mediaOrigin: string,
  init: RequestInit,
  fetchImpl: PublicMediaFetcher
) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_MEDIA_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(currentUrl, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) throw new Error("Media origin returned a redirect without a location");
    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.origin !== mediaOrigin) {
      throw new Error("Media origin redirect escaped the configured origin");
    }
    currentUrl = nextUrl.toString();
  }
  throw new Error(`Media origin returned more than ${MAX_MEDIA_REDIRECTS} redirects`);
}

async function downloadMedia(
  url: string,
  maxBytes: number,
  mediaOrigin: string,
  fetchImpl: PublicMediaFetcher
): Promise<DownloadResult> {
  let head: Response | null = null;
  try {
    head = await fetchMediaWithinOrigin(url, mediaOrigin, { method: "HEAD" }, fetchImpl);
  } catch {
    head = null;
  }

  if (head?.ok) {
    const length = readContentLength(head);
    if (length !== null && length > maxBytes) {
      return { status: "external", bytes: length, reason: "over_max_bytes" };
    }
  } else if (head && ![405, 501].includes(head.status)) {
    throw new Error(`Media origin returned HTTP ${head.status}`);
  }

  const response = await fetchMediaWithinOrigin(url, mediaOrigin, { method: "GET" }, fetchImpl);
  if (!response.ok) {
    throw new Error(`Media origin returned HTTP ${response.status}`);
  }
  const declaredLength = readContentLength(response);
  if (declaredLength !== null && declaredLength > maxBytes) {
    return { status: "external", bytes: declaredLength, reason: "over_max_bytes" };
  }

  const result = await readResponseWithinLimit(response, maxBytes);
  if (result.tooLarge) {
    return { status: "external", bytes: maxBytes + 1, reason: "over_max_bytes" };
  }
  if (!result.body || result.body.byteLength === 0) {
    throw new Error("Media origin returned an empty body");
  }
  return { status: "packaged", bytes: result.body.byteLength, body: result.body, reason: null };
}

function fetchKey(reference: AssetReference) {
  const url = new URL(reference.fetchUrl);
  url.searchParams.delete("v");
  return `${url.pathname}${url.search}`;
}

function writeOutput(key: string, value: string) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  return appendFile(outputPath, `${key}=${value}\n`, "utf8");
}

function formatMiB(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

async function writeSummary(manifest: PublicMediaManifest) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    "### Public media package",
    `- packaged files: \`${manifest.packagedCount}\``,
    `- packaged bytes: \`${formatMiB(manifest.packagedBytes)}\``,
    `- external files (> ${formatMiB(manifest.maxBytes)}): \`${manifest.externalCount}\``,
    "",
  ];
  await appendFile(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

export async function packagePublicMedia(
  options: PublicMediaPackageOptions = {}
): Promise<PublicMediaManifest> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const siteDistDir = resolve(cwd, options.siteDistDir ?? "site-dist");
  const mediaOrigin = normalizeOrigin(
    options.mediaOrigin ?? process.env.PUBLIC_STATIC_MEDIA_ORIGIN ?? "",
    "PUBLIC_STATIC_MEDIA_ORIGIN"
  );
  const siteUrl = options.siteUrl ?? process.env.PUBLIC_SITE_URL ?? "";
  if (!siteUrl) throw new Error("PUBLIC_SITE_URL is required");
  normalizeOrigin(new URL(siteUrl).origin, "PUBLIC_SITE_URL");
  const basePath = normalizeBasePath(
    options.siteBasePath ?? process.env.PUBLIC_SITE_BASE_PATH ?? ""
  );
  const maxBytes =
    options.maxBytes ?? Number(process.env.PUBLIC_STATIC_MEDIA_MAX_BYTES ?? DEFAULT_MAX_BYTES);
  const maxFiles =
    options.maxFiles ?? Number(process.env.PUBLIC_STATIC_MEDIA_MAX_FILES ?? DEFAULT_MAX_FILES);
  const maxProjectBytes =
    options.maxProjectBytes ??
    Number(process.env.PUBLIC_STATIC_MEDIA_MAX_PROJECT_BYTES ?? DEFAULT_MAX_PROJECT_BYTES);
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error("maxBytes must be a positive integer");
  if (!Number.isSafeInteger(maxFiles) || maxFiles <= 0)
    throw new Error("maxFiles must be a positive integer");
  if (!Number.isSafeInteger(maxProjectBytes) || maxProjectBytes <= 0) {
    throw new Error("maxProjectBytes must be a positive integer");
  }

  await stat(siteDistDir).catch(() => {
    throw new Error(`Missing static output directory: ${siteDistDir}`);
  });
  // `_content/assets` and its manifest are owned by this packaging step; preserve other output.
  await rm(join(siteDistDir, "_content", "assets"), { recursive: true, force: true });
  await rm(join(siteDistDir, "_content", "media-manifest.json"), { force: true });

  const files = await getTextFiles(siteDistDir);
  const fileContents = new Map<string, string>();
  const references: AssetReference[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    fileContents.set(file, content);
    references.push(...extractReferences(content, siteUrl, mediaOrigin, basePath));
  }
  const referenceByRaw = new Map(references.map((reference) => [reference.raw, reference]));

  const uniqueReferences = new Map<string, AssetReference>();
  for (const reference of references) {
    uniqueReferences.set(fetchKey(reference), reference);
  }

  const entriesByKey = new Map<string, PublicMediaManifestEntry>();
  const outputRoot = resolve(siteDistDir, ".");
  for (const [key, reference] of uniqueReferences) {
    const result = await downloadMedia(reference.fetchUrl, maxBytes, mediaOrigin, fetchImpl);
    let outputPath: string | null = null;
    if (result.status === "packaged") {
      if (!result.body) throw new Error(`Media origin returned no body: ${reference.sourcePath}`);
      const relativeOutput = reference.staticPath.replace(basePath, "").replace(/^\/+/, "");
      const destination = resolve(siteDistDir, relativeOutput);
      if (!destination.startsWith(`${outputRoot}/`))
        throw new Error("Static media path escapes site-dist");
      await mkdir(resolve(destination, ".."), { recursive: true });
      await writeFile(destination, result.body);
      outputPath = reference.staticPath;
    }
    entriesByKey.set(key, {
      sourcePath: reference.sourcePath,
      outputPath,
      bytes: result.bytes,
      status: result.status,
      reason: result.reason,
    });
  }

  for (const [file, content] of fileContents) {
    const rewritten = content.replace(PUBLIC_MEDIA_URL_RE, (token) => {
      const raw = trimUrlToken(token);
      const reference = referenceByRaw.get(raw);
      if (!reference) return token;
      const entry = entriesByKey.get(fetchKey(reference));
      if (!entry) throw new Error(`Missing media manifest entry for ${reference.sourcePath}`);
      const replacement = reference.replacement(entry.status);
      return `${replacement}${token.slice(raw.length)}`;
    });
    if (rewritten !== content) await writeFile(file, rewritten, "utf8");
  }

  const entries = [...entriesByKey.values()].sort((a, b) =>
    a.sourcePath.localeCompare(b.sourcePath)
  );
  const packaged = entries.filter((entry) => entry.status === "packaged");
  const external = entries.filter((entry) => entry.status === "external");
  const manifest: PublicMediaManifest = {
    schemaVersion: 1,
    maxBytes,
    entries,
    packagedCount: packaged.length,
    packagedBytes: packaged.reduce((total, entry) => total + entry.bytes, 0),
    externalCount: external.length,
  };

  if (manifest.packagedCount >= maxFiles) {
    throw new Error(
      `Static media file count ${manifest.packagedCount} reaches the ${maxFiles} file limit`
    );
  }
  if (manifest.packagedBytes >= maxProjectBytes) {
    throw new Error(
      `Static media size ${manifest.packagedBytes} reaches the ${formatMiB(maxProjectBytes)} project limit`
    );
  }

  const manifestPath = join(siteDistDir, "_content", "media-manifest.json");
  await mkdir(resolve(manifestPath, ".."), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeOutput("public_media_packaged_count", String(manifest.packagedCount));
  await writeOutput("public_media_packaged_bytes", String(manifest.packagedBytes));
  await writeOutput("public_media_external_count", String(manifest.externalCount));
  await writeSummary(manifest);

  console.log(
    `[public-media] packaged ${manifest.packagedCount} files (${formatMiB(manifest.packagedBytes)}); external ${manifest.externalCount}`
  );
  return manifest;
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    console.log("Usage: bun scripts/package-public-media.ts");
    console.log("Packages referenced public facade media into site-dist.");
    process.exit(0);
  }
  await packagePublicMedia();
}
