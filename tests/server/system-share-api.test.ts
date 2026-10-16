import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { posts, systemShareSubmissions, users } from "@/lib/schema";
import { SYSTEM_SHARE_MAX_REQUEST_BYTES } from "@/lib/system-share";

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
    const firstPayload = (await first.json()) as { memo?: { id?: string; slug?: string } };
    expect(firstPayload.memo?.id).toBeTruthy();
    expect(firstPayload.memo?.slug).toBeTruthy();
    expect(firstPayload).toMatchObject({ ok: true, duplicate: false, classification: "memo" });

    const replay = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "a thought")),
      "/system-share"
    );
    expect(replay.status).toBe(200);
    const replayPayload = await replay.json();
    expect(replayPayload).toMatchObject({
      ok: true,
      duplicate: true,
      memoId: firstPayload.memo?.id,
    });
    expect((replayPayload as { memo: { slug: string } }).memo.slug).toBe(firstPayload.memo?.slug);
    if (!db) throw new Error("Database has not been initialised");
    expect(await db.select().from(posts)).toHaveLength(1);
    expect((await db.select().from(systemShareSubmissions))[0]?.state).toBe("completed");
  });

  test("allows only one concurrent creator for the same temporary submission id", async () => {
    const submissionId = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        handlePublicApiRequest(
          buildRequest(createForm(submissionId, "concurrent thought")),
          "/system-share"
        )
      )
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toContain(201);
    expect(statuses.every((status) => status === 200 || status === 201 || status === 409)).toBe(
      true
    );
    if (!db) throw new Error("Database has not been initialised");
    const memos = await db.select().from(posts);
    expect(memos).toHaveLength(1);
    const successfulPayloads = await Promise.all(
      responses
        .filter((response) => response.status === 200 || response.status === 201)
        .map((response) => response.json())
    );
    expect(new Set(successfulPayloads.map((payload) => payload.memoId)).size).toBe(1);
  });

  test("reclaims a processing submission when its lease has expired", async () => {
    const submissionId = randomUUID();
    const now = Date.now();
    const oldLeaseToken = randomUUID();
    const orphanDirectory = path.join(
      contentRoot,
      "Memos",
      "assets",
      "system-share",
      submissionId,
      oldLeaseToken
    );
    fs.mkdirSync(orphanDirectory, { recursive: true });
    fs.writeFileSync(path.join(orphanDirectory, "1-old.txt"), "orphan");
    await db?.insert(systemShareSubmissions).values({
      submissionId,
      memoId: null,
      memoSlug: null,
      classification: "memo",
      state: "processing",
      leaseToken: oldLeaseToken,
      leaseExpiresAt: now - 1,
      createdAt: now,
      updatedAt: now,
    });

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "reclaimed thought")),
      "/system-share"
    );
    expect(response.status).toBe(201);
    expect(await db?.select().from(posts)).toHaveLength(1);
    expect(fs.existsSync(orphanDirectory)).toBe(false);
  });

  test("recovers an authored Memo after the filesystem commit before completion recording", async () => {
    const submissionId = randomUUID();
    const oldLeaseToken = randomUUID();
    const memoId = `Memos/system-share/${submissionId}.md`;
    const memoPath = path.join(contentRoot, memoId);
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(
      memoPath,
      `---\ntitle: Recovered commit\npublic: false\ntags: []\nattachments: []\nsystemShare: {"source":"system-share","submissionId":"${submissionId}"}\n---\n\nrecovered commit\n`
    );
    const now = Date.now();
    await db?.insert(systemShareSubmissions).values({
      submissionId,
      memoId: null,
      memoSlug: null,
      classification: "memo",
      state: "processing",
      leaseToken: oldLeaseToken,
      leaseExpiresAt: now - 1,
      createdAt: now,
      updatedAt: now,
    });

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "new request after restart")),
      "/system-share"
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, memoId });
    expect(fs.existsSync(memoPath)).toBe(true);
    const row = await db
      ?.select()
      .from(systemShareSubmissions)
      .where(eq(systemShareSubmissions.submissionId, submissionId))
      .then((rows) => rows[0]);
    expect(row).toMatchObject({ state: "completed", memoId });
  });

  test("keeps distinct temporary submission ids independent", async () => {
    const first = await handlePublicApiRequest(
      buildRequest(createForm(randomUUID(), "same content")),
      "/system-share"
    );
    const second = await handlePublicApiRequest(
      buildRequest(createForm(randomUUID(), "same content")),
      "/system-share"
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await db?.select().from(posts)).toHaveLength(2);
  });

  test("reconstructs the detail slug for a legacy completed submission row", async () => {
    const submissionId = randomUUID();
    const first = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "legacy replay")),
      "/system-share"
    );
    const firstPayload = (await first.json()) as { memo?: { id?: string; slug?: string } };
    await db
      ?.update(systemShareSubmissions)
      .set({ memoSlug: null })
      .where(eq(systemShareSubmissions.submissionId, submissionId));

    const replay = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "legacy replay")),
      "/system-share"
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      duplicate: true,
      memoId: firstPayload.memo?.id,
      memo: { slug: firstPayload.memo?.slug },
    });
  });

  test("does not recreate a completed submission after its Memo was deleted", async () => {
    const submissionId = randomUUID();
    const first = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "deleted memo")),
      "/system-share"
    );
    const firstPayload = (await first.json()) as { memoId?: string };
    const firstRow = await db
      ?.select()
      .from(posts)
      .where(eq(posts.id, firstPayload.memoId ?? ""))
      .limit(1)
      .then((rows) => rows[0]);
    if (firstRow?.filePath) {
      fs.rmSync(path.join(contentRoot, firstRow.filePath), { force: true });
    }
    await db?.delete(posts).where(eq(posts.id, firstPayload.memoId ?? ""));

    const replay = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "deleted memo")),
      "/system-share"
    );
    expect(replay.status).toBe(404);
    expect(await db?.select().from(posts)).toHaveLength(0);
  });

  test("does not replay a completed submission when its indexed file is missing", async () => {
    const submissionId = randomUUID();
    const first = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "indexed file deleted")),
      "/system-share"
    );
    const firstPayload = (await first.json()) as { memoId?: string };
    const firstRow = await db
      ?.select()
      .from(posts)
      .where(eq(posts.id, firstPayload.memoId ?? ""))
      .limit(1)
      .then((rows) => rows[0]);
    if (!firstRow?.filePath) throw new Error("expected an indexed Memo file");
    fs.rmSync(path.join(contentRoot, firstRow.filePath), { force: true });

    const replay = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "indexed file deleted")),
      "/system-share"
    );
    expect(replay.status).toBe(404);
  });

  test("replays a completed submission while indexing has not produced its row", async () => {
    const submissionId = randomUUID();
    const memoId = `Memos/system-share/${submissionId}.md`;
    const memoSlug = submissionId;
    fs.mkdirSync(path.dirname(path.join(contentRoot, memoId)), { recursive: true });
    fs.writeFileSync(
      path.join(contentRoot, memoId),
      "---\ntitle: Recovered authored memo\npublic: false\n---\n\nrecoverable authored memo\n"
    );
    const now = Date.now();
    await db?.insert(systemShareSubmissions).values({
      submissionId,
      memoId,
      memoSlug,
      classification: "memo",
      state: "completed",
      leaseToken: null,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const replay = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "recoverable authored memo")),
      "/system-share"
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      ok: true,
      duplicate: true,
      memoId,
      memo: { slug: memoSlug },
    });
  });

  test("rejects an oversized multipart body before parsing files", async () => {
    const request = new Request("https://console.ivanli.cc/api/public/system-share", {
      method: "POST",
      headers: {
        "Remote-Email": adminEmail,
        "content-type": "multipart/form-data; boundary=share-test",
        "content-length": String(SYSTEM_SHARE_MAX_REQUEST_BYTES + 1),
      },
      body: "--share-test--",
    });
    const response = await handlePublicApiRequest(request, "/system-share");
    expect(response.status).toBe(400);
    expect(await db?.select().from(systemShareSubmissions)).toHaveLength(0);
  });

  test("rejects an oversized streamed multipart body before parsing files", async () => {
    let emitted = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted > SYSTEM_SHARE_MAX_REQUEST_BYTES) {
          controller.close();
          return;
        }
        const remaining = SYSTEM_SHARE_MAX_REQUEST_BYTES + 1 - emitted;
        const next = remaining < chunk.byteLength ? chunk.slice(0, remaining) : chunk;
        emitted += next.byteLength;
        controller.enqueue(next);
      },
    });
    const request = new Request("https://console.ivanli.cc/api/public/system-share", {
      method: "POST",
      headers: {
        "Remote-Email": adminEmail,
        "content-type": "multipart/form-data; boundary=share-test",
      },
      body: stream,
      duplex: "half",
    });
    const response = await handlePublicApiRequest(request, "/system-share");
    expect(response.status).toBe(400);
    expect(await db?.select().from(systemShareSubmissions)).toHaveLength(0);
  });

  test("returns a bad request for malformed multipart input", async () => {
    const response = await handlePublicApiRequest(
      new Request("https://console.ivanli.cc/api/public/system-share", {
        method: "POST",
        headers: {
          "Remote-Email": adminEmail,
          "content-type": "multipart/form-data; boundary=missing-boundary",
        },
        body: "--other-boundary--",
      }),
      "/system-share"
    );
    expect(response.status).toBe(400);
    expect(await db?.select().from(systemShareSubmissions)).toHaveLength(0);
  });

  test("classifies a URL share with a parser marker and no frontmatter tag", async () => {
    const form = createForm(randomUUID(), "https://example.com/article");
    const response = await handlePublicApiRequest(buildRequest(form), "/system-share");
    expect(response.status).toBe(201);
    const rows = await db?.select().from(posts);
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.tags).toBe("[]");
    expect(rows?.[0]?.body).toContain("https://example.com/article");
    expect(rows?.[0]?.body).toContain("#剪藏");
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
