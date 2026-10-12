import { initializeDB } from "../src/lib/db";
import { contentSearchIndex } from "../src/server/services/content-search-index";

await initializeDB();
const index = await contentSearchIndex();
const action = process.argv[2] ?? "status";
if (action === "status") console.log(JSON.stringify(await index.status(), null, 2));
else if (action === "prepare" || action === "rebuild")
  console.log(JSON.stringify(await index.prepare(action === "rebuild"), null, 2));
else if (action === "check") {
  const result = await index.check();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} else throw new Error("Expected search:index status, prepare, rebuild, or check");
