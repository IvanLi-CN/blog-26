import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  CLIPPING_RESOURCE_BASE_FACADE_RE,
  fetchPublicResourceOverHttp11,
  type PublicMediaManifest,
  packagePublicMedia,
} from "../../../scripts/package-public-media";
import { withoutDeploymentCredentials } from "../playbook/child-env";
import { sealDirectory, verifyDirectory } from "./artifacts";
import type { ReleaseEntry } from "./ledger";
import { canonicalJson, shaSchema, versionSchema } from "./policy";

export const DEFAULT_RELEASE_MEDIA_DOWNLOAD_CONCURRENCY = 8;
export const MAX_RELEASE_MEDIA_DOWNLOAD_CONCURRENCY = 8;

export function resolveReleaseMediaDownloadConcurrency(
  raw = process.env.PUBLIC_STATIC_MEDIA_DOWNLOAD_CONCURRENCY
): number {
  const value = Number(raw || DEFAULT_RELEASE_MEDIA_DOWNLOAD_CONCURRENCY);
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_RELEASE_MEDIA_DOWNLOAD_CONCURRENCY
  ) {
    throw new Error(
      `PUBLIC_STATIC_MEDIA_DOWNLOAD_CONCURRENCY must be an integer from 1 to ${MAX_RELEASE_MEDIA_DOWNLOAD_CONCURRENCY}`
    );
  }
  return value;
}

export const frozenConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    identity: z.string(),
    productVersion: versionSchema,
    sourceSha: shaSchema,
    buildDate: z.iso.datetime(),
    bunVersion: z.literal("1.4.2"),
    nodeVersion: z.literal("v22.23.2"),
    baseImages: z
      .object({
        build: z.string().regex(/^oven\/bun@sha256:[a-f0-9]{64}$/),
        runtime: z.string().regex(/^oven\/bun@sha256:[a-f0-9]{64}$/),
      })
      .strict(),
    env: z.record(z.string(), z.string()),
  })
  .strict();
export type FrozenConfig = z.infer<typeof frozenConfigSchema>;
const publicEnvNames = [
  "PUBLIC_API_BASE_URL",
  "PUBLIC_SITE_URL",
  "PUBLIC_SITE_BASE_PATH",
  "PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL",
  "PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL",
  "PUBLIC_OCTO_RILL_METRICS_BASE_URL",
] as const;

const snapshotRetryDelaysMs = [1_000, 3_000] as const;
const snapshotRequestTimeoutMs = 60_000;
export const DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const clippingResourceReferenceRe = /\.\/assets\/[a-f0-9]{64}\.[a-z0-9]+(?:[?#][^"'`\s<>)]+)?/giu;
export type ClippingSnapshotArticle = {
  source: string | null;
  translation: string | null;
  resourceBaseUrl?: string | null;
};
type SnapshotFetcher = (input: URL, init?: RequestInit) => Promise<Response>;
type SnapshotSleep = (delayMs: number) => Promise<unknown>;
const fetchPublicSnapshotOverHttp11: SnapshotFetcher = async (input, init) => {
  const response = await fetchPublicResourceOverHttp11(
    input,
    init,
    snapshotRequestTimeoutMs,
    DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES
  );
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(declaredLength) && declaredLength > DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES) {
    throw new Error(`Public snapshot response exceeds ${DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES} bytes`);
  }
  return response;
};

export function clippingResourceUrlsFromSnapshot(
  articles: Record<string, ClippingSnapshotArticle> | undefined,
  publicApiBaseUrl: string
) {
  const apiOrigin = new URL(publicApiBaseUrl).origin;
  return Object.values(articles ?? {}).flatMap((article) => {
    if (!article.resourceBaseUrl) return [];
    const base = new URL(article.resourceBaseUrl, publicApiBaseUrl);
    if (base.origin !== apiOrigin || !CLIPPING_RESOURCE_BASE_FACADE_RE.test(base.pathname))
      return [];
    return [article.source, article.translation]
      .filter((content): content is string => Boolean(content))
      .flatMap((content) =>
        [...content.matchAll(clippingResourceReferenceRe)].map(
          (match) => new URL(match[0].replace(/^\.\/assets\//u, ""), base).href
        )
      );
  });
}

function isRetryableSnapshotStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function cancelSnapshotResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already unusable; cleanup must not mask the acquisition error.
  }
}

async function readSnapshotResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(declaredLength) && declaredLength > DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES) {
    await cancelSnapshotResponseBody(response);
    throw new Error(`Public snapshot response exceeds ${DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES} bytes`);
  }

  if (!response.body) {
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES) {
      throw new Error(
        `Public snapshot response exceeds ${DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES} bytes`
      );
    }
    return new TextDecoder().decode(body);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error(
          `Public snapshot response exceeds ${DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES} bytes`
        );
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
  return new TextDecoder().decode(body);
}

