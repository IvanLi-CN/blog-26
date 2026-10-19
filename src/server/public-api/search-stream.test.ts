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
const oldPlaybookCache = process.env.PLAYBOOK_CACHE_DIR;
const oldPlaybookSeed = process.env.PLAYBOOK_SEED_PATH;

describe("public search SSE transport", () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(os.tmpdir(), "blog-search-stream-"));
    process.env.DB_PATH = path.join(directory, "content.sqlite");
    process.env.LOCAL_CONTENT_BASE_PATH = path.join(directory, "local");
    process.env.PLAYBOOK_CACHE_DIR = path.join(directory, "playbook-cache");
    process.env.PLAYBOOK_SEED_PATH = path.join(directory, "missing-playbook-seed.json");
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
    if (oldPlaybookCache === undefined) delete process.env.PLAYBOOK_CACHE_DIR;
    else process.env.PLAYBOOK_CACHE_DIR = oldPlaybookCache;
    if (oldPlaybookSeed === undefined) delete process.env.PLAYBOOK_SEED_PATH;
    else process.env.PLAYBOOK_SEED_PATH = oldPlaybookSeed;
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

  test("ignores malformed legacy Playbook selectors", async () => {
    const response = await handlePublicApiRequest(
      new Request(
        "http://localhost/api/public/search/stream?q=&mode=rag&edition=broken&sourceReleaseId=-1&sourceTag=old"
      ),
      "/search/stream"
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("event: started");
    expect(body).toContain("event: result");
  });

  test("preserves controlled Playbook availability errors in SSE", async () => {
    const response = await handlePublicApiRequest(
      new Request("http://localhost/api/public/search/stream?q=fixture&mode=rag&source=playbook"),
      "/search/stream"
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("event: started");
    expect(body).toContain('"code":"SERVICE_UNAVAILABLE"');
    expect(body).toContain('"error":"search-playbook-edition-unavailable"');
  });

  test("JSON search keeps legacy selector compatibility without validating it", async () => {
    const response = await handlePublicApiRequest(
      new Request(
        "http://localhost/api/public/search?q=&mode=keyword&edition=broken&sourceReleaseId=-1&sourceTag=old"
      ),
      "/search"
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
