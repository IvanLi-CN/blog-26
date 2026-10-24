#!/usr/bin/env bun

import {
  appendFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve, sep } from "node:path";

export const PUBLIC_MEDIA_FACADE_PREFIX = "/api/public/assets/";
export const CLIPPING_RESOURCE_FACADE_RE =
  /^\/api\/public\/memos\/[^/]+\/clipping\/assets\/[^/]+\/[a-f0-9]{64}\.[a-z0-9]+$/iu;
export const CLIPPING_RESOURCE_BASE_FACADE_RE =
  /^\/api\/public\/memos\/[^/]+\/clipping\/assets\/[^/]+\/$/u;
export const STATIC_MEDIA_PREFIX = "/_content/assets/";
export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MAX_FILES = 20_000;
export const DEFAULT_MAX_PROJECT_BYTES = 5 * 1024 * 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_DOWNLOAD_CONCURRENCY = 1;
export const DEFAULT_DOWNLOAD_ATTEMPTS = 3;
export const DEFAULT_RETRY_DELAY_MS = 500;

const PLAYBOOK_EDITION_FILE_PATH_RE =
  /^_content\/playbook\/v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\/[a-f0-9]{64}\/.+$/u;

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
const PUBLIC_MEDIA_URL_RE =
  /(?:https?:\/\/[^"'`&\\\s<>]+)?\/api\/public\/(?:assets\/[^"'`&\\\s<>]+|memos\/[^"'`&\\\s<>]+\/clipping\/assets\/[^"'`&\\\s<>]+)/g;
const CLIPPING_RESOURCE_BASE_URL_RE =
  /(?:https?:\/\/[^"'`&\\\s<>]+)?\/api\/public\/memos\/[^"'`&\\\s<>/]+\/clipping\/assets\/[^"'`&\\\s<>/]+\/(?=["'`&\\\s<>])/g;
const TRAILING_URL_PUNCTUATION_RE = /[.,;:!?)}\]]+$/u;

export type PublicMediaPackageStatus = "packaged" | "external";

export type PublicMediaManifestEntry = {
  sourcePath: string;
  outputPath: string | null;
  bytes: number;
  status: PublicMediaPackageStatus;
  reason: string | null;
  /** A legacy derived URL that resolves to a canonical base asset. */
  aliasOf?: string;
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
  requestTimeoutMs?: number;
  downloadConcurrency?: number;
  downloadAttempts?: number;
  retryDelayMs?: number;
  fallbackFetchImpl?: PublicMediaFetcher;
  includeDerivedWatermarkVariants?: boolean;
  includeMigratedWatermarkVariants?: boolean;
  clippingResourceUrls?: string[];
  fetchImpl?: PublicMediaFetcher;
};

type AssetReference = {
  raw: string;
  sourcePath: string;
  sourceUrl: URL;
  fetchUrl: string;
  staticPath: string;
  replacement: (status: PublicMediaPackageStatus) => string;
  required?: boolean;
  fallback?: AssetReference;
};

type DownloadResult = {
  status: PublicMediaPackageStatus;
  bytes: number;
  body?: Uint8Array;
  reason: string | null;
};

type ParsedCurlHeaders = {
  status: number;
  headers: Headers;
};

type PublicHttp11Process = {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill: () => void;
};

export type PublicHttp11Spawner = (
  args: string[],
  options: { stdout: "pipe"; stderr: "pipe"; timeout: number }
) => PublicHttp11Process;

const spawnPublicHttp11Process: PublicHttp11Spawner = (args, options) => Bun.spawn(args, options);

class MediaNotFoundError extends Error {
  constructor(url: string) {
    super(`Media origin returned HTTP 404 for ${url}`);
    this.name = "MediaNotFoundError";
  }
}

class MediaHttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`Media origin returned HTTP ${status} for ${url}`);
    this.name = "MediaHttpError";
    this.status = status;
  }
}

class MediaPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaPolicyError";
  }
}

