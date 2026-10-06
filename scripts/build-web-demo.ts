#!/usr/bin/env bun

import { mkdir, rm, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const generatedRoot = resolve(process.env.WEB_DEMO_DATA_DIR || "dev-data/web-demo");
const siteDist = resolve(process.env.WEB_DEMO_SITE_DIST_DIR || "web-demo-site-dist");
const adminDist = resolve(process.env.WEB_DEMO_ADMIN_DIST_DIR || "web-demo-admin-dist");
const publicSnapshotPath = resolve(generatedRoot, "public-snapshot.json");
const playbookBundleDir = resolve(generatedRoot, "playbook-fixture");

function assertGeneratedPath(path: string, label: string, exactPaths: string[] = []) {
  const root = resolve(repoRoot, "dev-data");
  const candidate = resolve(path);
  const prefix = `${root}/`;
  const isAllowedExactPath = exactPaths.some((allowedPath) => candidate === resolve(allowedPath));
  if (
    !isAllowedExactPath &&
    !candidate.startsWith(prefix) &&
    !candidate.startsWith(`${resolve(repoRoot, ".tmp")}/`)
  ) {
    throw new Error(
      `${label} must stay inside dev-data/ or .tmp/: ${relative(repoRoot, candidate)}`
    );
  }
}

async function run(label: string, args: string[], env: NodeJS.ProcessEnv) {
  console.log(`\n== ${label} ==`);
  const child = Bun.spawn(["bun", ...args], {
    cwd: repoRoot,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${label} failed with exit code ${exitCode}`);
}

async function assertFile(path: string) {
  const entry = await stat(path).catch(() => undefined);
  if (!entry?.isFile()) throw new Error(`Web Demo build is missing ${relative(repoRoot, path)}`);
}

export async function prepareWebDemoInputs() {
  assertGeneratedPath(generatedRoot, "WEB_DEMO_DATA_DIR");
  await rm(generatedRoot, { recursive: true, force: true });
  await mkdir(generatedRoot, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DB_PATH: relative(repoRoot, join(generatedRoot, "sqlite.db")),
    LOCAL_CONTENT_BASE_PATH: relative(repoRoot, join(generatedRoot, "local")),
    CONTENT_SOURCES: "local",
    PI_DURABLE_DB_PATH: relative(repoRoot, join(generatedRoot, "pi-durable.sqlite")),
    CLIPPING_CONTENT_BASE_PATH: relative(repoRoot, join(generatedRoot, "clippings")),
    CLIPPING_PROCESSOR_ENABLED: "false",
    PUBLIC_SNAPSHOT_PATH: relative(repoRoot, publicSnapshotPath),
    PLAYBOOK_BUNDLE_DIR: relative(repoRoot, playbookBundleDir),
    PLAYBOOK_WORK_DIR: relative(repoRoot, join(generatedRoot, "playbook-work")),
    WEB_DEMO_BUILD: "true",
    PUBLIC_WEB_DEMO_BUILD: "true",
    VITE_WEB_DEMO_BUILD: "true",
    ASTRO_OUT_DIR: relative(repoRoot, siteDist),
    ADMIN_OUT_DIR: relative(repoRoot, adminDist),
    ASTRO_CACHE_DIR: ".astro-web-demo",
    VITE_CACHE_DIR: "node_modules/.vite-web-demo",
    CONSOLE_RUNTIME: "false",
    PUBLIC_API_BASE_URL: "",
    PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL: "",
    PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL: "",
    PUBLIC_OCTO_RILL_METRICS_BASE_URL: "",
  };

  await run("prepare deterministic local content", ["run", "migrate"], env);
  await run("seed deterministic local content", ["run", "seed"], env);
  await run("write deterministic local fixtures", ["scripts/generate-test-data.ts", "--dev"], env);
  await run("sync deterministic local fixtures", ["run", "dev-sync:trigger"], env);
  await run("generate public snapshot", ["run", "public:export"], env);
  await run(
    "generate Playbook fixture",
    ["tests/lib/playbook-fixture.ts", playbookBundleDir, "--long"],
    env
  );
  await run("prepare Playbook edition", ["run", "playbook:prepare"], env);
  await run("generate public assets", ["run", "generate:public-pwa"], env);
  await run("generate project posters", ["run", "generate:project-posters"], env);
  await run("generate project social previews", ["run", "generate:project-social-previews"], env);
  return env;
}

async function main() {
  assertGeneratedPath(siteDist, "WEB_DEMO_SITE_DIST_DIR", [
    resolve(repoRoot, "web-demo-site-dist"),
  ]);
  assertGeneratedPath(adminDist, "WEB_DEMO_ADMIN_DIST_DIR", [
    resolve(repoRoot, "web-demo-admin-dist"),
  ]);
  await rm(siteDist, { recursive: true, force: true });
  await rm(adminDist, { recursive: true, force: true });
  const env = await prepareWebDemoInputs();
  await run("build public Web Demo", ["x", "astro", "build"], env);
  await run(
    "build admin Web Demo",
    ["x", "vite", "build", "--config", "apps/admin/vite.config.ts", "--configLoader", "runner"],
    env
  );

  await Promise.all([
    assertFile(join(siteDist, "index.html")),
    assertFile(join(siteDist, "memos", "index.html")),
    assertFile(join(siteDist, "memos", "memo-web-demo-0001", "index.html")),
    assertFile(join(siteDist, "memos", "memo-web-demo-2400", "index.html")),
    assertFile(join(siteDist, "memos", "memo-web-demo-1181", "index.html")),
    assertFile(join(siteDist, "playbook", "index.html")),
    assertFile(join(adminDist, "index.html")),
  ]);
  console.log(
    `\nWeb Demo build ready: ${relative(repoRoot, siteDist)} + ${relative(repoRoot, adminDist)}`
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
