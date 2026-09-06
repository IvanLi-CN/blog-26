#!/usr/bin/env bun

import { appendFile, readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import {
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_PROJECT_BYTES,
  extractPublicMediaUrls,
  PUBLIC_MEDIA_FACADE_PREFIX,
  type PublicMediaManifest,
  STATIC_MEDIA_PREFIX,
} from "./package-public-media";

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

export type VerifyPublicMediaPackageOptions = {
  cwd?: string;
  artifactDir?: string;
  mediaOrigin?: string;
  siteBasePath?: string;
  maxFiles?: number;
  maxProjectBytes?: number;
};

function normalizeOrigin(value: string) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/"
  ) {
    throw new Error("PUBLIC_STATIC_MEDIA_ORIGIN must be an HTTPS origin without credentials");
  }
  return parsed.origin;
}

function normalizeBasePath(raw: string) {
  const value = raw.trim();
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

function removeBasePath(pathname: string, basePath: string) {
  if (!basePath) return pathname;
  if (!pathname.startsWith(`${basePath}/`)) {
    throw new Error(`Static media path does not include site base path: ${pathname}`);
  }
  return pathname.slice(basePath.length);
}

async function listFiles(root: string) {
  const files: string[] = [];
  const walk = async (directory: string) => {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  };
  await walk(root);
  return files;
}

function normalizeReferenceKey(raw: string, siteUrl: string) {
  const parsed = new URL(raw, siteUrl);
  parsed.searchParams.delete("v");
  return `${parsed.pathname}${parsed.search}`;
}

function writeOutput(key: string, value: string) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return Promise.resolve();
  return appendFile(outputPath, `${key}=${value}\n`, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManifest(value: unknown): PublicMediaManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    throw new Error("Invalid public media manifest");
  }
  const entries = value.entries.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error(`Invalid public media manifest entry ${index}`);
    const { sourcePath, outputPath, bytes, status, reason } = candidate;
    if (
      typeof sourcePath !== "string" ||
      !sourcePath ||
      (outputPath !== null && typeof outputPath !== "string") ||
      !Number.isSafeInteger(bytes) ||
      (bytes as number) < 0 ||
      (status !== "packaged" && status !== "external") ||
      (reason !== null && typeof reason !== "string")
    ) {
      throw new Error(`Invalid public media manifest entry ${index}`);
    }
    return { sourcePath, outputPath, bytes, status, reason };
  });
  const { maxBytes, packagedCount, packagedBytes, externalCount } = value;
  if (
    !Number.isSafeInteger(maxBytes) ||
    (maxBytes as number) <= 0 ||
    !Number.isSafeInteger(packagedCount) ||
    (packagedCount as number) < 0 ||
    !Number.isSafeInteger(packagedBytes) ||
    (packagedBytes as number) < 0 ||
    !Number.isSafeInteger(externalCount) ||
    (externalCount as number) < 0
  ) {
    throw new Error("Invalid public media manifest counters");
  }
  return {
    schemaVersion: 1,
    maxBytes,
    entries,
    packagedCount,
    packagedBytes,
    externalCount,
  } as PublicMediaManifest;
}