function parseCurlHeaders(raw: string): ParsedCurlHeaders {
  const blocks = raw
    .split(/\r?\n\r?\n/u)
    .filter((block) => /^HTTP\/\d(?:\.\d)?\s+\d{3}/mu.test(block));
  const block = blocks.at(-1);
  const lines = block?.split(/\r?\n/u) ?? [];
  const status = Number(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/u.exec(lines[0] ?? "")?.[1]);
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error("HTTP/1.1 fallback did not return a valid response status");
  }
  const headers = new Headers();
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  return { status, headers };
}

async function readCurlBodyWithinLimit(
  stream: ReadableStream<Uint8Array>,
  maxBodyBytes: number | undefined,
  kill: () => void
): Promise<{ body: Uint8Array; tooLarge: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (maxBodyBytes !== undefined && total > maxBodyBytes) {
        kill();
        await reader.cancel().catch(() => undefined);
        return { body: new Uint8Array(), tooLarge: true };
      }
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
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

export async function fetchPublicResourceOverHttp11(
  input: RequestInfo | URL,
  init: RequestInit = {},
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  maxBodyBytes?: number,
  spawnImpl: PublicHttp11Spawner = spawnPublicHttp11Process
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET") throw new Error("HTTP/1.1 public resource fallback only supports GET");
  const url = new URL(String(input));
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("HTTP/1.1 public resource fallback requires an HTTPS URL without credentials");
  }
  if (maxBodyBytes !== undefined && (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0)) {
    throw new Error("maxBodyBytes must be a positive integer");
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), "blog-public-http11-"));
  const headersPath = join(temporaryRoot, "headers.txt");
  try {
    const child = spawnImpl(
      [
        "curl",
        "--disable",
        "--silent",
        "--show-error",
        "--http1.1",
        "--no-compressed",
        "--proto",
        "=https",
        "--max-time",
        String(Math.ceil(requestTimeoutMs / 1_000)),
        "--dump-header",
        headersPath,
        "--output",
        "-",
        url.href,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
        timeout: requestTimeoutMs,
      }
    );
    let body: { body: Uint8Array; tooLarge: boolean };
    try {
      body = await readCurlBodyWithinLimit(child.stdout, maxBodyBytes, () => child.kill());
    } catch (error) {
      child.kill();
      await child.exited;
      throw error;
    }
    const [diagnostics, exitCode] = await Promise.all([
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0 && !body.tooLarge) {
      const details = diagnostics.trim();
      throw new Error(`HTTP/1.1 public resource fallback failed${details ? `: ${details}` : ""}`);
    }
    let parsed: ParsedCurlHeaders;
    try {
      parsed = parseCurlHeaders(await readFile(headersPath, "utf8"));
    } catch (error) {
      if (exitCode !== 0) {
        const details = diagnostics.trim();
        throw new Error(
          `HTTP/1.1 public resource fallback failed${details ? `: ${details}` : ""}`,
          { cause: error }
        );
      }
      throw error;
    }
    if (body.tooLarge) {
      const headers = new Headers(parsed.headers);
      headers.set("content-length", String((maxBodyBytes ?? 0) + 1));
      return new Response(null, { headers, status: parsed.status });
    }
    const responseBody = new ArrayBuffer(body.body.byteLength);
    new Uint8Array(responseBody).set(body.body);
    return new Response(responseBody, { headers: parsed.headers, status: parsed.status });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

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

export function isPlaybookEditionFilePath(path: string) {
  return PLAYBOOK_EDITION_FILE_PATH_RE.test(path);
}

function assertSafeAssetPath(pathname: string) {
  const relativePath = pathname.startsWith(PUBLIC_MEDIA_FACADE_PREFIX)
    ? pathname.slice(PUBLIC_MEDIA_FACADE_PREFIX.length)
    : pathname.slice("/api/public/".length);
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

export function isPublicMediaReferencePath(pathname: string) {
  return (
    pathname.startsWith(PUBLIC_MEDIA_FACADE_PREFIX) ||
    CLIPPING_RESOURCE_FACADE_RE.test(pathname) ||
    CLIPPING_RESOURCE_BASE_FACADE_RE.test(pathname)
  );
}

function replaceClippingResourceBases(content: string, siteUrl: string, basePath: string) {
  return content.replace(CLIPPING_RESOURCE_BASE_URL_RE, (token) => {
    const raw = trimUrlToken(token);
    const sourceUrl = new URL(raw, siteUrl);
    if (!CLIPPING_RESOURCE_BASE_FACADE_RE.test(sourceUrl.pathname)) return token;
    const relativePath = assertSafeAssetPath(sourceUrl.pathname.slice(0, -1));
    const outputPath = sitePath(basePath, `${STATIC_MEDIA_PREFIX}${relativePath}/`);
    return isAbsoluteHttpUrl(raw) ? `${new URL(siteUrl).origin}${outputPath}` : outputPath;
  });
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
    if (!isPublicMediaReferencePath(sourceUrl.pathname)) continue;
    if (CLIPPING_RESOURCE_BASE_FACADE_RE.test(sourceUrl.pathname)) continue;

    const relativePath = assertSafeAssetPath(sourceUrl.pathname);
    const sourcePath = `${sourceUrl.pathname}${sourceUrl.search}`;
    const fetchUrl = `${mediaOrigin}${sourceUrl.pathname}${sourceUrl.search}`;
    const outputPath = sitePath(basePath, `${STATIC_MEDIA_PREFIX}${relativePath}`);
    const suffix = `${sourceUrl.search}${sourceUrl.hash}`;
    const absolute = isAbsoluteHttpUrl(raw);
    const reference: AssetReference = {
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
      ...(CLIPPING_RESOURCE_FACADE_RE.test(sourceUrl.pathname) ? { required: true } : {}),
    };
    if (isLegacyDerivedWatermarkPath(sourceUrl.pathname)) {
      reference.fallback = deriveBaseReference(reference, mediaOrigin, basePath) ?? undefined;
    }
    references.push(reference);
  }
  return references;
}

function readContentLength(response: Response) {
  const value = response.headers.get("content-length");
  if (!value || !/^\d+$/u.test(value)) return null;
  return Number(value);
}

async function cancelResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Cleanup failures must not replace the packaging result.
  }
}

