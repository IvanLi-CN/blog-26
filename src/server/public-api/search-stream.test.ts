import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { computePlaybookContentHash } from "@/lib/playbook/manifest";
import { playbookSnapshots } from "@/lib/schema";
import { handlePublicApiRequest } from "@/server/public-api/router";
import { PlaybookSnapshotStore } from "@/server/services/playbook-snapshot-store";
import { makePublicBundle } from "../../../tests/lib/playbook-fixture";

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

  test("emits the keyword phase before the final AI result", async () => {
    const response = await handlePublicApiRequest(
      new Request("http://localhost/api/public/search/stream?q=NEAR(fixture)&mode=rag"),
      "/search/stream"
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    const keywordOffset = body.indexOf("event: keyword");
    const resultOffset = body.indexOf("event: result");
    expect(keywordOffset).toBeGreaterThanOrEqual(0);
    expect(resultOffset).toBeGreaterThan(keywordOffset);
    expect(body).toContain('"phase":"keyword"');
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

  test("does not expose Playbook availability details in SSE", async () => {
    const response = await handlePublicApiRequest(
      new Request("http://localhost/api/public/search/stream?q=fixture&mode=rag&source=playbook"),
      "/search/stream"
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("event: started");
    expect(body).toContain('"code":"SERVICE_UNAVAILABLE"');
    expect(body).toContain('"error":"search-unavailable"');
    expect(body).not.toContain("playbook-edition");
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

  test("serves only the adopted current snapshot without operational metadata", async () => {
    await db.delete(playbookSnapshots);
    const bundle = makePublicBundle("v3.0.0", "100");
    const current = {
      catalog: bundle.edition.catalog,
      search: bundle.edition.search,
      sourceRevision: {
        provider: "github" as const,
        repository: bundle.edition.edition.source.repository,
        ref: bundle.edition.edition.source.tag,
        commit: bundle.edition.edition.source.commit,
      },
      contentHash: computePlaybookContentHash({
        catalog: bundle.edition.catalog,
        search: bundle.edition.search,
      }),
    };
    new PlaybookSnapshotStore().adopt(current, { expectedCurrent: null });

    const search = await handlePublicApiRequest(
      new Request(
        `http://localhost/api/public/search?q=verify&mode=keyword&source=playbook&edition=${"f".repeat(64)}&sourceReleaseId=999&sourceTag=old`
      ),
      "/search"
    );
    expect(search.status).toBe(200);
    expect(search.headers.get("Search-Playbook-Edition")).toBeNull();
    expect(search.headers.get("Search-Playbook-Source-Release-Id")).toBeNull();
    expect(search.headers.get("Search-RAG-Incomplete-Sources")).toBeNull();
    const results = await search.json();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).not.toHaveProperty("edition");
    expect(JSON.stringify(results)).not.toContain(current.contentHash);

    const index = await handlePublicApiRequest(
      new Request(
        `http://localhost/api/public/playbook/search-index?edition=${"0".repeat(64)}&sourceReleaseId=1&sourceTag=previous`
      ),
      "/playbook/search-index"
    );
    expect(index.status).toBe(200);
    expect(index.headers.get("x-playbook-edition")).toBeNull();
    expect(index.headers.get("x-playbook-source-commit")).toBeNull();
    const indexBody = (await index.json()) as { documents: unknown[]; generated_at?: string };
    expect(indexBody).toEqual({ documents: bundle.edition.search.documents });
    expect(indexBody).not.toHaveProperty("generated_at");
    await db.delete(playbookSnapshots);
  });
});
