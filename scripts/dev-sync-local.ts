#!/usr/bin/env bun

/**
 * Dev helper to sync local markdown content from `./dev-data/local` into the DB.
 * This mirrors what the admin content-sync would do, but without requiring admin headers.
 */

import { resolve } from "node:path";
import { getContentSourceManager, LocalContentSource } from "../src/lib/content-sources";
import { initializeDB } from "../src/lib/db";

async function main() {
  const basePath = process.env.LOCAL_CONTENT_BASE_PATH || "./dev-data/local";
  console.log(`🔧 Using DB at: ${process.env.DB_PATH || "./sqlite.db"}`);
  console.log(`📁 Syncing local content from: ${basePath}`);

  await initializeDB();
  const manager = getContentSourceManager({ maxConcurrentSyncs: 2 });

  // Register local source lazily
  const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
    contentPath: resolve(basePath),
  });
  const local = new LocalContentSource(localConfig);
  await manager.registerSource(local);

  const res = await manager.syncAll(true);
  console.log("✅ Sync finished:", res.stats);
}

main().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
