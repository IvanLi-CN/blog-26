#!/usr/bin/env bun

import { execSync, spawn } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  E2E_DEFAULT_DB_PATH,
  E2E_DEFAULT_LOCAL_CONTENT_PATH,
  E2E_DEFAULT_WEB_PORT,
} from "../tests/e2e/runtime";
import { E2E_PROJECTS, type E2EProjectName, getProjectReportDir } from "../tests/e2e/taxonomy";

type ProjectRuntime = {
  project: E2EProjectName;
  dbPath: string;
  localContentPath: string;
  port: number;
  sitePort: number;
  adminPort: number;
  publicMediaPort: number;
};

function isPortBusy(port: number): boolean {
  try {
    const output = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN -n || true`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function pickPortTriplet(basePort: number, usedPorts: Set<number>) {
  let candidate = basePort;
  while (candidate < basePort + 2_000) {
    const sitePort = candidate + 3;
    const adminPort = candidate + 4;
    const ports = [candidate, sitePort, adminPort];
    const isAvailable = ports.every((port) => !usedPorts.has(port) && !isPortBusy(port));
    if (isAvailable) {
      for (const port of ports) {
        usedPorts.add(port);
      }
      return {
        port: candidate,
        sitePort,
        adminPort,
      };
    }
    candidate += 10;
  }
  throw new Error(`Unable to allocate an isolated E2E port triplet from ${basePort}`);
}

function pickSinglePort(basePort: number, usedPorts: Set<number>) {
  let candidate = basePort;
  while (candidate < basePort + 2_000) {
    if (!usedPorts.has(candidate) && !isPortBusy(candidate)) {
      usedPorts.add(candidate);
      return candidate;
    }
    candidate += 1;
  }
  throw new Error(`Unable to allocate an isolated port from ${basePort}`);
}

function readPublicMediaPort(rawBaseUrl: string | undefined, fallbackPort: number) {
  if (!rawBaseUrl?.trim()) {
    return fallbackPort;
  }

  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.port) {
      return Number(parsed.port);
    }
    return parsed.protocol === "https:" ? 443 : 80;
  } catch {
    return fallbackPort;
  }
}

function usage() {
  console.log(`Usage:
  bun ./scripts/run-e2e.ts full [-- <extra playwright args>]
  bun ./scripts/run-e2e.ts project <guest|admin|user|mcp> [-- <extra playwright args>]
`);
}

function splitArgs(argv: string[]) {
  const separator = argv.indexOf("--");
  if (separator === -1) {
    return { main: argv, passthrough: [] as string[] };
  }
  return {
    main: argv.slice(0, separator),
    passthrough: argv.slice(separator + 1),
  };
}

function parseMode(argv: string[]) {
  const [mode, project] = argv;
  if (mode !== "full" && mode !== "project") {
    usage();
    process.exit(1);
  }
  if (mode === "project") {
    if (!project || !E2E_PROJECTS.includes(project as E2EProjectName)) {
      usage();
      process.exit(1);
    }
    return { mode, project: project as E2EProjectName } as const;
  }
  return { mode, project: null } as const;
}

function runStep(name: string, cmd: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    console.log(`\n== ${name} ==`);
    const child = spawn(cmd[0], cmd.slice(1), {
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${name} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function ensurePathExists(target: string) {
  await stat(target);
}

async function prepareProjectRuntime(rootDir: string, project: E2EProjectName, index: number) {
  const basePort = Number(process.env.E2E_BASE_PORT || E2E_DEFAULT_WEB_PORT + 100);
  const basePublicMediaPort = readPublicMediaPort(
    process.env.PUBLIC_MEDIA_IMAGOR_BASE_URL,
    E2E_DEFAULT_WEB_PORT + 900
  );
  const projectDir = path.join(rootDir, project);
  const dbPath = path.join(projectDir, "sqlite.db");
  const localContentPath = path.join(projectDir, "local");
  const { port, sitePort, adminPort } = pickPortTriplet(basePort + index * 10, allocatedPorts);
  const publicMediaPort = pickSinglePort(basePublicMediaPort + index * 10, allocatedPorts);

  await rm(projectDir, { recursive: true, force: true });
  await mkdir(projectDir, { recursive: true });
  await cp(E2E_DEFAULT_DB_PATH, dbPath);
  await cp(E2E_DEFAULT_LOCAL_CONTENT_PATH, localContentPath, { recursive: true });

  return {
    project,
    dbPath,
    localContentPath,
    port,
    sitePort,
    adminPort,
    publicMediaPort,
  } satisfies ProjectRuntime;
}

const allocatedPorts = new Set<number>();

async function prepareIsolatedRuntimes(projects: E2EProjectName[]) {
  const runtimeRoot = path.resolve(process.cwd(), "tmp/e2e-projects");
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(runtimeRoot, { recursive: true });
  return Promise.all(
    projects.map((project, index) => prepareProjectRuntime(runtimeRoot, project, index))
  );
}

function runProject(projectRuntime: ProjectRuntime, extraArgs: string[]) {
  return new Promise<{ project: E2EProjectName; code: number }>((resolve) => {
    const reportDir = getProjectReportDir(projectRuntime.project);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DB_PATH: projectRuntime.dbPath,
      LOCAL_CONTENT_BASE_PATH: projectRuntime.localContentPath,
      CONTENT_SOURCES: "local",
      PORT: String(projectRuntime.port),
      WEB_PORT: String(projectRuntime.port),
      SITE_PORT: String(projectRuntime.sitePort),
      ADMIN_PORT: String(projectRuntime.adminPort),
      BASE_URL: `http://localhost:${projectRuntime.port}`,
      PUBLIC_SITE_URL: `http://localhost:${projectRuntime.port}`,
      PUBLIC_API_BASE_URL: `http://localhost:${projectRuntime.port}`,
      PUBLIC_MEDIA_IMAGOR_BASE_URL: `http://127.0.0.1:${projectRuntime.publicMediaPort}`,
      PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL: `http://host.docker.internal:${projectRuntime.port}`,
      ENABLE_DEV_ENDPOINTS: "true",
      LLM_MODEL_CATALOG_SKIP_REFRESH: "1",
      PLAYWRIGHT_DISABLE_WEBSERVER: "0",
      PLAYWRIGHT_SKIP_RESET: "1",
      PLAYWRIGHT_SKIP_BUILD: "1",
      PLAYWRIGHT_TEST_PROJECT: projectRuntime.project,
      PLAYWRIGHT_REPORT_ROOT: reportDir,
      PLAYWRIGHT_PUBLIC_MEDIA_CONTAINER_NAME: `imagorvideo-playwright-${projectRuntime.project}-${projectRuntime.publicMediaPort}`,
    };

    console.log(
      `\n== Running project ${projectRuntime.project} on ${env.BASE_URL} with DB ${projectRuntime.dbPath} ==`
    );

    const child = spawn(
      "bun",
      ["x", "playwright", "test", "--project", projectRuntime.project, ...extraArgs],
      {
        env,
        stdio: "inherit",
      }
    );

    child.on("exit", (code) => {
      resolve({ project: projectRuntime.project, code: code ?? 1 });
    });
  });
}

