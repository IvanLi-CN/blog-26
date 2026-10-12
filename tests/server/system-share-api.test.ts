import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { posts, systemShareSubmissions, users } from "@/lib/schema";

const testId = randomUUID();
const dbPath = path.join(process.cwd(), "tmp", `system-share-${testId}.sqlite`);
const contentRoot = path.join(process.cwd(), "tmp", `system-share-content-${testId}`);
const clippingRoot = path.join(process.cwd(), "tmp", `system-share-clippings-${testId}`);
const migrationsPath = path.join(process.cwd(), "drizzle");
const adminEmail = "system-share-admin@test.local";
let handlePublicApiRequest: typeof import("@/server/public-api/router").handlePublicApiRequest;

function buildRequest(form: FormData) {
  return new Request("https://console.ivanli.cc/api/public/system-share", {
    method: "POST",
    headers: { "Remote-Email": adminEmail },
    body: form,
  });
}

function buildUnauthenticatedRequest(form: FormData) {
  return new Request("https://console.ivanli.cc/api/public/system-share", {
    method: "POST",
    body: form,
  });
}

function createForm(submissionId: string, text: string) {
  const form = new FormData();
  form.set("submissionId", submissionId);
  form.set("text", text);
  form.set("tags", "[]");
  form.set("isPublic", "false");
  return form;
}

describe("system share API", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.ADMIN_EMAIL = adminEmail;
    process.env.DB_PATH = dbPath;
    process.env.LOCAL_CONTENT_BASE_PATH = contentRoot;
    process.env.CONTENT_SOURCES = "local";
    process.env.CLIPPING_CONTENT_BASE_PATH = clippingRoot;
    process.env.CLIPPING_PROCESSOR_ENABLED = "false";
    fs.mkdirSync(contentRoot, { recursive: true });
    const sqlite = new Database(dbPath);
    migrate(drizzle(sqlite), { migrationsFolder: migrationsPath });
    sqlite.close();
    ({ handlePublicApiRequest } = await import("@/server/public-api/router"));
    await initializeDB(true);
  });

  beforeEach(async () => {
    if (!db) throw new Error("Database has not been initialised");
    await db.delete(systemShareSubmissions);
    await db.delete(posts);
    await db.delete(users);
    fs.rmSync(contentRoot, { recursive: true, force: true });
    fs.mkdirSync(contentRoot, { recursive: true });
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  afterAll(() => {
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(contentRoot, { recursive: true, force: true });
    fs.rmSync(clippingRoot, { recursive: true, force: true });
  });

  test("creates a private memo and replays the same submission without duplication", async () => {
    const submissionId = randomUUID();
    const first = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "a thought")),
      "/system-share"
    );
    expect(first.status).toBe(201);
    const firstPayload = (await first.json()) as { memo?: { id?: string } };
    expect(firstPayload.memo?.id).toBeTruthy();

    const replay = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "a thought")),
      "/system-share"
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      ok: true,
      duplicate: true,
      memoId: firstPayload.memo?.id,
    });
    if (!db) throw new Error("Database has not been initialised");
    expect(await db.select().from(posts)).toHaveLength(1);
    expect((await db.select().from(systemShareSubmissions))[0]?.state).toBe("completed");
  });

  test("classifies a URL share as clipping without adding a visible tag", async () => {
    const form = createForm(randomUUID(), "https://example.com/article");
    const response = await handlePublicApiRequest(buildRequest(form), "/system-share");
    expect(response.status).toBe(201);
    const rows = await db?.select().from(posts);
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.tags).toBe("[]");
    expect(rows?.[0]?.metadata).toContain('"systemShare"');
  });

  test("rejects unauthenticated submissions without creating a server record", async () => {
    const response = await handlePublicApiRequest(
      buildUnauthenticatedRequest(createForm(randomUUID(), "private thought")),
      "/system-share"
    );
    expect(response.status).toBe(403);
    expect(await db?.select().from(systemShareSubmissions)).toHaveLength(0);
  });

  test("does not expose the write endpoint on the public runtime", async () => {
    const form = createForm(randomUUID(), "public runtime attempt");
    const response = await handlePublicApiRequest(
      new Request("https://ivanli.cc/api/public/system-share", {
        method: "POST",
        headers: { "Remote-Email": adminEmail },
        body: form,
      }),
      "/system-share"
    );
    expect(response.status).toBe(404);
    expect(await db?.select().from(systemShareSubmissions)).toHaveLength(0);
  });

  test("stages arbitrary files as attachments on the single created memo", async () => {
    const form = createForm(randomUUID(), "");
    form.append("files", new File(["hello"], "note.txt", { type: "text/plain" }));
    const response = await handlePublicApiRequest(buildRequest(form), "/system-share");
    expect(response.status).toBe(201);
    const rows = await db?.select().from(posts);
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.body).toBe("");
    expect(rows?.[0]?.metadata).toContain("note.txt");
    const staged = path.join(contentRoot, rows?.[0]?.filePath || "");
    expect(fs.existsSync(staged)).toBe(true);
    const markdown = fs.readFileSync(staged, "utf8");
    expect(markdown).toContain("assets/system-share/");
  });
});
