import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { writePublicSnapshot } from "@/public-site/snapshot";

const outputPath = resolve(
  process.cwd(),
  process.env.PUBLIC_SNAPSHOT_PATH || "site/generated/public-snapshot.json"
);

await mkdir(dirname(outputPath), { recursive: true });
const snapshot = await writePublicSnapshot(outputPath);
console.log(`Exported public snapshot to ${outputPath}`);
console.log(`Posts: ${snapshot.posts.length}`);
console.log(`Memos: ${snapshot.memos.length}`);
console.log(`Tag timelines: ${Object.keys(snapshot.tags.timelines).length}`);
