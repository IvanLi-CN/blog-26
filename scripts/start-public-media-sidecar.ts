#!/usr/bin/env bun

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function parseRequiredUrl(value: string, label: string) {
  try {
    return new URL(value);
  } catch (error) {
    throw new Error(
      `${label} must be a valid URL: ${error instanceof Error ? error.message : value}`
    );
  }
}

function readListenPort(url: URL) {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol === "https:" ? 443 : 80;
}

function sanitizeContainerName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-");
}

function resolveContainerCli() {
  const configured = process.env.PUBLIC_MEDIA_CONTAINER_CLI?.trim();
  const candidates = configured
    ? [configured]
    : [
        "docker",
        "/opt/homebrew/bin/docker",
        "/usr/local/bin/docker",
        "/Applications/Docker.app/Contents/Resources/bin/docker",
      ];

  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      if (existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    try {
      execFileSync("which", [candidate], { stdio: "ignore" });
      return candidate;
    } catch {
      // Ignore missing PATH entries and continue scanning known container CLIs.
    }
  }

  const availableFallbacks = ["/opt/homebrew/bin/colima", "/opt/homebrew/bin/limactl"].filter(
    (path) => existsSync(path)
  );
  const suffix =
    availableFallbacks.length > 0 ? ` Available VM tools: ${availableFallbacks.join(", ")}.` : "";
  throw new Error(
    `Public media sidecar requires a Docker-compatible CLI, but none was found. Install Docker CLI or set PUBLIC_MEDIA_CONTAINER_CLI.${suffix}`
  );
}

function removeContainer(containerCli: string, name: string) {
  try {
    execFileSync(containerCli, ["rm", "-f", name], {
      stdio: "ignore",
    });
  } catch {
    // Best-effort cleanup for prior failed runs.
  }
}

const imagorBaseUrl = trimTrailingSlash(
  process.env.PUBLIC_MEDIA_IMAGOR_BASE_URL?.trim() || "http://127.0.0.1:18000"
);
const internalSourceBaseUrl = trimTrailingSlash(
  process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL?.trim() || "http://host.docker.internal:25090"
);
const imagorUrl = parseRequiredUrl(imagorBaseUrl, "PUBLIC_MEDIA_IMAGOR_BASE_URL");
const internalSourceUrl = parseRequiredUrl(
  internalSourceBaseUrl,
  "PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL"
);
const imagorPort = readListenPort(imagorUrl);
const containerCli = resolveContainerCli();
const containerName = sanitizeContainerName(
  process.env.PLAYWRIGHT_PUBLIC_MEDIA_CONTAINER_NAME?.trim() ||
    `imagorvideo-playwright-${process.env.PLAYWRIGHT_TEST_PROJECT || "default"}-${imagorPort}`
);

removeContainer(containerCli, containerName);

const dockerArgs = [
  "run",
  "--rm",
  "--name",
  containerName,
  "--add-host",
  "host.docker.internal:host-gateway",
  "-p",
  `127.0.0.1:${imagorPort}:8000`,
  "-e",
  "IMAGOR_UNSAFE=1",
  "-e",
  `HTTP_LOADER_ALLOWED_SOURCES=${internalSourceUrl.host}`,
  "-e",
  "HTTP_LOADER_BLOCK_PRIVATE_NETWORKS=0",
  "-e",
  "HTTP_LOADER_HTTPS_ONLY=0",
  "-e",
  "IMAGOR_AUTO_WEBP=1",
  "-e",
  "IMAGOR_AUTO_AVIF=1",
  "-e",
  "IMAGOR_AUTO_JPEG=1",
  "-e",
  "VIPS_STRIP_METADATA=1",
  "ghcr.io/cshum/imagorvideo:latest",
];

const child = spawn(containerCli, dockerArgs, {
  stdio: "inherit",
});

let cleanedUp = false;

function cleanup() {
  if (cleanedUp) {
    return;
  }
  cleanedUp = true;
  removeContainer(containerCli, containerName);
}

function stopChildAndExit(exitCode: number) {
  if (!child.killed && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    setTimeout(() => {
      cleanup();
      process.exit(exitCode);
    }, 1_000).unref();
    return;
  }

  cleanup();
  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => stopChildAndExit(0));
}

process.on("exit", cleanup);

child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 1);
});