function mediaDownloadError(url: string, attempts: number, cause: unknown) {
  const details = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  return new Error(
    `Media origin request failed after ${attempts} attempts: ${url}; last error: ${details}`,
    { cause }
  );
}

async function readResponseWithinLimit(
  response: Response,
  maxBytes: number,
  requestTimeoutMs: number,
  url: string
) {
  const deadline = Date.now() + requestTimeoutMs;
  const readWithinDeadline = async <T>(operation: Promise<T>) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`Media origin response body timed out after ${requestTimeoutMs} ms: ${url}`);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Media origin response body timed out after ${requestTimeoutMs} ms: ${url}`
                )
              ),
            remainingMs
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  if (!response.body) {
    const buffer = new Uint8Array(await readWithinDeadline(response.arrayBuffer()));
    return buffer.byteLength <= maxBytes
      ? { body: buffer, tooLarge: false }
      : { body: undefined, tooLarge: true };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await readWithinDeadline(reader.read());
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { body: undefined, tooLarge: true };
      }
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
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
const PUBLIC_RENDER_VARIANT_RE =
  /^\/api\/public\/assets\/(post|memo)\/([^/]+)\/([^/]+)\/(card|cover|content|full|social|poster)\.([a-z0-9]+)$/iu;
const PUBLIC_DERIVED_RENDER_VARIANT_RE =
  /^\/api\/public\/assets\/(post|memo)\/([^/]+)\/([^/]+)\/(wm-[ab]-v[123])\/(card|cover|content|full|social|poster)\.([a-z0-9]+)$/iu;
const DERIVED_WATERMARK_RENDER_IDS = ["wm-a-v3", "wm-b-v3"] as const;

async function fetchMediaWithinOrigin(
  url: string,
  mediaOrigin: string,
  init: RequestInit,
  fetchImpl: PublicMediaFetcher,
  requestTimeoutMs: number
) {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_MEDIA_REDIRECTS; redirectCount += 1) {
    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, { ...init, redirect: "manual", signal });
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new Error(
          `Media origin request timed out after ${requestTimeoutMs} ms: ${currentUrl}`
        );
      }
      throw error;
    }
    if (response.status < 300 || response.status >= 400) return response;

    await cancelResponseBody(response);
    const location = response.headers.get("location");
    if (!location)
      throw new MediaPolicyError("Media origin returned a redirect without a location");
    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.origin !== mediaOrigin) {
      throw new MediaPolicyError("Media origin redirect escaped the configured origin");
    }
    currentUrl = nextUrl.toString();
  }
  throw new MediaPolicyError(`Media origin returned more than ${MAX_MEDIA_REDIRECTS} redirects`);
}

async function downloadMedia(
  url: string,
  maxBytes: number,
  mediaOrigin: string,
  fetchImpl: PublicMediaFetcher,
  requestTimeoutMs: number,
  downloadAttempts: number,
  retryDelayMs: number,
  fallbackFetchImpl?: PublicMediaFetcher
): Promise<DownloadResult> {
  // GET headers provide the size limit without a separate round-trip.
  const downloadOnce = async (transport: PublicMediaFetcher): Promise<DownloadResult> => {
    const response = await fetchMediaWithinOrigin(
      url,
      mediaOrigin,
      { method: "GET" },
      transport,
      requestTimeoutMs
    );
    if (!response.ok) {
      await cancelResponseBody(response);
      if (response.status === 404) throw new MediaNotFoundError(url);
      throw new MediaHttpError(response.status, url);
    }
    const declaredLength = readContentLength(response);
    if (declaredLength !== null && declaredLength > maxBytes) {
      await cancelResponseBody(response);
      return { status: "external", bytes: declaredLength, reason: "over_max_bytes" };
    }

    const result = await readResponseWithinLimit(response, maxBytes, requestTimeoutMs, url);
    if (result.tooLarge) {
      return { status: "external", bytes: maxBytes + 1, reason: "over_max_bytes" };
    }
    if (!result.body || result.body.byteLength === 0) {
      throw new Error("Media origin returned an empty body");
    }
    return { status: "packaged", bytes: result.body.byteLength, body: result.body, reason: null };
  };

  const isRetryableError = (error: unknown) => {
    if (error instanceof MediaPolicyError) return false;
    if (!(error instanceof MediaHttpError)) return true;
    return (
      error.status === 404 || error.status === 408 || error.status === 429 || error.status >= 500
    );
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= downloadAttempts; attempt += 1) {
    try {
      return await downloadOnce(fetchImpl);
    } catch (error) {
      if (!isRetryableError(error)) throw error;
      lastError = error;
      if (attempt === downloadAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  if (fallbackFetchImpl) {
    try {
      return await downloadOnce(fallbackFetchImpl);
    } catch (error) {
      if (error instanceof MediaNotFoundError || !isRetryableError(error)) throw error;
      throw mediaDownloadError(url, downloadAttempts, error);
    }
  }

  if (lastError instanceof MediaNotFoundError || lastError instanceof MediaHttpError)
    throw lastError;
  throw mediaDownloadError(url, downloadAttempts, lastError);
}

function fetchKey(reference: AssetReference) {
  const url = new URL(reference.fetchUrl);
  url.searchParams.delete("v");
  return `${url.pathname}${url.search}`;
}

function deriveWatermarkReference(
  reference: AssetReference,
  renderId: (typeof DERIVED_WATERMARK_RENDER_IDS)[number],
  mediaOrigin: string,
  basePath: string
): AssetReference | null {
  const match = PUBLIC_RENDER_VARIANT_RE.exec(reference.sourceUrl.pathname);
  if (!match) return null;
  const [, , , , variant, extension] = match;
  const sourceUrl = new URL(reference.sourceUrl.href);
  sourceUrl.pathname = `${sourceUrl.pathname.slice(0, sourceUrl.pathname.lastIndexOf("/"))}/${renderId}/${variant}.${extension}`;
  const relativePath = assertSafeAssetPath(sourceUrl.pathname);
  const sourcePath = `${sourceUrl.pathname}${sourceUrl.search}`;
  const fetchUrl = `${mediaOrigin}${sourcePath}`;
  const staticPath = sitePath(basePath, `${STATIC_MEDIA_PREFIX}${relativePath}`);
  const derived: AssetReference = {
    raw: "",
    sourcePath,
    sourceUrl,
    fetchUrl,
    staticPath,
    replacement: () => staticPath,
  };
  return derived;
}

function deriveSiblingWatermarkReferences(
  reference: AssetReference,
  mediaOrigin: string,
  basePath: string
): AssetReference[] {
  const match = PUBLIC_DERIVED_RENDER_VARIANT_RE.exec(reference.sourceUrl.pathname);
  if (!match) return [];
  const [, kind, slug, hash, currentRenderId, variant, extension] = match;
  if (
    !DERIVED_WATERMARK_RENDER_IDS.includes(
      currentRenderId as (typeof DERIVED_WATERMARK_RENDER_IDS)[number]
    )
  ) {
    return [];
  }
  return DERIVED_WATERMARK_RENDER_IDS.filter((renderId) => renderId !== currentRenderId).map(
    (renderId) => {
      const sourceUrl = new URL(reference.sourceUrl.href);
      sourceUrl.pathname = `${PUBLIC_MEDIA_FACADE_PREFIX}${kind}/${slug}/${hash}/${renderId}/${variant}.${extension}`;
      const relativePath = assertSafeAssetPath(sourceUrl.pathname);
      const sourcePath = `${sourceUrl.pathname}${sourceUrl.search}`;
      const staticPath = sitePath(basePath, `${STATIC_MEDIA_PREFIX}${relativePath}`);
      return {
        raw: "",
        sourcePath,
        sourceUrl,
        fetchUrl: `${mediaOrigin}${sourcePath}`,
        staticPath,
        replacement: () => staticPath,
      } satisfies AssetReference;
    }
  );
}

function deriveMigratedWatermarkReferences(
  reference: AssetReference,
  mediaOrigin: string,
  basePath: string
): AssetReference[] {
  const match = PUBLIC_DERIVED_RENDER_VARIANT_RE.exec(reference.sourceUrl.pathname);
  if (!match || match[4]?.endsWith("-v3")) return [];
  const [, kind, slug, hash, , variant, extension] = match;
  return DERIVED_WATERMARK_RENDER_IDS.map((renderId) => {
    const sourceUrl = new URL(reference.sourceUrl.href);
    sourceUrl.pathname = `${PUBLIC_MEDIA_FACADE_PREFIX}${kind}/${slug}/${hash}/${renderId}/${variant}.${extension}`;
    const relativePath = assertSafeAssetPath(sourceUrl.pathname);
    const sourcePath = `${sourceUrl.pathname}${sourceUrl.search}`;
    const staticPath = sitePath(basePath, `${STATIC_MEDIA_PREFIX}${relativePath}`);
    return {
      raw: "",
      sourcePath,
      sourceUrl,
      fetchUrl: `${mediaOrigin}${sourcePath}`,
      staticPath,
      replacement: () => staticPath,
    } satisfies AssetReference;
  });
}

function isLegacyDerivedWatermarkPath(pathname: string) {
  const match = PUBLIC_DERIVED_RENDER_VARIANT_RE.exec(pathname);
  return match?.[4]?.endsWith("-v1") === true || match?.[4]?.endsWith("-v2") === true;
}

function deriveBaseReference(
  reference: AssetReference,
  mediaOrigin: string,
  basePath: string
): AssetReference | null {
  const match = PUBLIC_DERIVED_RENDER_VARIANT_RE.exec(reference.sourceUrl.pathname);
  if (!match) return null;
  const [, kind, slug, hash, , variant, extension] = match;
  const sourceUrl = new URL(reference.sourceUrl.href);
  sourceUrl.pathname = `${PUBLIC_MEDIA_FACADE_PREFIX}${kind}/${slug}/${hash}/${variant}.${extension}`;
  const relativePath = assertSafeAssetPath(sourceUrl.pathname);
  const sourcePath = `${sourceUrl.pathname}${sourceUrl.search}`;
  const fetchUrl = `${mediaOrigin}${sourcePath}`;
  const staticPath = sitePath(basePath, `${STATIC_MEDIA_PREFIX}${relativePath}`);
  return {
    raw: "",
    sourcePath,
    sourceUrl,
    fetchUrl,
    staticPath,
    replacement: (status) => {
      const suffix = `${sourceUrl.search}${sourceUrl.hash}`;
      if (status === "external") return `${mediaOrigin}${sourceUrl.pathname}${suffix}`;
      return `${staticPath}${suffix}`;
    },
  };
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
  const requestTimeoutMs =
    options.requestTimeoutMs ??
    Number(process.env.PUBLIC_STATIC_MEDIA_REQUEST_TIMEOUT_MS ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const downloadConcurrency =
    options.downloadConcurrency ??
    Number(process.env.PUBLIC_STATIC_MEDIA_DOWNLOAD_CONCURRENCY ?? DEFAULT_DOWNLOAD_CONCURRENCY);
  const downloadAttempts =
    options.downloadAttempts ??
    Number(process.env.PUBLIC_STATIC_MEDIA_DOWNLOAD_ATTEMPTS ?? DEFAULT_DOWNLOAD_ATTEMPTS);
  const retryDelayMs =
    options.retryDelayMs ??
    Number(process.env.PUBLIC_STATIC_MEDIA_RETRY_DELAY_MS ?? DEFAULT_RETRY_DELAY_MS);
  const fetchImpl = options.fetchImpl ?? fetch;
  const fallbackFetchImpl =
    options.fallbackFetchImpl ??
    (options.fetchImpl === undefined
      ? (input: RequestInfo | URL, init?: RequestInit) =>
          fetchPublicResourceOverHttp11(input, init, requestTimeoutMs, maxBytes)
      : undefined);

  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error("maxBytes must be a positive integer");
  if (!Number.isSafeInteger(maxFiles) || maxFiles <= 0)
    throw new Error("maxFiles must be a positive integer");
  if (!Number.isSafeInteger(maxProjectBytes) || maxProjectBytes <= 0) {
    throw new Error("maxProjectBytes must be a positive integer");
  }
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error("requestTimeoutMs must be a positive integer");
  }
  if (!Number.isSafeInteger(downloadConcurrency) || downloadConcurrency <= 0) {
    throw new Error("downloadConcurrency must be a positive integer");
  }
  if (!Number.isSafeInteger(downloadAttempts) || downloadAttempts <= 0) {
    throw new Error("downloadAttempts must be a positive integer");
  }
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) {
    throw new Error("retryDelayMs must be a non-negative integer");
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
    const artifactPath = relative(siteDistDir, file).split(sep).join("/");
    // Edition files are immutable; rendered page references are scanned separately.
    if (isPlaybookEditionFilePath(artifactPath)) continue;
    references.push(...extractReferences(content, siteUrl, mediaOrigin, basePath));
  }
  for (const url of options.clippingResourceUrls ?? [])
    references.push(...extractReferences(url, siteUrl, mediaOrigin, basePath));
  const referenceByRaw = new Map(references.map((reference) => [reference.raw, reference]));

  const uniqueReferences = new Map<string, AssetReference>();
  for (const reference of references) {
    uniqueReferences.set(fetchKey(reference), reference);
  }

  const entriesByKey = new Map<string, PublicMediaManifestEntry>();
  const outputRoot = resolve(siteDistDir, ".");
  if (options.includeDerivedWatermarkVariants) {
    for (const reference of references) {
      for (const renderId of DERIVED_WATERMARK_RENDER_IDS) {
        const derived = deriveWatermarkReference(reference, renderId, mediaOrigin, basePath);
        if (derived) {
          const derivedKey = fetchKey(derived);
          if (!uniqueReferences.has(derivedKey)) uniqueReferences.set(derivedKey, derived);
        }
      }
      for (const sibling of deriveSiblingWatermarkReferences(reference, mediaOrigin, basePath)) {
        const siblingKey = fetchKey(sibling);
        if (!uniqueReferences.has(siblingKey)) uniqueReferences.set(siblingKey, sibling);
      }
      // Legacy snapshots can render the unversioned facade URL while still
      // exposing v1 watermark candidates in their media metadata. Freeze the
      // canonical asset proactively so the later static build can reuse it.
      if (isLegacyDerivedWatermarkPath(reference.sourceUrl.pathname)) {
        const base = deriveBaseReference(reference, mediaOrigin, basePath);
        if (base) {
          const baseKey = fetchKey(base);
          if (!uniqueReferences.has(baseKey)) uniqueReferences.set(baseKey, base);
        }
      }
      if (options.includeMigratedWatermarkVariants) {
        for (const migrated of deriveMigratedWatermarkReferences(
          reference,
          mediaOrigin,
          basePath
        )) {
          const migratedKey = fetchKey(migrated);
          if (!uniqueReferences.has(migratedKey)) uniqueReferences.set(migratedKey, migrated);
        }
      }
    }
  }
  const referenceEntries = [...uniqueReferences.entries()];
  let nextReferenceIndex = 0;
  const downloadWorker = async () => {
    while (nextReferenceIndex < referenceEntries.length) {
      const currentIndex = nextReferenceIndex;
      nextReferenceIndex += 1;
      const [key, reference] = referenceEntries[currentIndex];
      let resolvedReference = reference;
      let result: DownloadResult;
      try {
        result = await downloadMedia(
          reference.fetchUrl,
          maxBytes,
          mediaOrigin,
          fetchImpl,
          requestTimeoutMs,
          downloadAttempts,
          retryDelayMs,
          fallbackFetchImpl
        );
      } catch (error) {
        if (!(error instanceof MediaNotFoundError) || !reference.fallback) throw error;
        resolvedReference = reference.fallback;
        reference.replacement = resolvedReference.replacement;
        result = await downloadMedia(
          resolvedReference.fetchUrl,
          maxBytes,
          mediaOrigin,
          fetchImpl,
          requestTimeoutMs,
          downloadAttempts,
          retryDelayMs,
          fallbackFetchImpl
        );
      }
      if (reference.required && result.status === "external") {
        throw new Error(
          `Required clipping resource exceeded the static media limit: ${reference.sourcePath}`
        );
      }
      let outputPath: string | null = null;
      if (result.status === "packaged") {
        if (!result.body)
          throw new Error(`Media origin returned no body: ${resolvedReference.sourcePath}`);
        const relativeOutput = resolvedReference.staticPath
          .replace(basePath, "")
          .replace(/^\/+/, "");
        const destination = resolve(siteDistDir, relativeOutput);
        if (!destination.startsWith(`${outputRoot}/`))
          throw new Error("Static media path escapes site-dist");
        await mkdir(resolve(destination, ".."), { recursive: true });
        await writeFile(destination, result.body);
        outputPath = resolvedReference.staticPath;
      }
      if (resolvedReference !== reference) {
        const fallbackKey = fetchKey(resolvedReference);
        if (!entriesByKey.has(fallbackKey)) {
          entriesByKey.set(fallbackKey, {
            sourcePath: resolvedReference.sourcePath,
            outputPath,
            bytes: result.bytes,
            status: result.status,
            reason: result.reason,
          });
        }
      }
      entriesByKey.set(key, {
        sourcePath: reference.sourcePath,
        outputPath,
        bytes: result.bytes,
        status: result.status,
        reason: result.reason,
        ...(resolvedReference === reference ? {} : { aliasOf: resolvedReference.sourcePath }),
      });
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(downloadConcurrency, referenceEntries.length) }, downloadWorker)
  );

  for (const [file, content] of fileContents) {
    const artifactPath = relative(siteDistDir, file).split(sep).join("/");
    if (isPlaybookEditionFilePath(artifactPath)) continue;
    const withStaticClippingBases = replaceClippingResourceBases(content, siteUrl, basePath);
    const rewritten = withStaticClippingBases.replace(PUBLIC_MEDIA_URL_RE, (token) => {
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
  const packaged = entries.filter((entry) => entry.status === "packaged" && !entry.aliasOf);
  const external = entries.filter((entry) => entry.status === "external" && !entry.aliasOf);
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
