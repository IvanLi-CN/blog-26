#!/usr/bin/env bun

import {
  loadWorktreeEnvFileIfPresent,
  resolveWorktreePort,
  type WorktreePortService,
} from "@/lib/worktree-env";

function parseServiceArg(): WorktreePortService {
  const value = (process.argv[2] || "web").trim().toLowerCase();
  if (value === "web" || value === "site" || value === "admin") {
    return value;
  }
  throw new Error(`Unsupported service "${value}". Use one of: web, site, admin.`);
}

function main() {
  const service = parseServiceArg();
  loadWorktreeEnvFileIfPresent();
  console.log(resolveWorktreePort(service));
}

try {
  main();
} catch (error) {
  console.error("[resolve-worktree-port]", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
