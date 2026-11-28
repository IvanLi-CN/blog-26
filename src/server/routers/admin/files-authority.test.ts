import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { initializeDB } from "@/lib/db";
import type { TRPCContext } from "@/server/context";
import { filesRouter } from "./files";

const prior = {
  DB_PATH: process.env.DB_PATH,
  CONTENT_AUTHORITY: process.env.CONTENT_AUTHORITY,
  LOCAL_CONTENT_BASE_PATH: process.env.LOCAL_CONTENT_BASE_PATH,
};

let root: string;

function caller() {
  const context: TRPCContext = {
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    isAdmin: true,
    user: { id: "admin-files", nickname: "Admin", email: "admin@example.com" },
  };
  return filesRouter.createCaller(context);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "admin-files-authority-"));
  process.env.DB_PATH = join(root, "app.sqlite");
  process.env.LOCAL_CONTENT_BASE_PATH = root;
  process.env.CONTENT_AUTHORITY = "database";
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: join(process.cwd(), "drizzle") });
  sqlite.close();
  await initializeDB(true);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("the content file tree reports itself disabled under database authority", async () => {
  const sources = await caller().getSources();
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({ name: "local", enabled: false });
});

test("file endpoints reject under database authority instead of writing unprojected Markdown", async () => {
  // The manager returns an empty result under authority, so a mutation that ran
  // past this guard would report success and leave the library stale forever.
  await expect(
    caller().writeFile({ source: "local", path: "Memos/authority-probe.md", content: "probe" })
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  await expect(caller().listDirectory({ source: "local", path: "" })).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
});
