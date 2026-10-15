import { Database } from "bun:sqlite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const path = process.env.DB_PATH;
if (!path) throw new Error("Isolated DB required");
const phase = process.argv[2];
const root = dirname(path);
globalThis.fetch = Object.assign(
  async () => {
    throw new Error("Network prohibited");
  },
  { preconnect: globalThis.fetch.preconnect }
);
if (phase === "hold") {
  const sqlite = new Database(path);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
}
const database = await import("../../src/lib/db");
await database.initializeDB(true);
const { db } = database;
const { contentTasks } = await import("../../src/lib/schema");
const { beginContentTask, finishContentTask, getContentTask, updateContentTask } = await import(
  "../../src/server/services/content-tasks"
);
const input = {
  kind: "sync" as const,
  source: "local" as const,
  requestKey: "incremental",
  origin: "mock",
  target: "local-content",
};
if (phase === "hold") {
  const { task } = await beginContentTask(input);
  writeFileSync(join(root, "owner.json"), JSON.stringify(task));
  while (!existsSync(join(root, "release"))) await Bun.sleep(20);
  await updateContentTask(task.id, { processed: 99 }, task.ownerToken ?? undefined);
  finishContentTask(task.id, "failed", "Late worker", task.ownerToken ?? undefined);
  console.log(JSON.stringify({ mock: true, phase, task: await getContentTask(task.id) }));
} else {
  const prior = JSON.parse(readFileSync(join(root, "owner.json"), "utf8"));
  if (phase === "reuse") {
    const result = await beginContentTask(input);
    if (!result.reused || result.task.id !== prior.id)
      throw new Error("Equivalent request was not reused");
    console.log(JSON.stringify({ mock: true, phase, reused: true, taskId: result.task.id }));
  } else if (phase === "takeover") {
    db.update(contentTasks).set({ leaseUntil: 0 }).where(eq(contentTasks.id, prior.id)).run();
    const result = await beginContentTask({ ...input, resumeId: prior.id });
    if (result.reused || result.task.ownerToken === prior.ownerToken)
      throw new Error("Takeover did not fence old execution");
    await updateContentTask(prior.id, { processed: 2 }, result.task.ownerToken ?? undefined);
    finishContentTask(prior.id, "success", undefined, result.task.ownerToken ?? undefined);
    console.log(JSON.stringify({ mock: true, phase, task: await getContentTask(prior.id) }));
  } else throw new Error("Unknown phase");
}
