import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { initializeDB } from "@/lib/db";
import { handlePublicApiRequest } from "@/server/public-api/router";

let directory: string;
const oldDbPath = process.env.DB_PATH;
const oldContentPath = process.env.LOCAL_CONTENT_BASE_PATH;

describe("public search SSE transport", () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(os.tmpdir(), "blog-search-stream-"));
    process.env.DB_PATH = path.join(directory, "content.sqlite");
    process.env.LOCAL_CONTENT_BASE_PATH = path.join(directory, "local");
    const sqlite = new Database(process.env.DB_PATH);
    migrate(drizzle(sqlite), { migrationsFolder: path.resolve("drizzle") });
    sqlite.close();
    await initializeDB(true);
  });

  afterAll(() => {
    if (oldDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = oldDbPath;
    if (oldContentPath === undefined) delete process.env.LOCAL_CONTENT_BASE_PATH;
    else process.env.LOCAL_CONTENT_BASE_PATH = oldContentPath;
    rmSync(directory, { recursive: true, force: true });
  });

  test("flushes started and result events for an empty AI query", async () => {
    const response = await handlePublicApiRequest(
      new Request("http://localhost/api/public/search/stream?q=&mode=rag"),
      "/search/stream"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain("event: started");
    expect(body).toContain("event: result");
    expect(body).toContain('"effectiveMode":"keyword"');
  });

  test("rejects keyword mode instead of opening an unnecessary stream", async () => {
    const response = await handlePublicApiRequest(
      new Request("http://localhost/api/public/search/stream?q=fixture&mode=keyword"),
      "/search/stream"
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });
});
