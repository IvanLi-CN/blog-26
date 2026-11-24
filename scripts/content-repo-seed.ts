#!/usr/bin/env bun

/**
 * Initialize the private content repository from the content library.
 *
 * Run after the cutover import, with CONTENT_REPO_* configured:
 *   bun scripts/content-repo-seed.ts
 *
 * Contents whose referenced attachments are missing from media storage are
 * reported and skipped; they stay `to-push` until the attachment is restored.
 */

import { inArray } from "drizzle-orm";
import { CONTENT_REPO_MAX_BATCH_CONTENTS } from "@/lib/content-repo/config";
import { db, initializeDB } from "@/lib/db";
import { posts } from "@/lib/schema";
import { loadContentRepoEntries, pushContentRepo } from "@/server/services/content-repo-sync";

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
let failed = false;
const skipped: { id: string; attachments: string[] }[] = [];

for (let index = 0; index < rows.length; index += limit) {
  const ids = rows.slice(index, index + limit).map((row) => row.id);
  const { entries, missingMedia } = await loadContentRepoEntries(ids, {
    tolerateMissingMedia: true,
  });
  const pathById = new Map(entries.map((entry) => [entry.contentId, entry.document.path]));
  const eligible: string[] = [];
  for (const id of ids) {
    const path = pathById.get(id);
    const missing = path ? missingMedia.get(path) : undefined;
    if (missing?.length) skipped.push({ id, attachments: missing });
    else eligible.push(id);
  }
  if (!eligible.length) continue;
  const outcome = await pushContentRepo({ ids: eligible });
  console.log(`pushed ${outcome.status} ${outcome.commit ?? "-"} (${eligible.length} contents)`);
  if (
    outcome.status === "failed" ||
    outcome.status === "unconfigured" ||
    outcome.status === "busy"
  ) {
    console.error(outcome.message ?? "Content repository is not configured");
    failed = true;
    break;
  }
  pushed += eligible.length;
}

if (skipped.length) {
  console.log(`Skipped ${skipped.length} contents with missing attachments:`);
  for (const item of skipped) console.log(`- ${item.id}: ${item.attachments.join(", ")}`);
}
console.log(`Seeded ${pushed} contents.`);
process.exit(failed ? 1 : 0);
