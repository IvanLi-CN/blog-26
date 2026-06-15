#!/usr/bin/env bun

import { readFile } from "node:fs/promises";

type Service = "web" | "site" | "admin";

const DEFAULT_WEB_PORT = 25090;
const OFFSETS: Record<Service, number> = {
  web: 0,
  site: 3,
  admin: 4,
};

function parseServiceArg(): Service {
  const value = (process.argv[2] || "web").trim().toLowerCase();
  if (value === "web" || value === "site" || value === "admin") {
    return value;
  }
  throw new Error(`Unsupported service "${value}". Use one of: web, site, admin.`);
}

function parseOptionalPort(envName: string): number | null {
  const raw = process.env[envName]?.trim();
  if (!raw) {
    return null;
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Environment variable ${envName} must be a valid TCP port, got: ${raw}`);
  }

  return port;
}

async function loadDotEnvLocalIfPresent() {
  const content = await readFile(".env.local", "utf8").catch(() => "");
  if (!content) {
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (!key || process.env[key] !== undefined || value.length === 0) {
      continue;
    }

    process.env[key] = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
}

async function main() {
  const service = parseServiceArg();
  await loadDotEnvLocalIfPresent();

  const webPort = parseOptionalPort("PORT") ?? DEFAULT_WEB_PORT;
  if (service === "web") {
    console.log(webPort);
    return;
  }

  const explicitKey = service === "site" ? "SITE_PORT" : "ADMIN_PORT";
  const resolvedPort = parseOptionalPort(explicitKey) ?? webPort + OFFSETS[service];
  console.log(resolvedPort);
}

main().catch((error) => {
  console.error("[resolve-worktree-port]", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
