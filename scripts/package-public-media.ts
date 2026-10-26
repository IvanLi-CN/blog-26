#!/usr/bin/env bun

import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { withoutDeploymentCredentials } from "../src/lib/playbook/child-env";

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
export const DEFAULT_MAX_HEADER_BYTES = 64 * 1024;
const RESPONSE_BODY_CHUNK_BYTES = 64 * 1024;
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
  contentLength?: number;
  chunked: boolean;
  noBody: boolean;
};

type ByteArray = Uint8Array<ArrayBufferLike>;

type PublicHttp11Process = {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill: () => void;
};

export type PublicHttp11Spawner = (
  args: string[],
  options: {
    stdout: "pipe";
    stderr: "pipe";
    timeout: number;
    env: Record<string, string | undefined>;
  }
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
    if (/^\s/u.test(line)) {
      throw new Error("HTTP/1.1 fallback returned a folded response header");
    }
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator), line.slice(separator + 1).trim());
  }
  const rawContentLength = headers.get("content-length");
  let contentLength: number | undefined;
  if (rawContentLength !== null) {
    const values = rawContentLength.split(",").map((value) => value.trim());
    if (
      values.length === 0 ||
      values.some((value) => !/^\d+$/u.test(value)) ||
      new Set(values).size !== 1
    ) {
      throw new Error("HTTP/1.1 fallback returned an invalid content length");
    }
    contentLength = Number(values[0]);
    if (!Number.isSafeInteger(contentLength)) {
      throw new Error("HTTP/1.1 fallback returned an invalid content length");
    }
  }
  const transferEncodings = headers
    .get("transfer-encoding")
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const chunked = transferEncodings?.at(-1) === "chunked";
  if (transferEncodings && (transferEncodings.length !== 1 || !chunked)) {
    throw new Error("HTTP/1.1 fallback returned an unsupported transfer encoding");
  }
  if (chunked && contentLength !== undefined) {
    throw new Error("HTTP/1.1 fallback returned conflicting response framing headers");
  }
  const contentEncodings = headers
    .get("content-encoding")
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (contentEncodings?.some((value) => value !== "identity")) {
    throw new Error("HTTP/1.1 fallback returned an unsupported content encoding");
  }
  const noBody =
    (status >= 100 && status < 200) || status === 204 || status === 205 || status === 304;
  return { status, headers, contentLength, chunked, noBody };
}

class ByteQueue {
  private readonly chunks: ByteArray[] = [];
  private headIndex = 0;
  private headOffset = 0;
  private total = 0;

  get byteLength() {
    return this.total;
  }

  push(chunk: ByteArray) {
    if (chunk.byteLength === 0) return;
    this.chunks.push(chunk);
    this.total += chunk.byteLength;
  }

  findLineEnd() {
    let index = 0;
    for (let chunkIndex = this.headIndex; chunkIndex < this.chunks.length; chunkIndex += 1) {
      const chunk = this.chunks[chunkIndex];
      const start = chunkIndex === this.headIndex ? this.headOffset : 0;
      for (let offset = start; offset < chunk.byteLength; offset += 1) {
        if (chunk[offset] === 10) return index + 1;
        index += 1;
      }
    }
    return -1;
  }

  findHeaderEnd() {
    const recent: number[] = [];
    let index = 0;
    for (let chunkIndex = this.headIndex; chunkIndex < this.chunks.length; chunkIndex += 1) {
      const chunk = this.chunks[chunkIndex];
      const start = chunkIndex === this.headIndex ? this.headOffset : 0;
      for (let offset = start; offset < chunk.byteLength; offset += 1) {
        recent.push(chunk[offset]);
        if (recent.length > 4) recent.shift();
        if (
          recent.length >= 4 &&
          recent.at(-4) === 13 &&
          recent.at(-3) === 10 &&
          recent.at(-2) === 13 &&
          recent.at(-1) === 10
        ) {
          return index + 1;
        }
        if (recent.length >= 2 && recent.at(-2) === 10 && recent.at(-1) === 10) {
          return index + 1;
        }
        index += 1;
      }
    }
    return -1;
  }