async function runFull(extraArgs: string[]) {
  const sharedEnv: NodeJS.ProcessEnv = {
    DB_PATH: E2E_DEFAULT_DB_PATH,
    LOCAL_CONTENT_BASE_PATH: E2E_DEFAULT_LOCAL_CONTENT_PATH,
    CONTENT_SOURCES: "local",
    PUBLIC_SITE_URL: `http://localhost:${E2E_DEFAULT_WEB_PORT}`,
    PUBLIC_API_BASE_URL: `http://localhost:${E2E_DEFAULT_WEB_PORT}`,
    LLM_MODEL_CATALOG_SKIP_REFRESH: "1",
  };

  await ensurePathExists(E2E_DEFAULT_DB_PATH);
  await ensurePathExists(E2E_DEFAULT_LOCAL_CONTENT_PATH);
  await runStep("Reset test environment", ["bun", "run", "test-env:reset-fs-only"], sharedEnv);
  await runStep("Prebuild metadata", ["bun", "run", "prebuild"], sharedEnv);
  await rm(path.resolve(process.cwd(), "site-dist"), { recursive: true, force: true });
  await rm(path.resolve(process.cwd(), "admin-dist"), { recursive: true, force: true });
  await rm(path.resolve(process.cwd(), "backend-dist"), { recursive: true, force: true });
  await runStep("Build compiled artifacts", ["bun", "run", "build:compiled"], sharedEnv);

  const runtimes = await prepareIsolatedRuntimes([...E2E_PROJECTS]);
  const results = await Promise.all(runtimes.map((runtime) => runProject(runtime, extraArgs)));
  const failed = results.filter((result) => result.code !== 0);

  console.log("\n== E2E project summary ==");
  for (const result of results) {
    console.log(`- ${result.project}: ${result.code === 0 ? "passed" : `failed (${result.code})`}`);
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

async function runSingleProject(project: E2EProjectName, extraArgs: string[]) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYWRIGHT_TEST_PROJECT: project,
    PUBLIC_MEDIA_IMAGOR_BASE_URL:
      process.env.PUBLIC_MEDIA_IMAGOR_BASE_URL || "http://127.0.0.1:18000",
    PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL:
      process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL || "http://host.docker.internal:25090",
  };
  await runStep(
    `Playwright project ${project}`,
    ["bun", "x", "playwright", "test", "--project", project, ...extraArgs],
    env
  );
}

async function main() {
  const { main: rawArgs, passthrough } = splitArgs(process.argv.slice(2));
  const parsed = parseMode(rawArgs);

  if (parsed.mode === "full") {
    await runFull(passthrough);
    return;
  }

  await runSingleProject(parsed.project, passthrough);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
