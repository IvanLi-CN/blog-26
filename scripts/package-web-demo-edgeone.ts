#!/usr/bin/env bun

import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { collectStaticFiles, createEdgeoneCacheConfig } from "./prepare-edgeone-pwa-config";

/**
 * Packages the static Web Demo for EdgeOne Makers direct upload.
 *
 * The public Demo and the Admin Demo are both static artifacts, so the upload is
 * the site root plus the repository's existing `edge-functions` proxy layer. No
 * server runtime is involved and no Node function is emitted.
 */

const repoRoot = resolve(import.meta.dir, "..");
const siteDist = resolve(repoRoot, process.env.WEB_DEMO_SITE_DIST_DIR || "web-demo-site-dist");
const adminDist = resolve(repoRoot, process.env.WEB_DEMO_ADMIN_DIST_DIR || "web-demo-admin-dist");
const edgeFunctionsDir = join(repoRoot, "edge-functions");
const artifactDir = resolve(
  repoRoot,
  process.env.WEB_DEMO_EDGEONE_ARTIFACT_DIR || "edgeone-web-demo-dist"
);
const publicSiteUrl = process.env.WEB_DEMO_PUBLIC_SITE_URL || "https://blog-demo.ivanli.cc";

async function assertDirectory(path: string, label: string) {
  const entry = await stat(path).catch(() => undefined);
  if (!entry?.isDirectory()) throw new Error(`${label} is missing: ${relative(repoRoot, path)}/`);
}

async function assertFile(path: string, label: string) {
  const entry = await stat(path).catch(() => undefined);
  if (!entry?.isFile()) throw new Error(`${label} is missing: ${relative(repoRoot, path)}`);
}

async function assertMissing(path: string, label: string) {
  const entry = await stat(path).catch(() => undefined);
  if (entry)
    throw new Error(`${label} must not be part of the static Demo: ${relative(repoRoot, path)}`);
}

/** Copies the static site and mounts the Admin SPA under `/admin/`. */
async function stageSite() {
  await cp(siteDist, artifactDir, { recursive: true });
  await cp(adminDist, join(artifactDir, "admin"), { recursive: true });
  // Admin SPA fallback: any `/admin/*` document request resolves to its shell.
  await cp(join(adminDist, "index.html"), join(artifactDir, "admin", "index.html"));
}

async function writeedgeoneConfig() {
  const staticFiles = await collectStaticFiles(artifactDir);
  const cache = createEdgeoneCacheConfig("", staticFiles);
  const config = {
    ...cache,
    // The Admin SPA owns `/admin/*`; serve its shell for client-side routes.
    rewrites: [{ source: "/admin/*", destination: "/admin/index.html" }],
  };
  await writeFile(join(artifactDir, "edgeone.json"), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

async function countFiles(root: string) {
  let total = 0;
  for await (const _entry of new Bun.Glob("**/*").scan({ cwd: root })) total++;
  return total;
}

async function main() {
  if (!artifactDir.startsWith(`${repoRoot}/`)) {
    throw new Error(
      `WEB_DEMO_EDGEONE_ARTIFACT_DIR must stay inside the repository: ${artifactDir}`
    );
  }
  await assertDirectory(siteDist, "Web Demo static site");
  await assertDirectory(adminDist, "Web Demo admin site");
  await assertFile(join(siteDist, "index.html"), "Web Demo home document");
  await assertMissing(join(siteDist, "server"), "Web Demo server output");
  await assertDirectory(edgeFunctionsDir, "EdgeOne edge functions");

  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });

  console.log("== stage static site ==");
  await stageSite();

  console.log("== stage edge functions ==");
  await cp(edgeFunctionsDir, join(artifactDir, "edge-functions"), { recursive: true });

  console.log("== write edgeone.json ==");
  const config = await writeedgeoneConfig();

  const versionSource = await readFile(join(siteDist, "version.json"), "utf8").catch(() => "{}");
  const files = await countFiles(artifactDir);
  console.log(
    `\nEdgeOne Web Demo artifact ready: ${relative(repoRoot, artifactDir)} ` +
      `(${files} files, ${config.headers.length} cache rules, site ${publicSiteUrl})`
  );
  console.log(`version.json: ${versionSource.trim()}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
