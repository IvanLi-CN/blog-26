#!/usr/bin/env bun

import path from "node:path";
import {
  type MigrationMode,
  migrateAssistantDiscussions,
} from "../src/lib/assistant-discussion-migration";

const args = new Set(process.argv.slice(2));
const mode: MigrationMode = args.has("--apply") ? "apply" : "dry-run";
if (args.has("--apply") && args.has("--dry-run")) {
  throw new Error("Choose one of --dry-run or --apply");
}
if (args.has("--cleanup") && mode !== "apply") {
  throw new Error("--cleanup requires --apply");
}

const targetDbPath = path.resolve(process.env.DB_PATH || "./sqlite.db");
const piDbPath = path.resolve(
  process.env.PI_DURABLE_DB_PATH || path.join(path.dirname(targetDbPath), "pi-durable.sqlite")
);
const backupDir = path.resolve(
  process.env.ASSISTANT_MIGRATION_BACKUP_DIR ||
    path.join(path.dirname(targetDbPath), "assistant-migration-backups")
);

try {
  const report = await migrateAssistantDiscussions({
    targetDbPath,
    piDbPath,
    mode,
    backupDir,
    cleanup: args.has("--cleanup"),
    failAfter: process.env.ASSISTANT_MIGRATION_FAIL_AFTER
      ? Number(process.env.ASSISTANT_MIGRATION_FAIL_AFTER)
      : undefined,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "blocked") process.exitCode = 1;
} catch (error) {
  console.error(
    "Assistant discussion migration failed:",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
}