export async function fetchPublicSnapshot(
  snapshotUrl: URL,
  fetcher: SnapshotFetcher = fetch,
  sleep: SnapshotSleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  fallbackFetcher: SnapshotFetcher | undefined = fetcher === fetch
    ? fetchPublicSnapshotOverHttp11
    : undefined
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= snapshotRetryDelaysMs.length; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(snapshotUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(snapshotRequestTimeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt === snapshotRetryDelaysMs.length) break;
      await sleep(snapshotRetryDelaysMs[attempt] || 0);
      continue;
    }

    if (!response.ok) {
      lastError = new Error(`Public snapshot acquisition failed (HTTP ${response.status})`);
      await cancelSnapshotResponseBody(response);
      if (!isRetryableSnapshotStatus(response.status)) throw lastError;
      if (attempt === snapshotRetryDelaysMs.length) break;
      await sleep(snapshotRetryDelaysMs[attempt] || 0);
      continue;
    }

    try {
      // Consume the body inside the retry boundary. Edge failures can occur after
      // the headers arrive, while the chunked response is being read.
      const body = await readSnapshotResponseText(response);
      return new Response(body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error) {
      lastError = error;
      await cancelSnapshotResponseBody(response);
      if (attempt === snapshotRetryDelaysMs.length) break;
      await sleep(snapshotRetryDelaysMs[attempt] || 0);
    }
  }
  if (fallbackFetcher) {
    try {
      const response = await fallbackFetcher(snapshotUrl);
      if (!response.ok) {
        throw new Error(`Public snapshot acquisition failed (HTTP ${response.status})`);
      }
      return response;
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      const originalMessage =
        lastError instanceof Error ? `; last fetch error: ${lastError.message}` : "";
      throw new Error(
        `Public snapshot acquisition failed after fetch retries and HTTP/1.1 fallback: ${fallbackMessage}${originalMessage}`,
        { cause: fallbackError }
      );
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Public snapshot acquisition failed");
}

export async function buildCommand(
  args: string[],
  env: Record<string, string | undefined> = {},
  cwd = process.cwd()
): Promise<void> {
  const child = Bun.spawn(args, {
    cwd,
    env: withoutDeploymentCredentials(process.env, env),
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) throw new Error(`Build command failed: ${args[0]}`);
}

function baseImage(tag: string): string {
  execFileSync("docker", ["pull", "--platform", "linux/amd64", tag], { stdio: "inherit" });
  const value = execFileSync(
    "docker",
    ["image", "inspect", tag, "--format", "{{index .RepoDigests 0}}"],
    { encoding: "utf8" }
  ).trim();
  if (!/^oven\/bun@sha256:[a-f0-9]{64}$/.test(value))
    throw new Error("Base image digest is missing");
  return value;
}

export async function freezeInputs(entry: ReleaseEntry, root: string): Promise<void> {
  if (!entry.mergeSha || entry.stage !== "merged")
    throw new Error("Only a registered merged source can freeze external inputs");
  const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (source !== entry.mergeSha || (await readFile("VERSION", "utf8")) !== `${entry.version}\n`)
    throw new Error("Checkout is not the registered product source");
  const env: Record<string, string> = {};
  for (const name of publicEnvNames) env[name] = process.env[name] || "";
  env.PUBLIC_API_BASE_URL ||= "https://console.ivanli.cc";
  env.PUBLIC_SITE_URL ||= "https://ivanli.cc";
  env.PUBLIC_SITE_BASE_PATH ||= "/";
  for (const name of publicEnvNames.filter((name) => name !== "PUBLIC_SITE_BASE_PATH")) {
    if (!env[name]) continue;
    const url = new URL(env[name]);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      throw new Error("Public build configuration must not contain signed or credential URLs");
  }
  await mkdir(root, { recursive: true });
  const snapshotUrl = new URL(
    process.env.PUBLIC_CONTENT_SNAPSHOT_URL || "/api/public/snapshot",
    env.PUBLIC_API_BASE_URL
  );
  if (
    snapshotUrl.origin !== new URL(env.PUBLIC_API_BASE_URL).origin ||
    snapshotUrl.username ||
    snapshotUrl.password ||
    snapshotUrl.search ||
    snapshotUrl.hash
  )
    throw new Error("Snapshot URL must stay within the public API origin");
  const response = await fetchPublicSnapshot(snapshotUrl);
  const snapshot = await response.text();
  // The public snapshot is JSON data, never executable input.
  const parsed = z
    .object({
      generatedAt: z.string(),
      posts: z.array(z.unknown()),
      memos: z.array(z.unknown()),
      clippingArticles: z
        .record(
          z.string(),
          z.object({
            source: z.string().nullable(),
            translation: z.string().nullable(),
            resourceBaseUrl: z.string().nullable().optional(),
          })
        )
        .optional(),
      tags: z.object({ timelines: z.record(z.string(), z.unknown()) }),
    })
    .parse(JSON.parse(snapshot));
  if (!parsed.generatedAt) throw new Error("Public snapshot identity is missing");
  const clippingResourceUrls = clippingResourceUrlsFromSnapshot(
    parsed.clippingArticles,
    env.PUBLIC_API_BASE_URL
  );
  await writeFile(join(root, "public-snapshot.json"), snapshot);
  await mkdir("site/generated", { recursive: true });
  await writeFile("site/generated/public-snapshot.json", snapshot);
  await buildCommand(["bun", "scripts/update-llm-model-catalog.ts"]);
  await cp("src/generated/llm-model-catalog.json", join(root, "llm-model-catalog.json"));
  // The upstream Playbook credential is used only for initial public bundle acquisition.
  const acquire = Bun.spawn(["bun", "scripts/fetch-initial-playbook.ts"], {
    env: {
      ...withoutDeploymentCredentials(process.env),
      GH_TOKEN: process.env.PLAYBOOK_SOURCE_TOKEN,
      GITHUB_ENV: undefined,
      GITHUB_OUTPUT: undefined,
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await acquire.exited) !== 0) throw new Error("Initial public Playbook acquisition failed");
  const prepareEnv: Record<string, string | undefined> = {
    COMMIT_HASH: entry.mergeSha,
    PLAYBOOK_RENDERER_COMMIT: entry.mergeSha,
    PLAYBOOK_REQUIRED: "true",
    PLAYBOOK_USE_DEPLOYED: "true",
    PLAYBOOK_BUNDLE_DIR: ".tmp/playbook-initial",
  };
  // Existing deployed editions do not need the initial bundle path.
  const { existsSync } = await import("node:fs");
  if (!existsSync(".tmp/playbook-initial/playbook-public-manifest.json"))
    delete prepareEnv.PLAYBOOK_BUNDLE_DIR;
  await buildCommand(["bun", "scripts/prepare-playbook-edition.ts"], prepareEnv);
  await cp("public/_content/playbook", join(root, "playbook"), { recursive: true });
  await cp("site/generated/playbook-edition.json", join(root, "playbook-edition.json"));
  const mediaRoot = join(root, "media");
  await mkdir(mediaRoot, { recursive: true });
  await writeFile(join(mediaRoot, "snapshot.json"), snapshot);
  const media = await packagePublicMedia({
    siteDistDir: mediaRoot,
    mediaOrigin: env.PUBLIC_API_BASE_URL,
    siteUrl: env.PUBLIC_SITE_URL,
    siteBasePath: env.PUBLIC_SITE_BASE_PATH,
    downloadConcurrency: resolveReleaseMediaDownloadConcurrency(),
    includeDerivedWatermarkVariants: true,
    clippingResourceUrls,
  });
  if (media.externalCount)
    throw new Error(
      "All release media must be frozen; an oversized external asset prevents release"
    );
  const config = frozenConfigSchema.parse({
    schemaVersion: 1,
    identity: entry.id,
    productVersion: entry.version,
    sourceSha: entry.mergeSha,
    buildDate: entry.createdAt,
    bunVersion: "1.4.2",
    nodeVersion: "v22.23.2",
    baseImages: { build: baseImage("oven/bun:1.4.2"), runtime: baseImage("oven/bun:1.4.2-slim") },
    env,
  });
  await writeFile(join(root, "config.json"), `${canonicalJson(config)}\n`);
  await cp("bun.lock", join(root, "bun.lock"));
  await cp("package.json", join(root, "package.json"));
  await sealDirectory(root, entry, "inputs");
}

export async function restoreInputs(entry: ReleaseEntry, root: string): Promise<FrozenConfig> {
  if (
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== entry.mergeSha ||
    (await readFile("VERSION", "utf8")) !== `${entry.version}\n`
  )
    throw new Error("Frozen build checkout differs from its registered source");
  await verifyDirectory(root, entry, "inputs", entry.inputs?.manifestDigest);
  const config = frozenConfigSchema.parse(
    JSON.parse(await readFile(join(root, "config.json"), "utf8"))
  );
  if (
    config.identity !== entry.id ||
    config.sourceSha !== entry.mergeSha ||
    config.productVersion !== entry.version ||
    execFileSync("bun", ["--version"], { encoding: "utf8" }).trim() !== config.bunVersion ||
    process.version !== config.nodeVersion
  ) {
    // Bun's process.version is Node compatibility; use the actual Node executable.
    const node = execFileSync("node", ["--version"], { encoding: "utf8" }).trim();
    if (
      config.identity !== entry.id ||
      config.sourceSha !== entry.mergeSha ||
      config.productVersion !== entry.version ||
      execFileSync("bun", ["--version"], { encoding: "utf8" }).trim() !== config.bunVersion ||
      node !== config.nodeVersion
    )
      throw new Error("Frozen build configuration/runtime changed");
  }
  for (const file of ["bun.lock", "package.json"])
    if (!(await readFile(file)).equals(await readFile(join(root, file))))
      throw new Error("Frozen dependency contract differs from source");
  await mkdir("site/generated", { recursive: true });
  await cp(join(root, "public-snapshot.json"), "site/generated/public-snapshot.json");
  await cp(join(root, "llm-model-catalog.json"), "src/generated/llm-model-catalog.json");
  return config;
}

export async function packageFrozenMedia(
  root: string,
  config: FrozenConfig,
  siteDistDir = "site-dist"
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(join(root, "media/_content/media-manifest.json"), "utf8")
  ) as PublicMediaManifest;
  const media = await packagePublicMedia({
    siteDistDir,
    mediaOrigin: config.env.PUBLIC_API_BASE_URL,
    siteUrl: config.env.PUBLIC_SITE_URL,
    siteBasePath: config.env.PUBLIC_SITE_BASE_PATH,
    downloadAttempts: 1,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.origin !== new URL(config.env.PUBLIC_API_BASE_URL || "").origin)
        throw new Error("Frozen media origin changed");
      const key = (value: string) => {
        const parsed = new URL(value, config.env.PUBLIC_API_BASE_URL);
        parsed.searchParams.delete("v");
        return `${parsed.pathname}${parsed.search}`;
      };
      const entry = manifest.entries.find((item) => key(item.sourcePath) === key(url.href));
      if (!entry?.outputPath || entry.status !== "packaged")
        throw new Error("Media was not covered by the frozen public snapshot");
      const base = config.env.PUBLIC_SITE_BASE_PATH === "/" ? "" : config.env.PUBLIC_SITE_BASE_PATH;
      const relative = entry.outputPath.slice((base || "").length).replace(/^\/+/, "");
      const path = resolve(root, "media", relative);
      if (!path.startsWith(`${resolve(root, "media")}/`))
        throw new Error("Frozen media path escapes input root");
      return new Response(await readFile(path));
    },
  });
  if (media.externalCount) throw new Error("Release output retains unfrozen external media");
}
