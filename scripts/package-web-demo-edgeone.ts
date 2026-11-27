#!/usr/bin/env bun

import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { collectStaticFiles, createEdgeoneCacheConfig } from "./prepare-edgeone-pwa-config";

/**
 * Packages the static Web Demo for EdgeOne Makers direct upload.
 *
 * Both the public Demo and the Admin Demo are static artifacts. No server
 * runtime, no proxy layer: the package must not contain `edge-functions/`, so an
 * `/api/*` request ends as a plain static 404 instead of a dead proxy hop.
 */

const repoRoot = resolve(import.meta.dir, "..");
const siteDist = resolve(repoRoot, process.env.WEB_DEMO_SITE_DIST_DIR || "web-demo-site-dist");
const adminDist = resolve(repoRoot, process.env.WEB_DEMO_ADMIN_DIST_DIR || "web-demo-admin-dist");
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

/** Fails when shipped text references a backend route the Demo cannot serve. */
async function assertNoBackendReferences(root: string) {
  // Bare `/api/public/assets/` also appears as a client-side prefix check, which
  // never issues a request. Only a concrete media path is a real dependency.
  // `metrics.example.test` is not a dependency either: `webDemoFetch` answers
  // `/api/public/metrics/v1/*` in-page and never reaches that origin.
  const patterns = [/\/api\/public\/assets\/(?:post|memo)\//gu];
  const offenders: string[] = [];
  for await (const entry of new Bun.Glob("**/*.{html,json,js,css,svg,xml,txt}").scan({
    cwd: root,
  })) {
    // `_content/media-manifest.json` records source facade paths on purpose, and
    // Playbook editions are immutable published artifacts.
    if (entry === "_content/media-manifest.json" || entry.startsWith("_content/playbook/"))
      continue;
    const text = await Bun.file(join(root, entry)).text();
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) offenders.push(`${entry}: ${match[0]}`);
    }
    if (offenders.length > 20) break;
  }
  if (offenders.length > 0) {
    throw new Error(
      `The static Demo still references a backend route:\n  ${offenders.slice(0, 20).join("\n  ")}`
    );
  }
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

  await rm(artifactDir, { recursive: true, force: true });
  await mkdir(artifactDir, { recursive: true });

  console.log("== stage static site ==");
  await stageSite();

  console.log("== write edgeone.json ==");
  const config = await writeedgeoneConfig();

  await assertMissing(join(artifactDir, "edge-functions"), "Web Demo proxy layer");
  await assertNoBackendReferences(artifactDir);

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
