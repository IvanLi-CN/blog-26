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
}

/**
 * Direct upload never runs the platform build, so EdgeOne decides the fallback
 * itself. Its `@edgeone/is-spa` detector counts HTML files that reference scripts
 * and finds exactly one here — the Admin shell — and then treats the whole Demo
 * as an SPA, which makes it answer every unmatched path with `index.html` and a
 * `200`, and ignore `404.html`.
 *
 * Two committed files settle that, both read from the upload instead of inferred:
 * `needsFallback: false` overrides the detector (an explicit boolean wins over
 * the heuristic), and the route table pins the Admin shell rewrite ahead of a
 * real `404.html` fallback. `edgeone.json` cannot express either: direct upload
 * keeps only its `redirects`, `rewrites`, and `headers`.
 */
async function writeEdgeoneRoutingFiles() {
  await mkdir(join(artifactDir, ".edgeone"), { recursive: true });
  await writeFile(join(artifactDir, ".edgeone-assets-config.json"), '{"needsFallback":false}\n');
  const routes = {
    version: 3,
    routes: [
      { handle: "filesystem" },
      { src: "/.*", dest: "/404.html", "server-name": "file", status: 404 },
    ],
    conf: {
      rewrites: [{ source: "/admin/*", destination: "/admin/index.html" }],
    },
  };
  await writeFile(
    join(artifactDir, ".edgeone", "routes.json"),
    `${JSON.stringify(routes, null, 2)}\n`
  );
}

/** Re-reads both routing files, so a rename or a path change fails the package. */
async function assertRoutingFiles() {
  const assetsConfig = JSON.parse(
    await readFile(join(artifactDir, ".edgeone-assets-config.json"), "utf8")
  ) as { needsFallback?: boolean };
  if (assetsConfig.needsFallback !== false) {
    throw new Error("EdgeOne asset config must disable the SPA fallback heuristic");
  }
  const routes = JSON.parse(
    await readFile(join(artifactDir, ".edgeone", "routes.json"), "utf8")
  ) as {
    routes?: { status?: number; dest?: string }[];
    conf?: { rewrites?: { source?: string; destination?: string }[] };
  };
  if (routes.routes?.find((route) => route.status === 404)?.dest !== "/404.html") {
    throw new Error("EdgeOne route table must end unmatched paths on /404.html with status 404");
  }
  const adminRewrite = routes.conf?.rewrites?.find((rewrite) => rewrite.source === "/admin/*");
  if (adminRewrite?.destination !== "/admin/index.html") {
    throw new Error("EdgeOne route table must keep the /admin/* shell rewrite");
  }
}

async function writeedgeoneConfig() {
  // The two routing files are platform input, not published assets: counting
  // them would add a pointless header rule and spend one of the 30 allowed.
  const staticFiles = (await collectStaticFiles(artifactDir)).filter(
    (file) => file !== ".edgeone-assets-config.json" && !file.startsWith(".edgeone/")
  );
  const cache = createEdgeoneCacheConfig("", staticFiles);
  const config = {
    ...cache,
    // This rewrite is the Admin SPA fallback: a `/admin/*` document request that
    // matches no built file is answered with the shell.
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

  console.log("== write EdgeOne routing files ==");
  await writeEdgeoneRoutingFiles();
  await assertRoutingFiles();

  console.log("== write edgeone.json ==");
  const config = await writeedgeoneConfig();

  await assertMissing(join(artifactDir, "edge-functions"), "Web Demo proxy layer");
  await assertNoBackendReferences(artifactDir);

  const versionSource = await readFile(join(siteDist, "version.json"), "utf8").catch(() => "{}");
  const files = await countFiles(artifactDir);
  console.log(
    `\nEdgeOne Web Demo artifact ready: ${relative(repoRoot, artifactDir)} ` +
      `(${files} files, ${config.headers.length} cache rules, 404 fallback, site ${publicSiteUrl})`
  );
  console.log(`version.json: ${versionSource.trim()}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
