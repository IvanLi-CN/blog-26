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

function runCommentBackfill(databasePath: string) {
  const result = Bun.spawnSync(
    [process.execPath, path.resolve("scripts/backfill-reader-comments.ts")],
    {
      env: { ...process.env, DB_PATH: databasePath },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  return {
    exitCode: result.exitCode,
    output: new TextDecoder().decode(result.stdout),
    error: new TextDecoder().decode(result.stderr),
  };
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

  test("cleans abandoned staging from a process that exited before retry", async () => {
    const submissionId = randomUUID();
    const leaseToken = randomUUID();
    const orphanDirectory = path.join(
      contentRoot,
      "Memos",
      "assets",
      "system-share",
      submissionId,
      leaseToken
    );
    fs.mkdirSync(orphanDirectory, { recursive: true });
    fs.writeFileSync(path.join(orphanDirectory, "1-orphan.txt"), "orphan");
    const expiredAt = new Date(Date.now() - 16 * 60 * 1000);
    fs.utimesSync(orphanDirectory, expiredAt, expiredAt);

    const response = await handlePublicApiRequest(
      buildRequest(createForm(randomUUID(), "trigger stale staging cleanup")),
      "/system-share"
    );
    expect(response.status).toBe(201);
    expect(fs.existsSync(orphanDirectory)).toBe(false);
  });

  test("reclaims an expired committing lease and removes its orphaned staging tree", async () => {
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
      state: "committing",
      leaseToken: oldLeaseToken,
      leaseExpiresAt: now - 1,
      createdAt: now,
      updatedAt: now,
    });

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "reclaimed committing thought")),
      "/system-share"
    );
    expect(response.status).toBe(201);
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
    const abandonedMemoTemp = `${memoPath}.${oldLeaseToken}.crashed.tmp`;
    fs.writeFileSync(abandonedMemoTemp, "partial recovered commit");
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
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, duplicate: true, memoId });
    expect(fs.existsSync(memoPath)).toBe(true);
    expect(fs.readFileSync(memoPath, "utf8")).toContain("recovered commit");
    expect(fs.existsSync(abandonedMemoTemp)).toBe(false);
    const row = await db
      ?.select()
      .from(systemShareSubmissions)
      .where(eq(systemShareSubmissions.submissionId, submissionId))
      .then((rows) => rows[0]);
    expect(row).toMatchObject({ state: "completed", memoId });
  });

  test("preserves committed attachments when completion recording fails", async () => {
    const submissionId = randomUUID();
    const form = createForm(submissionId, "attachment commit recovery");
    form.append("files", new File(["attachment body"], "recovered.txt", { type: "text/plain" }));
    const previousInjection = process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_MEMO_LINK;
    process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_MEMO_LINK = "1";
    try {
      const response = await handlePublicApiRequest(buildRequest(form), "/system-share");
      expect(response.status).toBe(500);
    } finally {
      if (previousInjection === undefined)
        delete process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_MEMO_LINK;
      else process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_MEMO_LINK = previousInjection;
    }

    const memoPath = path.join(contentRoot, "Memos", "system-share", `${submissionId}.md`);
    expect(fs.existsSync(memoPath)).toBe(true);
    const row = await db
      ?.select()
      .from(systemShareSubmissions)
      .where(eq(systemShareSubmissions.submissionId, submissionId))
      .then((rows) => rows[0]);
    expect(row).toMatchObject({ submissionId, memoId: null, state: "committing" });
    if (!row?.leaseToken) throw new Error("expected an active recovery lease");
    await db
      ?.update(systemShareSubmissions)
      .set({ leaseExpiresAt: Date.now() - 1, updatedAt: Date.now() - 1 })
      .where(eq(systemShareSubmissions.submissionId, submissionId));
    const stagingDirectory = path.join(
      contentRoot,
      "Memos",
      "assets",
      "system-share",
      submissionId,
      row.leaseToken
    );
    const expiredAt = new Date(Date.now() - 16 * 60 * 1000);
    fs.utimesSync(stagingDirectory, expiredAt, expiredAt);
    const attachmentPath = path.join(stagingDirectory, "1-recovered.txt");
    expect(fs.existsSync(attachmentPath)).toBe(true);

    const retry = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "retry after completion recording failure")),
      "/system-share"
    );
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ ok: true, duplicate: true });
    expect(fs.existsSync(attachmentPath)).toBe(true);
  });

  test("recovers an authored Memo before an unexpired lease blocks replay", async () => {
    const submissionId = randomUUID();
    const oldLeaseToken = randomUUID();
    const memoId = `Memos/system-share/${submissionId}.md`;
    const memoPath = path.join(contentRoot, memoId);
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(
      memoPath,
      `---\ntitle: Recovered live lease\npublic: false\ntags: []\nattachments: []\nsystemShare: {"source":"system-share","submissionId":"${submissionId}"}\n---\n\nrecovered while lease was live\n`
    );
    const now = Date.now();
    await db?.insert(systemShareSubmissions).values({
      submissionId,
      memoId: null,
      memoSlug: null,
      classification: "memo",
      state: "committing",
      leaseToken: oldLeaseToken,
      leaseExpiresAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    });

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "replay after process restart")),
      "/system-share"
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, duplicate: true, memoId });
    expect(await db?.select().from(systemShareSubmissions)).toMatchObject([
      { submissionId, state: "completed", memoId, leaseToken: null, leaseExpiresAt: null },
    ]);
  });

  test("rebuilds the Memo projection before completing an authored-file recovery", async () => {
    const submissionId = randomUUID();
    const memoId = `Memos/system-share/${submissionId}.md`;
    const memoPath = path.join(contentRoot, memoId);
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(
      memoPath,
      `---\ntitle: Rebuild projection\npublic: false\ntags: []\nattachments: []\nsystemShare: {"source":"system-share","submissionId":"${submissionId}"}\n---\n\nrecover and index this Memo\n`
    );
    await db?.insert(systemShareSubmissions).values({
      submissionId,
      memoId: null,
      memoSlug: null,
      classification: "memo",
      state: "committing",
      leaseToken: randomUUID(),
      leaseExpiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "replay and index")),
      "/system-share"
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, duplicate: true, memoId });
    expect(await db?.select({ id: posts.id }).from(posts).where(eq(posts.id, memoId))).toHaveLength(
      1
    );
  });

  test("repairs an interrupted deterministic Memo file before retrying the same submission", async () => {
    const submissionId = randomUUID();
    const memoId = `Memos/system-share/${submissionId}.md`;
    const memoPath = path.join(contentRoot, memoId);
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(
      memoPath,
      `---\ntitle: [\nsystemShare: {"source":"system-share","submissionId":"${submissionId}"}\n---\npartial write`
    );

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "repaired thought")),
      "/system-share"
    );
    expect(response.status).toBe(201);
    expect(fs.readFileSync(memoPath, "utf8")).toContain("repaired thought");
    expect(await db?.select().from(posts)).toHaveLength(1);
    expect(await db?.select().from(systemShareSubmissions)).toMatchObject([
      { submissionId, state: "completed", memoId },
    ]);
  });

  test("preserves malformed deterministic content when its marker is outside frontmatter", async () => {
    const submissionId = randomUUID();
    const memoPath = path.join(contentRoot, "Memos", "system-share", `${submissionId}.md`);
    const original = `---\ntitle: [\n---\nsystemShare: {"source":"system-share","submissionId":"${submissionId}"}\nprotected malformed content`;
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(memoPath, original);

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "must not replace malformed content")),
      "/system-share"
    );
    expect(response.status).toBe(500);
    expect(fs.readFileSync(memoPath, "utf8")).toBe(original);
    expect(await db?.select().from(posts)).toHaveLength(0);
  });

  test("preserves malformed deterministic content with conflicting duplicate markers", async () => {
    const submissionId = randomUUID();
    const memoPath = path.join(contentRoot, "Memos", "system-share", `${submissionId}.md`);
    const original = `---\nsystemShare: {"source":"system-share","submissionId":"${submissionId}"}\nsystemShare: {"source":"manual","submissionId":"${submissionId}"}\n---\nprotected ambiguous content`;
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(memoPath, original);

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "must not replace ambiguous content")),
      "/system-share"
    );
    expect(response.status).toBe(500);
    expect(fs.readFileSync(memoPath, "utf8")).toBe(original);
    expect(await db?.select().from(posts)).toHaveLength(0);
  });

  test("preserves malformed deterministic content with duplicate marker properties", async () => {
    const submissionId = randomUUID();
    const memoPath = path.join(contentRoot, "Memos", "system-share", `${submissionId}.md`);
    const original = `---\nsystemShare: {"source":"manual","source":"system-share","submissionId":"${submissionId}"}\n---\nprotected ambiguous content`;
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(memoPath, original);

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "must not replace duplicate property content")),
      "/system-share"
    );
    expect(response.status).toBe(500);
    expect(fs.readFileSync(memoPath, "utf8")).toBe(original);
    expect(await db?.select().from(posts)).toHaveLength(0);
  });

  test("does not overwrite a deterministic Memo owned by another submission", async () => {
    const submissionId = randomUUID();
    const memoPath = path.join(contentRoot, "Memos", "system-share", `${submissionId}.md`);
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(
      memoPath,
      `---\ntitle: Existing Memo\nsystemShare:\n  source: system-share\n  submissionId: ${randomUUID()}\n---\nprotected content\n`
    );

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "must not replace")),
      "/system-share"
    );
    expect(response.status).toBe(500);
    expect(fs.readFileSync(memoPath, "utf8")).toContain("protected content");
    expect(await db?.select().from(posts)).toHaveLength(0);
  });

  test("does not adopt a deterministic Memo with a matching id but another source", async () => {
    const submissionId = randomUUID();
    const memoPath = path.join(contentRoot, "Memos", "system-share", `${submissionId}.md`);
    const original = `---\nsystemShare: {"source":"manual","submissionId":"${submissionId}"}\n---\nprotected source-owned content\n`;
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(memoPath, original);

    const response = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "must not adopt another source")),
      "/system-share"
    );
    expect(response.status).toBe(500);
    expect(fs.readFileSync(memoPath, "utf8")).toBe(original);
    expect(await db?.select().from(posts)).toHaveLength(0);
  });

  test("removes a partially written Memo temporary file before a retry", async () => {
    const submissionId = randomUUID();
    const previousInjection = process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_MEMO_TEMP_WRITE;
    process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_MEMO_TEMP_WRITE = "1";
    try {
      const response = await handlePublicApiRequest(
        buildRequest(createForm(submissionId, "temporary write failure")),
        "/system-share"
      );
      expect(response.status).toBe(500);
    } finally {
      if (previousInjection === undefined)
        delete process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_MEMO_TEMP_WRITE;
      else process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_MEMO_TEMP_WRITE = previousInjection;
    }

    const memoDirectory = path.join(contentRoot, "Memos", "system-share");
    expect(fs.existsSync(memoDirectory) ? fs.readdirSync(memoDirectory) : []).toHaveLength(0);

    const retry = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "temporary write retry")),
      "/system-share"
    );
    expect(retry.status).toBe(201);
    expect(await db?.select().from(posts)).toHaveLength(1);
  });

  test("serializes concurrent recovery of a malformed deterministic Memo", async () => {
    const submissionId = randomUUID();
    const memoPath = path.join(contentRoot, "Memos", "system-share", `${submissionId}.md`);
    fs.mkdirSync(path.dirname(memoPath), { recursive: true });
    fs.writeFileSync(
      memoPath,
      `---\ntitle: [\nsystemShare: {"source":"system-share","submissionId":"${submissionId}"}\n---\npartial write`
    );
    const now = Date.now();
    await db?.insert(systemShareSubmissions).values({
      submissionId,
      memoId: null,
      memoSlug: null,
      classification: "memo",
      state: "processing",
      leaseToken: randomUUID(),
      leaseExpiresAt: now - 1,
      createdAt: now,
      updatedAt: now,
    });

    const responses = await Promise.all([
      handlePublicApiRequest(
        buildRequest(createForm(submissionId, "first recovery")),
        "/system-share"
      ),
      handlePublicApiRequest(
        buildRequest(createForm(submissionId, "second recovery")),
        "/system-share"
      ),
    ]);
    expect(responses.some((response) => response.status === 201)).toBe(true);
    expect(responses.every((response) => [200, 201, 409].includes(response.status))).toBe(true);
    expect(fs.readFileSync(memoPath, "utf8")).not.toContain("partial write");
    expect(await db?.select().from(posts)).toHaveLength(1);
    expect(await db?.select().from(systemShareSubmissions)).toMatchObject([
      { submissionId, state: "completed" },
    ]);
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
    const firstPayload = (await first.json()) as { memoId?: string };
    const secondPayload = (await second.json()) as { memoId?: string };
    expect(firstPayload.memoId).toBeTruthy();
    expect(secondPayload.memoId).toBeTruthy();
    expect(firstPayload.memoId).not.toBe(secondPayload.memoId);
    const createdIds = new Set([firstPayload.memoId, secondPayload.memoId]);
    const createdMemos = (await db?.select().from(posts))?.filter((memo) =>
      createdIds.has(memo.id)
    );
    expect(createdMemos).toHaveLength(2);
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
      classification: null,
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
    expect(await db?.select({ id: posts.id }).from(posts).where(eq(posts.id, memoId))).toHaveLength(
      1
    );
  });

  test("does not replay another Memo when a legacy slug is reused", async () => {
    const firstSubmissionId = randomUUID();
    const secondSubmissionId = randomUUID();
    const first = await handlePublicApiRequest(
      buildRequest(createForm(firstSubmissionId, "first memo")),
      "/system-share"
    );
    const second = await handlePublicApiRequest(
      buildRequest(createForm(secondSubmissionId, "second memo")),
      "/system-share"
    );
    const firstPayload = (await first.json()) as { memo?: { slug?: string } };
    const secondPayload = (await second.json()) as { memoId?: string };
    if (!firstPayload.memo?.slug || !secondPayload.memoId) {
      throw new Error("expected two created Memos");
    }

    await db
      ?.update(systemShareSubmissions)
      .set({ memoSlug: firstPayload.memo.slug })
      .where(eq(systemShareSubmissions.submissionId, secondSubmissionId));

    const replay = await handlePublicApiRequest(
      buildRequest(createForm(secondSubmissionId, "second memo")),
      "/system-share"
    );
    expect(replay.status).toBe(404);
    expect(await db?.select({ id: posts.id }).from(posts)).toHaveLength(2);
  });

  test("does not replay a classified completed row after its Memo ownership marker changes", async () => {
    const submissionId = randomUUID();
    const first = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "owned completed memo")),
      "/system-share"
    );
    const firstPayload = (await first.json()) as { memoId?: string };
    if (!firstPayload.memoId) throw new Error("expected a Memo id");
    const firstRow = await db
      ?.select()
      .from(posts)
      .where(eq(posts.id, firstPayload.memoId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!firstRow?.filePath) throw new Error("expected an indexed Memo file");
    const memoPath = path.join(contentRoot, firstRow.filePath);
    const original = fs.readFileSync(memoPath, "utf8");
    fs.writeFileSync(
      memoPath,
      original.replace(
        /systemShare:\s*\{[^\n]+\}/u,
        `systemShare: {"source":"manual","submissionId":"${submissionId}"}`
      )
    );

    const replay = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "must not replay repurposed Memo")),
      "/system-share"
    );
    expect(replay.status).toBe(404);
    expect(fs.readFileSync(memoPath, "utf8")).toContain('"source":"manual"');
  });

  test("upgrades legacy comments and resumes a blocked backfill without losing identity", async () => {
    const migrationRoot = fs.mkdtempSync(
      path.join(process.cwd(), "tmp", "system-share-migrations-")
    );
    const legacyMigrationsPath = path.join(migrationRoot, "drizzle");
    const legacyDbPath = path.join(migrationRoot, "legacy.sqlite");
    fs.cpSync(migrationsPath, legacyMigrationsPath, { recursive: true });
    fs.rmSync(path.join(legacyMigrationsPath, "0016_system_share_recovery.sql"));
    fs.rmSync(path.join(legacyMigrationsPath, "0017_github_reader_comments.sql"));
    fs.rmSync(path.join(legacyMigrationsPath, "0018_comments_backfill_gate.sql"));
    fs.rmSync(path.join(legacyMigrationsPath, "0019_playbook_snapshots.sql"));
    fs.rmSync(path.join(legacyMigrationsPath, "0020_github_admin_comment_identity.sql"));
    fs.rmSync(path.join(legacyMigrationsPath, "0021_project_status.sql"));
    fs.rmSync(path.join(legacyMigrationsPath, "0022_project_status_running_guard.sql"));
    fs.rmSync(path.join(legacyMigrationsPath, "0023_project_status_heartbeat.sql"));
    fs.rmSync(path.join(legacyMigrationsPath, "0024_scheduler_lease.sql"));
    fs.rmSync(path.join(legacyMigrationsPath, "0025_project_status_scheduler_owner.sql"));
    const journalPath = path.join(legacyMigrationsPath, "meta", "_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string }>;
    };
    journal.entries = journal.entries.filter(
      (entry) =>
        entry.tag !== "0016_system_share_recovery" &&
        entry.tag !== "0017_github_reader_comments" &&
        entry.tag !== "0018_comments_backfill_gate" &&
        entry.tag !== "0019_playbook_snapshots" &&
        entry.tag !== "0020_github_admin_comment_identity" &&
        entry.tag !== "0021_project_status" &&
        entry.tag !== "0022_project_status_running_guard" &&
        entry.tag !== "0023_project_status_heartbeat" &&
        entry.tag !== "0024_scheduler_lease" &&
        entry.tag !== "0025_project_status_scheduler_owner"
    );
    fs.writeFileSync(journalPath, `${JSON.stringify(journal)}\n`);

    const sqlite = new Database(legacyDbPath);
    try {
      migrate(drizzle(sqlite), { migrationsFolder: legacyMigrationsPath });
      const submissionId = randomUUID();
      const rootCommentId = randomUUID();
      const replyCommentId = randomUUID();
      sqlite
        .query(
          "INSERT INTO system_share_submissions (submission_id, memo_id, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run(submissionId, "Memos/legacy.md", "completed", 1, 2);
      sqlite
        .query(
          "INSERT INTO comments (id, content, post_slug, author_name, author_email, parent_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          rootCommentId,
          "保留根评论正文",
          "legacy-article",
          "Legacy Reader",
          "legacy@example.com",
          null,
          "approved",
          10
        );
      sqlite
        .query(
          "INSERT INTO comments (id, content, post_slug, author_name, author_email, parent_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          replyCommentId,
          "保留回复正文",
          "legacy-article",
          "Reply Reader",
          "reply@example.com",
          rootCommentId,
          "pending",
          20
        );
      migrate(drizzle(sqlite), { migrationsFolder: migrationsPath });
      const row = sqlite
        .query(
          "SELECT memo_id, state, memo_slug, classification, lease_token, lease_expires_at FROM system_share_submissions WHERE submission_id = ?"
        )
        .get(submissionId) as Record<string, unknown>;
      expect(row).toMatchObject({
        memo_id: "Memos/legacy.md",
        state: "completed",
        memo_slug: null,
        classification: null,
        lease_token: null,
        lease_expires_at: null,
      });

      const migratedComments = sqlite
        .query(
          "SELECT id, content, post_slug, target_type, target_key, author_name, author_email, parent_id, root_id, status, revision FROM comments ORDER BY created_at"
        )
        .all() as Array<Record<string, unknown>>;
      expect(migratedComments).toEqual([
        {
          id: rootCommentId,
          content: "保留根评论正文",
          post_slug: "legacy-article",
          target_type: "article",
          target_key: "legacy-article",
          author_name: "Legacy Reader",
          author_email: "legacy@example.com",
          parent_id: null,
          root_id: rootCommentId,
          status: "approved",
          revision: 1,
        },
        {
          id: replyCommentId,
          content: "保留回复正文",
          post_slug: "legacy-article",
          target_type: "article",
          target_key: "legacy-article",
          author_name: "Reply Reader",
          author_email: "reply@example.com",
          parent_id: rootCommentId,
          root_id: rootCommentId,
          status: "pending",
          revision: 1,
        },
      ]);

      sqlite.query("UPDATE comments SET target_type = '', target_key = '', root_id = NULL").run();
      const firstBackfill = runCommentBackfill(legacyDbPath);
      expect(firstBackfill.exitCode).toBe(0);
      expect(JSON.parse(firstBackfill.output)).toMatchObject({
        scanned: 2,
        repaired: 2,
        status: "complete",
      });
      expect(
        sqlite
          .query("SELECT id, target_type, target_key, root_id FROM comments ORDER BY created_at")
          .all()
      ).toEqual([
        {
          id: rootCommentId,
          target_type: "article",
          target_key: "legacy-article",
          root_id: rootCommentId,
        },
        {
          id: replyCommentId,
          target_type: "article",
          target_key: "legacy-article",
          root_id: rootCommentId,
        },
      ]);

      const secondBackfill = runCommentBackfill(legacyDbPath);
      expect(secondBackfill.exitCode).toBe(0);
      expect(JSON.parse(secondBackfill.output)).toMatchObject({ repaired: 0, status: "complete" });

      sqlite
        .query("UPDATE comments SET parent_id = ?, root_id = NULL WHERE id = ?")
        .run("missing-parent", replyCommentId);
      const blockedBackfill = runCommentBackfill(legacyDbPath);
      expect(blockedBackfill.exitCode).toBe(1);
      expect(JSON.parse(blockedBackfill.output)).toMatchObject({ status: "blocked" });
      expect(
        sqlite
          .query("SELECT status, error_count FROM comment_migration_state WHERE id = ?")
          .get("reader-comments")
      ).toEqual({ status: "blocked", error_count: 1 });

      sqlite
        .query("UPDATE comments SET parent_id = ?, root_id = NULL WHERE id = ?")
        .run(rootCommentId, replyCommentId);
      const resumedBackfill = runCommentBackfill(legacyDbPath);
      expect(resumedBackfill.exitCode).toBe(0);
      expect(JSON.parse(resumedBackfill.output)).toMatchObject({ status: "complete" });
    } finally {
      sqlite.close();
      fs.rmSync(migrationRoot, { recursive: true, force: true });
    }
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
    const authored = fs.readFileSync(path.join(contentRoot, rows?.[0]?.filePath || ""), "utf8");
    expect(authored).toContain("#剪藏");
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

  test("rejects a symlinked attachment parent without writing outside the content root", async () => {
    const outsideRoot = fs.mkdtempSync(path.join(process.cwd(), "tmp", "system-share-outside-"));
    const memoRoot = path.join(contentRoot, "Memos");
    fs.mkdirSync(memoRoot, { recursive: true });
    fs.symlinkSync(outsideRoot, path.join(memoRoot, "assets"), "dir");
    try {
      const form = createForm(randomUUID(), "symlink attachment");
      form.append("files", new File(["outside"], "outside.txt", { type: "text/plain" }));
      const response = await handlePublicApiRequest(buildRequest(form), "/system-share");
      expect(response.status).toBe(500);
      expect(fs.readdirSync(outsideRoot)).toHaveLength(0);
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  test("rejects a symlinked Memo parent without writing outside the content root", async () => {
    const outsideRoot = fs.mkdtempSync(path.join(process.cwd(), "tmp", "system-share-outside-"));
    const memoRoot = path.join(contentRoot, "Memos");
    fs.mkdirSync(memoRoot, { recursive: true });
    fs.symlinkSync(outsideRoot, path.join(memoRoot, "system-share"), "dir");
    try {
      const response = await handlePublicApiRequest(
        buildRequest(createForm(randomUUID(), "symlink memo")),
        "/system-share"
      );
      expect(response.status).toBe(500);
      expect(fs.readdirSync(outsideRoot)).toHaveLength(0);
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  test("cleans staged files when attachment ingestion fails before Memo creation", async () => {
    const submissionId = randomUUID();
    const form = createForm(submissionId, "atomic attachment failure");
    form.append("files", new File(["first"], "first.txt", { type: "text/plain" }));
    form.append("files", new File(["second"], "broken.txt", { type: "text/plain" }));
    const previousInjection = process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_FILES;
    process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_FILES = "1";
    try {
      const response = await handlePublicApiRequest(buildRequest(form), "/system-share");
      expect(response.status).toBe(500);
    } finally {
      if (previousInjection === undefined) delete process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_FILES;
      else process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_FILES = previousInjection;
    }
    expect(await db?.select().from(posts)).toHaveLength(0);
    expect(await db?.select().from(systemShareSubmissions)).toHaveLength(0);
    const stagingRoot = path.join(contentRoot, "Memos", "assets", "system-share", submissionId);
    expect(fs.existsSync(stagingRoot) ? fs.readdirSync(stagingRoot) : []).toHaveLength(0);
  });

  test("retains another lease's staging when a reclaimed retry fails before Memo creation", async () => {
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
      state: "committing",
      leaseToken: oldLeaseToken,
      leaseExpiresAt: now - 1,
      createdAt: now,
      updatedAt: now,
    });
    const form = createForm(submissionId, "reclaimed failure");
    form.append("files", new File(["first"], "first.txt", { type: "text/plain" }));
    const previousInjection = process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_FILES;
    process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_FILES = "1";
    try {
      const response = await handlePublicApiRequest(buildRequest(form), "/system-share");
      expect(response.status).toBe(500);
    } finally {
      if (previousInjection === undefined) delete process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_FILES;
      else process.env.SYSTEM_SHARE_TEST_FAIL_AFTER_FILES = previousInjection;
    }
    expect(fs.existsSync(orphanDirectory)).toBe(true);
    expect(await db?.select().from(posts)).toHaveLength(0);
    expect(await db?.select().from(systemShareSubmissions)).toMatchObject([
      {
        submissionId,
        state: "processing",
        leaseToken: expect.any(String),
        leaseExpiresAt: expect.any(Number),
      },
    ]);

    const retry = await handlePublicApiRequest(
      buildRequest(createForm(submissionId, "reclaimed retry succeeds")),
      "/system-share"
    );
    expect(retry.status).toBe(201);
    expect(fs.existsSync(orphanDirectory)).toBe(false);
    expect(await db?.select().from(posts)).toHaveLength(1);
  });
});
