import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { writePublicSnapshot } from "@/public-site/snapshot";

const outputPath = resolve(
  process.cwd(),
  process.env.PUBLIC_SNAPSHOT_PATH || "site/generated/public-snapshot.json"
);

await mkdir(dirname(outputPath), { recursive: true });

const contentBundleUrl = process.env.PUBLIC_CONTENT_BUNDLE_URL?.trim();

if (contentBundleUrl && existsSync(outputPath)) {
  console.log(`Reusing public snapshot from downloaded content bundle: ${outputPath}`);
  process.exit(0);
}

if (contentBundleUrl === "preloaded") {
  throw new Error(
    `PUBLIC_CONTENT_BUNDLE_URL=preloaded requires an existing public snapshot at ${outputPath}`
  );
}

const snapshot = await writePublicSnapshot(outputPath);

console.log(`Exported public snapshot to ${outputPath}`);
console.log(`Posts: ${snapshot.posts.length}`);
console.log(`Memos: ${snapshot.memos.length}`);
console.log(`Tag timelines: ${Object.keys(snapshot.tags.timelines).length}`);
