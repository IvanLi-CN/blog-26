#!/usr/bin/env bun

/**
 * Initialize the private content repository from the content library.
 *
 * Run after the cutover import, with CONTENT_REPO_* configured:
 *   bun scripts/content-repo-seed.ts
 *
 * Pushes in batches of the repository limit; every batch becomes one commit.
 */

import { inArray } from "drizzle-orm";
import { CONTENT_REPO_MAX_BATCH_CONTENTS } from "@/lib/content-repo/config";
import { db, initializeDB } from "@/lib/db";
import { posts } from "@/lib/schema";
import { pushContentRepo } from "@/server/services/content-repo-sync";

await initializeDB(true);
const rows = db
  .select({ id: posts.id })
  .from(posts)
  .where(inArray(posts.type, ["post", "memo"]))
  .all();
if (!rows.length) {
  console.log("No content to seed.");
  process.exit(0);
}

const limit = CONTENT_REPO_MAX_BATCH_CONTENTS;
let pushed = 0;
for (let index = 0; index < rows.length; index += limit) {
  const ids = rows.slice(index, index + limit).map((row) => row.id);
  const outcome = await pushContentRepo({ ids });
  console.log(
    `${index + ids.length}/${rows.length}: ${outcome.status}${
      outcome.commit ? ` ${outcome.commit}` : ""
    }`
  );
  if (outcome.status === "failed" || outcome.status === "unconfigured") {
    console.error(outcome.message ?? "Content repository is not configured");
    process.exit(1);
  }
  pushed += ids.length;
}

console.log(`Seeded ${pushed} contents.`);
