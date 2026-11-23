#!/usr/bin/env bun

/**
 * One-time content authority cutover.
 *
 * Run with the service stopped:
 *   bun scripts/content-cutover.ts            # dry run
 *   bun scripts/content-cutover.ts --apply    # normalize the library and mark the cutover
 *
 * The importer never deletes or rewrites files under the content root; it copies
 * referenced attachments into the canonical `<kind>/assets/` location and records
 * their identity, then writes canonical bodies into the library.
 */

import { initializeDB } from "@/lib/db";
import { runContentCutover } from "@/server/services/content-cutover";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const removeOrphans = args.has("--remove-orphans");
const unknown = [...args].filter((arg) => !["--apply", "--remove-orphans", "--help"].includes(arg));
if (args.has("--help") || unknown.length) {
  console.log(
    [
      "Usage: bun scripts/content-cutover.ts [--apply] [--remove-orphans]",
      "",
      "  (no flags)        dry run: report drift, collisions, orphan rows and planned moves",
      "  --apply           write canonical bodies, copy attachments and mark the cutover",
      "  --remove-orphans  delete library rows whose files no longer exist (apply only)",
    ].join("\n")
  );
  process.exit(unknown.length ? 2 : 0);
}

await initializeDB(true);
const report = await runContentCutover({
  apply,
  removeOrphans,
  onProgress: (message) => console.log(message),
});
console.log(JSON.stringify(report, null, 2));
process.exit(report.errors.length || report.status === "blocked" ? 1 : 0);
