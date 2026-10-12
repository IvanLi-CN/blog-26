import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "../../src/lib/db";
import { posts, searchIndexState } from "../../src/lib/schema";
import { contentSearchIndex } from "../../src/server/services/content-search-index";

const phase = process.argv[2];
const file = process.argv[3];
if (!file) throw new Error("An isolated test database is required");
process.env.DB_PATH = file;
process.env.SEARCH_INDEX_PATH = `${file}.search`;
if (phase === "init") {
  const sqlite = new Database(file);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
}
await initializeDB(true);
const index = await contentSearchIndex();
const document = {
  id: "recovery",
  slug: "recovery",
  title: "Recovery",
  body: "SQLite",
  type: "post",
  public: true,
  draft: false,
  publishDate: 1,
  updateDate: 1,
  contentHash: "v1",
  dataSource: "local",
};
if (phase === "init") await index.prepare();
else if (phase === "rollback") {
  db.transaction((tx) => {
    tx.insert(posts).values(document).run();
    process.kill(process.pid, "SIGKILL");
  });
} else if (phase === "checkpoint") {
  await db.insert(posts).values(document);
  const update = db.update.bind(db);
  Object.defineProperty(db, "update", {
    value: (table: unknown) => {
      if (table === searchIndexState) process.kill(process.pid, "SIGKILL");
      return update(table as typeof searchIndexState);
    },
  });
  await index.synchronize();
} else if (phase === "check-empty") {
  if ((await index.search("SQLite", { limit: 20 })).length)
    throw new Error("Uncommitted document escaped rollback");
  console.log(JSON.stringify(await index.check()));
} else if (phase === "recover") {
  const found = await index.search("SQLite", { limit: 20 });
  if (found.length !== 1 || found[0].row.id !== "recovery")
    throw new Error("Durable update lost on replay");
  await db.update(posts).set({ body: "PostgreSQL" }).where(eq(posts.id, "recovery"));
  if ((await index.search("SQLite", { limit: 20 })).length)
    throw new Error("Replacement did not remove old terms");
  await db.delete(posts).where(eq(posts.id, "recovery"));
  console.log(JSON.stringify(await index.check()));
} else throw new Error("Unknown recovery phase");
process.exit(0);