export async function verifyPublicMediaPackage(
  options: VerifyPublicMediaPackageOptions = {}
): Promise<{ fileCount: number; totalBytes: number }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const artifactDir = resolve(cwd, options.artifactDir ?? "site-dist");
  const basePath = normalizeBasePath(
    options.siteBasePath ?? process.env.PUBLIC_SITE_BASE_PATH ?? ""
  );
  const mediaOrigin = normalizeOrigin(
    options.mediaOrigin ?? process.env.PUBLIC_STATIC_MEDIA_ORIGIN ?? ""
  );
  const maxFiles =
    options.maxFiles ?? Number(process.env.PUBLIC_STATIC_MEDIA_MAX_FILES ?? DEFAULT_MAX_FILES);
  const maxProjectBytes =
    options.maxProjectBytes ??
    Number(process.env.PUBLIC_STATIC_MEDIA_MAX_PROJECT_BYTES ?? DEFAULT_MAX_PROJECT_BYTES);
  const siteUrl = process.env.PUBLIC_SITE_URL || "https://ivanli.cc";
  const manifestPath = join(artifactDir, "_content", "media-manifest.json");
  const manifest = parseManifest(JSON.parse(await readFile(manifestPath, "utf8")));

  const files = await listFiles(artifactDir);
  const fileCount = files.length;
  const totalBytes = (await Promise.all(files.map(async (file) => (await stat(file)).size))).reduce(
    (total, size) => total + size,
    0
  );
  if (fileCount >= maxFiles) {
    throw new Error(
      `EdgeOne artifact contains ${fileCount} files, reaching the ${maxFiles} file limit`
    );
  }
  if (totalBytes >= maxProjectBytes) {
    throw new Error(
      `EdgeOne artifact is ${totalBytes} bytes, reaching the ${maxProjectBytes} byte limit`
    );
  }

  const entryByKey = new Map(
    manifest.entries.map((entry) => [normalizeReferenceKey(entry.sourcePath, siteUrl), entry])
  );
  const packagedEntries = manifest.entries.filter((entry) => entry.status === "packaged");
  const externalEntries = manifest.entries.filter((entry) => entry.status === "external");
  const packagedBytes = packagedEntries.reduce((total, entry) => total + entry.bytes, 0);
  if (manifest.packagedCount !== packagedEntries.length) {
    throw new Error("Public media manifest packagedCount does not match its entries");
  }
  if (manifest.packagedBytes !== packagedBytes) {
    throw new Error("Public media manifest packagedBytes does not match its entries");
  }
  if (manifest.externalCount !== externalEntries.length) {
    throw new Error("Public media manifest externalCount does not match its entries");
  }

  const expectedStaticFiles = new Set<string>();
  for (const entry of manifest.entries) {
    if (entry.status === "external") {
      if (entry.outputPath !== null) {
        throw new Error(
          `External media entry unexpectedly has an output path: ${entry.sourcePath}`
        );
      }
      continue;
    }
    if (!entry.outputPath) {
      throw new Error(`Packaged media entry is missing an output path: ${entry.sourcePath}`);
    }
    const outputUrl = new URL(entry.outputPath, siteUrl);
    const outputPath = removeBasePath(outputUrl.pathname, basePath);
    if (!outputPath.startsWith(STATIC_MEDIA_PREFIX)) {
      throw new Error(`Packaged media path is outside the static namespace: ${entry.outputPath}`);
    }
    if (outputPath.split("/").some((segment) => segment === "." || segment === "..")) {
      throw new Error(`Packaged media path contains traversal: ${entry.outputPath}`);
    }
    const relativeOutputPath = outputPath.slice(1);
    if (expectedStaticFiles.has(relativeOutputPath)) {
      throw new Error(`Duplicate packaged media output path: ${entry.outputPath}`);
    }
    expectedStaticFiles.add(relativeOutputPath);
    const outputFile = resolve(artifactDir, outputPath.slice(1));
    const outputStat = await stat(outputFile).catch(() => null);
    if (!outputStat?.isFile()) {
      throw new Error(`Packaged media file is missing: ${entry.outputPath}`);
    }
    if (outputStat.size !== entry.bytes) {
      throw new Error(`Packaged media size mismatch: ${entry.outputPath}`);
    }
  }

  const staticAssetsDir = join(artifactDir, STATIC_MEDIA_PREFIX.slice(1));
  const staticFiles = await stat(staticAssetsDir)
    .then((result) => (result.isDirectory() ? listFiles(staticAssetsDir) : []))
    .catch(() => [] as string[]);
  const actualStaticFiles = new Set(
    staticFiles.map((file) => relative(artifactDir, file).split(sep).join("/"))
  );
  for (const file of actualStaticFiles) {
    if (!expectedStaticFiles.has(file)) {
      throw new Error(`Untracked static media file is present: /${file}`);
    }
  }
  for (const file of expectedStaticFiles) {
    if (!actualStaticFiles.has(file)) {
      throw new Error(`Packaged media file is missing from the static namespace: /${file}`);
    }
  }

  for (const file of files) {
    if (file === manifestPath || !TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    const content = await readFile(file, "utf8");
    for (const raw of extractPublicMediaUrls(content)) {
      const parsed = new URL(raw, siteUrl);
      const entry = entryByKey.get(normalizeReferenceKey(raw, siteUrl));
      if (!entry) throw new Error(`Untracked public media reference: ${parsed.pathname}`);
      if (entry.status === "packaged") {
        throw new Error(`Packaged media still uses facade URL: ${parsed.pathname}`);
      }
      if (!raw.startsWith(`${mediaOrigin}${PUBLIC_MEDIA_FACADE_PREFIX}`)) {
        throw new Error(
          `External media reference must use the configured origin: ${parsed.pathname}`
        );
      }
    }

    for (const match of content.matchAll(
      /(?:https?:\/\/[^"'`\s<>]+)?\/_content\/assets\/[^"'`\s<>]+/g
    )) {
      const raw = match[0].replace(/[.,;:!?)}\]]+$/u, "");
      const parsed = new URL(raw, siteUrl);
      const outputPath = removeBasePath(parsed.pathname, basePath);
      if (!outputPath.startsWith(STATIC_MEDIA_PREFIX)) {
        throw new Error(
          `Static media reference is outside the static namespace: ${parsed.pathname}`
        );
      }
      if (outputPath.split("/").some((segment) => segment === "." || segment === "..")) {
        throw new Error(`Static media reference contains traversal: ${parsed.pathname}`);
      }
      const outputFile = resolve(artifactDir, outputPath.slice(1));
      if (!(await stat(outputFile).catch(() => null))) {
        throw new Error(`Static media reference is missing from the artifact: ${parsed.pathname}`);
      }
    }
  }

  await writeOutput("public_media_artifact_files", String(fileCount));
  await writeOutput("public_media_artifact_bytes", String(totalBytes));
  console.log(`[public-media] verified artifact: ${fileCount} files, ${totalBytes} bytes`);
  return { fileCount, totalBytes };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    console.log("Usage: bun scripts/verify-public-media-package.ts");
    console.log("Verifies the packaged public media and EdgeOne artifact limits.");
    process.exit(0);
  }
  await verifyPublicMediaPackage();
}