  peek(length: number): ByteArray {
    if (length < 0 || length > this.total)
      throw new Error("ByteQueue peek exceeds available bytes");
    const result = new Uint8Array(length);
    let offset = 0;
    this.forEachView(length, (view) => {
      result.set(view, offset);
      offset += view.byteLength;
    });
    return result;
  }

  take(length: number): ByteArray {
    const result = new Uint8Array(length);
    let offset = 0;
    this.consume(length, (view) => {
      result.set(view, offset);
      offset += view.byteLength;
    });
    return result;
  }

  consume(length: number, consumer: (view: ByteArray) => void) {
    if (length < 0 || length > this.total) {
      throw new Error("ByteQueue consume exceeds available bytes");
    }
    let remaining = length;
    while (remaining > 0) {
      const chunk = this.chunks[this.headIndex];
      const available = chunk.byteLength - this.headOffset;
      const consumed = Math.min(available, remaining);
      consumer(chunk.subarray(this.headOffset, this.headOffset + consumed));
      this.headOffset += consumed;
      this.total -= consumed;
      remaining -= consumed;
      if (this.headOffset === chunk.byteLength) {
        this.headIndex += 1;
        this.headOffset = 0;
        if (this.headIndex === this.chunks.length) {
          this.chunks.length = 0;
          this.headIndex = 0;
        } else if (this.headIndex >= 128 && this.headIndex * 2 >= this.chunks.length) {
          this.chunks.splice(0, this.headIndex);
          this.headIndex = 0;
        }
      }
    }
  }

  private forEachView(length: number, consumer: (view: ByteArray) => void) {
    let remaining = length;
    for (let chunkIndex = this.headIndex; remaining > 0; chunkIndex += 1) {
      const chunk = this.chunks[chunkIndex];
      const start = chunkIndex === this.headIndex ? this.headOffset : 0;
      const available = chunk.byteLength - start;
      const consumed = Math.min(available, remaining);
      consumer(chunk.subarray(start, start + consumed));
      remaining -= consumed;
    }
  }
}

class CurlHeaderLimitError extends Error {}

class CurlBodyLimitError extends Error {}

function abortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException("The operation was aborted", "AbortError");
}

async function readProcessDiagnostics(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<string> {
  const reader = stream.getReader();
  const chunks: ByteArray[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const next = await reader.read();
      if (next.done) break;
      const remaining = maxBytes - total;
      const chunk = next.value.byteLength > remaining ? next.value.slice(0, remaining) : next.value;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < next.value.byteLength || total >= maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readCurlResponseWithinLimits(
  stream: ReadableStream<Uint8Array>,
  maxBodyBytes: number | undefined,
  maxHeaderBytes: number,
  kill: () => void,
  signal?: AbortSignal
): Promise<{
  body: Uint8Array;
  headersTooLarge: boolean;
  parsed?: ParsedCurlHeaders;
  tooLarge: boolean;
}> {
  const reader = stream.getReader();
  let headerBytesSeen = 0;
  const pending = new ByteQueue();
  let parsed: ParsedCurlHeaders | undefined;
  const chunks: ByteArray[] = [];
  let bodyChunk = new Uint8Array(RESPONSE_BODY_CHUNK_BYTES);
  let bodyChunkOffset = 0;
  let total = 0;
  let chunkState: "size" | "data" | "terminator" | "trailers" | "done" = "size";
  let chunkRemaining = 0;
  let abortListener: (() => void) | undefined;
  const decoder = new TextDecoder();
  if (signal) {
    abortListener = () => {
      kill();
      void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", abortListener, { once: true });
    if (signal.aborted) abortListener();
  }
  const appendBody = (value: ByteArray) => {
    if (value.byteLength === 0) return;
    total += value.byteLength;
    if (maxBodyBytes !== undefined && total > maxBodyBytes) throw new CurlBodyLimitError();
    let offset = 0;
    while (offset < value.byteLength) {
      const available = RESPONSE_BODY_CHUNK_BYTES - bodyChunkOffset;
      const copied = Math.min(available, value.byteLength - offset);
      bodyChunk.set(value.subarray(offset, offset + copied), bodyChunkOffset);
      bodyChunkOffset += copied;
      offset += copied;
      if (bodyChunkOffset === RESPONSE_BODY_CHUNK_BYTES) {
        chunks.push(bodyChunk);
        bodyChunk = new Uint8Array(RESPONSE_BODY_CHUNK_BYTES);
        bodyChunkOffset = 0;
      }
    }
  };
  const consumeChunkedBody = () => {
    while (true) {
      if (chunkState === "size") {
        const lineEnd = pending.findLineEnd();
        if (lineEnd < 0) {
          if (pending.byteLength > maxHeaderBytes) throw new CurlHeaderLimitError();
          return;
        }
        if (lineEnd > maxHeaderBytes) throw new CurlHeaderLimitError();
        const line = decoder.decode(pending.take(lineEnd)).replace(/\r?\n$/u, "");
        const sizeToken = line.split(";", 1)[0]?.trim() ?? "";
        if (!/^[0-9a-f]+$/iu.test(sizeToken)) {
          throw new Error("HTTP/1.1 fallback returned an invalid chunk size");
        }
        let size: bigint;
        try {
          size = BigInt(`0x${sizeToken}`);
        } catch {
          throw new Error("HTTP/1.1 fallback returned an invalid chunk size");
        }
        if (size > BigInt(Number.MAX_SAFE_INTEGER)) {
          if (maxBodyBytes !== undefined) throw new CurlBodyLimitError();
          throw new Error("HTTP/1.1 fallback returned an oversized chunk");
        }
        if (maxBodyBytes !== undefined && size > BigInt(maxBodyBytes) - BigInt(total)) {
          throw new CurlBodyLimitError();
        }
        chunkRemaining = Number(size);
        chunkState = chunkRemaining === 0 ? "trailers" : "data";
        continue;
      }

      if (chunkState === "data") {
        const consumed = Math.min(chunkRemaining, pending.byteLength);
        pending.consume(consumed, appendBody);
        chunkRemaining -= consumed;
        if (chunkRemaining > 0) return;
        chunkState = "terminator";
        continue;
      }

      if (chunkState === "terminator") {
        if (pending.byteLength < 2) return;
        const terminator = pending.take(2);
        if (terminator[0] !== 13 || terminator[1] !== 10) {
          throw new Error("HTTP/1.1 fallback returned an invalid chunk terminator");
        }
        chunkState = "size";
        continue;
      }

      if (chunkState === "trailers") {
        if (pending.byteLength === 0) return;
        const prefix = pending.peek(Math.min(2, pending.byteLength));
        if ((prefix.length >= 2 && prefix[0] === 13 && prefix[1] === 10) || prefix[0] === 10) {
          const emptyTrailerLength = prefix[0] === 10 ? 1 : 2;
          pending.consume(emptyTrailerLength, () => undefined);
          headerBytesSeen += emptyTrailerLength;
          if (headerBytesSeen > maxHeaderBytes) throw new CurlHeaderLimitError();
          chunkState = "done";
          continue;
        }
        const trailerEnd = pending.findHeaderEnd();
        if (trailerEnd < 0) {
          if (headerBytesSeen + pending.byteLength > maxHeaderBytes) {
            throw new CurlHeaderLimitError();
          }
          return;
        }
        headerBytesSeen += trailerEnd;
        if (headerBytesSeen > maxHeaderBytes) throw new CurlHeaderLimitError();
        pending.consume(trailerEnd, () => undefined);
        chunkState = "done";
        continue;
      }

      if (pending.byteLength > 0) {
        throw new Error("HTTP/1.1 fallback returned bytes after the response body");
      }
      return;
    }
  };
  try {
    while (true) {
      if (signal?.aborted) throw abortReason(signal);
      const next = await reader.read();
      if (next.done) break;
      if (signal?.aborted) throw abortReason(signal);
      pending.push(next.value);
      while (!parsed) {
        const headerEnd = pending.findHeaderEnd();
        if (headerEnd < 0) {
          if (headerBytesSeen + pending.byteLength > maxHeaderBytes) {
            throw new CurlHeaderLimitError();
          }
          break;
        }
        headerBytesSeen += headerEnd;
        if (headerBytesSeen > maxHeaderBytes) throw new CurlHeaderLimitError();
        const current = parseCurlHeaders(decoder.decode(pending.take(headerEnd)));
        if (current.status >= 100 && current.status < 200 && current.status !== 101) continue;
        parsed = current;
      }
      if (!parsed) continue;
      if (parsed.noBody) {
        if (pending.byteLength > 0) {
          throw new Error("HTTP/1.1 fallback returned bytes for a response without a body");
        }
        continue;
      }
      if (parsed.contentLength !== undefined && maxBodyBytes !== undefined) {
        if (parsed.contentLength > maxBodyBytes) throw new CurlBodyLimitError();
      }
      if (parsed.chunked) {
        consumeChunkedBody();
      } else {
        const remaining =
          parsed.contentLength === undefined ? pending.byteLength : parsed.contentLength - total;
        if (pending.byteLength > remaining) {
          throw new Error("HTTP/1.1 fallback returned more bytes than its content length");
        }
        pending.consume(pending.byteLength, appendBody);
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (signal?.aborted) throw abortReason(signal);
    if (error instanceof CurlHeaderLimitError) {
      kill();
      return { body: new Uint8Array(), headersTooLarge: true, parsed, tooLarge: false };
    }
    if (error instanceof CurlBodyLimitError) {
      kill();
      return { body: new Uint8Array(), headersTooLarge: false, parsed, tooLarge: true };
    }
    throw error;
  } finally {
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
    reader.releaseLock();
  }

  const isChunkedComplete = () => chunkState === "done";
  if (parsed?.chunked && !parsed.noBody && !isChunkedComplete()) {
    throw new Error("HTTP/1.1 fallback returned a truncated chunked response");
  }
  if (
    parsed &&
    !parsed.noBody &&
    !parsed.chunked &&
    parsed.contentLength !== undefined &&
    total !== parsed.contentLength
  ) {
    throw new Error("HTTP/1.1 fallback returned a truncated response body");
  }

  if (bodyChunkOffset > 0) chunks.push(bodyChunk.slice(0, bodyChunkOffset));
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, headersTooLarge: false, parsed, tooLarge: false };
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
  if (init.signal?.aborted) throw abortReason(init.signal);
  const url = new URL(String(input));
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("HTTP/1.1 public resource fallback requires an HTTPS URL without credentials");
  }
  if (maxBodyBytes !== undefined && (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0)) {
    throw new Error("maxBodyBytes must be a positive integer");
  }
  const child = spawnImpl(
    [
      "curl",
      "--disable",
      "--globoff",
      "--silent",
      "--show-error",
      "--http1.1",
      "--no-compressed",
      "--raw",
      "--proto",
      "=https",
      "--max-time",
      String(Math.ceil(requestTimeoutMs / 1_000)),
      "--include",
      "--suppress-connect-headers",
      "--output",
      "-",
      url.href,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      timeout: requestTimeoutMs,
      env: withoutDeploymentCredentials(process.env),
    }
  );
  const abortHandler = init.signal ? () => child.kill() : undefined;
  if (init.signal && abortHandler) {
    init.signal.addEventListener("abort", abortHandler, { once: true });
  }
  const diagnosticsPromise = readProcessDiagnostics(child.stderr, DEFAULT_MAX_HEADER_BYTES).catch(
    () => ""
  );
  try {
    const body = await readCurlResponseWithinLimits(
      child.stdout,
      maxBodyBytes,
      DEFAULT_MAX_HEADER_BYTES,
      () => child.kill(),
      init.signal ?? undefined
    );
    const [diagnostics, exitCode] = await Promise.all([diagnosticsPromise, child.exited]);
    if (init.signal?.aborted) throw abortReason(init.signal);
    if (body.headersTooLarge) {
      throw new Error(
        `HTTP/1.1 public resource fallback response headers exceed ${DEFAULT_MAX_HEADER_BYTES} bytes`
      );
    }
    if (exitCode !== 0 && !body.tooLarge) {
      const details = diagnostics.trim();
      throw new Error(`HTTP/1.1 public resource fallback failed${details ? `: ${details}` : ""}`);
    }
    if (!body.parsed) throw new Error("HTTP/1.1 fallback did not return a valid response status");
    if (body.tooLarge) {
      const headers = new Headers(body.parsed.headers);
      if (body.parsed.chunked) headers.delete("transfer-encoding");
      headers.set("content-length", String((maxBodyBytes ?? 0) + 1));
      return new Response(null, { headers, status: body.parsed.status });
    }
    const responseBody = body.parsed.noBody ? null : new ArrayBuffer(body.body.byteLength);
    if (responseBody) new Uint8Array(responseBody).set(body.body);
    const headers = new Headers(body.parsed.headers);
    if (body.parsed.noBody) {
      headers.delete("content-length");
    } else if (body.parsed.chunked) {
      headers.delete("transfer-encoding");
      headers.delete("trailer");
      headers.set("content-length", String(body.body.byteLength));
    }
    return new Response(responseBody, {
      headers,
      status: body.parsed.status,
    });
  } catch (error) {
    child.kill();
    const [diagnostics, exitCode] = await Promise.all([diagnosticsPromise, child.exited]);
    if (init.signal?.aborted) throw abortReason(init.signal);
    if (exitCode !== 0) {
      const details = diagnostics.trim();
      throw new Error(`HTTP/1.1 public resource fallback failed${details ? `: ${details}` : ""}`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    if (init.signal && abortHandler) {
      init.signal.removeEventListener("abort", abortHandler);
    }
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
  /^\/api\/public\/assets\/(post|memo)\/([^/]+)\/([^/]+)\/(wm-[ab]-v[12345])\/(card|cover|content|full|social|poster)\.([a-z0-9]+)$/iu;
const DERIVED_WATERMARK_RENDER_IDS = ["wm-a-v5", "wm-b-v5"] as const;

/**
 * Public media presentation URLs use a stable format per variant. The API
 * also exposes source-format candidates for compatibility, but those
 * candidates are not part of the static site's render contract.
 */
export function canonicalPublicMediaPath(pathname: string) {
  const match = PUBLIC_DERIVED_RENDER_VARIANT_RE.exec(pathname);
  if (!match?.[4].endsWith("-v4") && !match?.[4].endsWith("-v5")) return pathname;

  const variant = match[5].toLowerCase();
  const extension = match[6].toLowerCase();
  let canonicalExtension: string | undefined;
  if (extension === "gif") {
    // Card renders are emitted as WebP in the static package, even when the
    // upstream facade exposes the source-format GIF candidate.
    canonicalExtension = ["card", "content", "full"].includes(variant) ? "webp" : "jpg";
  } else if (["avif", "bmp", "jpeg", "jpg", "png"].includes(extension)) {
    canonicalExtension = ["social", "poster"].includes(variant) ? "jpg" : "webp";
  }
  if (!canonicalExtension || canonicalExtension === extension) return pathname;

  const extensionStart = pathname.lastIndexOf(".");
  return `${pathname.slice(0, extensionStart + 1)}${canonicalExtension}`;
}

export function canonicalPublicMediaFetchKey(
  value: string | URL,
  baseUrl = "https://public.invalid"
) {
  const url = new URL(String(value), baseUrl);
  url.pathname = canonicalPublicMediaPath(url.pathname);
  url.searchParams.delete("v");
  return `${url.pathname}${url.search}`;
}

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
      if (error instanceof MediaPolicyError) throw error;
      if (lastError instanceof MediaNotFoundError) throw lastError;
      if (error instanceof MediaNotFoundError || !isRetryableError(error)) throw error;
      throw mediaDownloadError(url, downloadAttempts, error);
    }
  }

  if (lastError instanceof MediaNotFoundError || lastError instanceof MediaHttpError)
    throw lastError;
  throw mediaDownloadError(url, downloadAttempts, lastError);
}

function fetchKey(reference: AssetReference) {
  return canonicalPublicMediaFetchKey(reference.fetchUrl);
}

function canonicalizeWatermarkReference(
  reference: AssetReference,
  mediaOrigin: string,
  basePath: string,
  siteUrl: string
): AssetReference {
  const canonicalPath = canonicalPublicMediaPath(reference.sourceUrl.pathname);
  if (canonicalPath === reference.sourceUrl.pathname) return reference;

  const sourceUrl = new URL(reference.sourceUrl.href);
  sourceUrl.pathname = canonicalPath;
  const sourcePath = `${sourceUrl.pathname}${sourceUrl.search}`;
  const fetchUrl = `${mediaOrigin}${sourcePath}`;
  const staticPath = sitePath(
    basePath,
    `${STATIC_MEDIA_PREFIX}${canonicalPath.slice(PUBLIC_MEDIA_FACADE_PREFIX.length)}`
  );
  const suffix = `${sourceUrl.search}${sourceUrl.hash}`;
  const absolute = isAbsoluteHttpUrl(reference.raw);

  return {
    ...reference,
    sourceUrl,
    fetchUrl,
    staticPath,
    replacement: (status) => {
      if (status === "external") return `${mediaOrigin}${sourcePath}${sourceUrl.hash}`;
      const path = `${staticPath}${suffix}`;
      return absolute ? `${new URL(siteUrl).origin}${path}` : path;
    },
    fallback: reference.fallback
      ? canonicalizeWatermarkReference(reference.fallback, mediaOrigin, basePath, siteUrl)
      : undefined,
  };
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
  const siblingRenderIds = currentRenderId.endsWith("-v5")
    ? DERIVED_WATERMARK_RENDER_IDS
    : currentRenderId.endsWith("-v4")
      ? (["wm-a-v4", "wm-b-v4"] as const)
      : currentRenderId.endsWith("-v3")
        ? (["wm-a-v3", "wm-b-v3"] as const)
        : null;
  if (!siblingRenderIds) {
    return [];
  }
  return siblingRenderIds
    .filter((renderId) => renderId !== currentRenderId)
    .map((renderId) => {
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

function deriveMigratedWatermarkReferences(
  reference: AssetReference,
  mediaOrigin: string,
  basePath: string
): AssetReference[] {
  const match = PUBLIC_DERIVED_RENDER_VARIANT_RE.exec(reference.sourceUrl.pathname);
  if (!match || match[4]?.endsWith("-v3") || match[4]?.endsWith("-v4") || match[4]?.endsWith("-v5"))
    return [];
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
  const normalizedReferences = references.map((reference) =>
    canonicalizeWatermarkReference(reference, mediaOrigin, basePath, siteUrl)
  );
  const referenceByRaw = new Map(
    references.map((reference, index) => [reference.raw, normalizedReferences[index]])
  );

  const uniqueReferences = new Map<string, AssetReference>();
  const addUniqueReference = (reference: AssetReference) => {
    const normalized = canonicalizeWatermarkReference(reference, mediaOrigin, basePath, siteUrl);
    uniqueReferences.set(fetchKey(normalized), normalized);
  };
  for (const reference of normalizedReferences) {
    addUniqueReference(reference);
  }

  const entriesByKey = new Map<string, PublicMediaManifestEntry>();
  const outputRoot = resolve(siteDistDir, ".");
  if (options.includeDerivedWatermarkVariants) {
    for (const reference of references) {
      for (const renderId of DERIVED_WATERMARK_RENDER_IDS) {
        const derived = deriveWatermarkReference(reference, renderId, mediaOrigin, basePath);
        if (derived && !uniqueReferences.has(fetchKey(derived))) addUniqueReference(derived);
      }
      for (const sibling of deriveSiblingWatermarkReferences(reference, mediaOrigin, basePath)) {
        const siblingKey = fetchKey(sibling);
        if (!uniqueReferences.has(siblingKey)) addUniqueReference(sibling);
      }
      // Legacy snapshots can render the unversioned facade URL while still
      // exposing v1 watermark candidates in their media metadata. Freeze the
      // canonical asset proactively so the later static build can reuse it.
      if (isLegacyDerivedWatermarkPath(reference.sourceUrl.pathname)) {
        const base = deriveBaseReference(reference, mediaOrigin, basePath);
        if (base) {
          const baseKey = fetchKey(base);
          if (!uniqueReferences.has(baseKey)) addUniqueReference(base);
        }
      }
      if (options.includeMigratedWatermarkVariants) {
        for (const migrated of deriveMigratedWatermarkReferences(
          reference,
          mediaOrigin,
          basePath
        )) {
          const migratedKey = fetchKey(migrated);
          if (!uniqueReferences.has(migratedKey)) addUniqueReference(migrated);
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
