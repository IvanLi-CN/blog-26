import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { posts, sessions, users } from "@/lib/schema";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/http-compat-api-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");
const LOCAL_CONTENT_BASE_PATH = path.join(process.cwd(), "tmp/http-compat-local");
const ADMIN_EMAIL = "admin-test@test.local";
const USER_EMAIL = "user-test@test.local";

let handleAdminApiRequest: typeof import("@/server/admin-api/router").handleAdminApiRequest;
let handlePublicApiRequest: typeof import("@/server/public-api/router").handlePublicApiRequest;

function buildRequest(pathname: string, init: RequestInit = {}, email?: string) {
  const headers = new Headers(init.headers);
  if (email) {
    headers.set("Remote-Email", email);
  }
  return new Request(`http://localhost${pathname}`, { ...init, headers });
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>;
}

async function seedPost(
  overrides: Partial<{
    id: string;
    slug: string;
    type: "post" | "memo";
    title: string;
    excerpt: string | null;
    body: string;
    publishDate: number;
    updateDate: number;
    draft: boolean;
    public: boolean;
    tags: string | null;
    source: "local" | "webdav";
    filePath: string;
    author: string | null;
    metadata: string | null;
  }> = {}
) {
  if (!db) {
    throw new Error("Database has not been initialised");
  }

  const now = Date.now();
  const id = overrides.id ?? `content/${randomUUID()}.md`;
  await db.insert(posts).values({
    id,
    slug: overrides.slug ?? `slug-${randomUUID()}`,
    type: overrides.type ?? "post",
    title: overrides.title ?? "Sample",
    excerpt: overrides.excerpt ?? null,
    body: overrides.body ?? "Body",
    publishDate: overrides.publishDate ?? now,
    updateDate: overrides.updateDate ?? now,
    draft: overrides.draft ?? false,
    public: overrides.public ?? true,
    category: null,
    tags: overrides.tags ?? JSON.stringify(["preview"]),
    author: overrides.author ?? ADMIN_EMAIL,
    image: null,
    metadata: overrides.metadata ?? null,
    dataSource: overrides.source ?? "local",
    contentHash: randomUUID(),
    lastModified: overrides.updateDate ?? now,
    source: overrides.source ?? "local",
    filePath: overrides.filePath ?? id,
  });

  return id;
}

describe("HTTP compatibility APIs", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "development";
    process.env.ADMIN_EMAIL = ADMIN_EMAIL;
    process.env.DB_PATH = TEST_DB_PATH;
    process.env.LOCAL_CONTENT_BASE_PATH = LOCAL_CONTENT_BASE_PATH;
    process.env.CONTENT_SOURCES = "local";
    delete process.env.WEBDAV_URL;

    fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    fs.mkdirSync(LOCAL_CONTENT_BASE_PATH, { recursive: true });

    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH);
    }

    const sqlite = new Database(TEST_DB_PATH);
    const client = drizzle(sqlite);
    migrate(client, { migrationsFolder: MIGRATIONS_PATH });
    sqlite.close();

    ({ handleAdminApiRequest } = await import("@/server/admin-api/router"));
    ({ handlePublicApiRequest } = await import("@/server/public-api/router"));

    await initializeDB(true);
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH);
    }
    fs.rmSync(LOCAL_CONTENT_BASE_PATH, { recursive: true, force: true });
  });

  beforeEach(async () => {
    if (!db) {
      throw new Error("Database has not been initialised");
    }

    await db.delete(sessions);
    await db.delete(posts);
    await db.delete(users);

    fs.rmSync(LOCAL_CONTENT_BASE_PATH, { recursive: true, force: true });
    fs.mkdirSync(LOCAL_CONTENT_BASE_PATH, { recursive: true });
  });

  it("requires admin auth for /api/admin/preview/posts/:slug and allows draft previews", async () => {
    await seedPost({
      id: "blog/preview-secret.md",
      filePath: "blog/preview-secret.md",
      slug: "preview-secret",
      title: "Preview Secret",
      body: "# Draft only preview",
      draft: true,
      public: false,
      tags: JSON.stringify(["draft", "secret"]),
    });

    const unauthorized = await handleAdminApiRequest(
      buildRequest("/api/admin/preview/posts/preview-secret"),
      "/preview/posts/preview-secret"
    );
    expect(unauthorized.status).toBe(401);

    const forbidden = await handleAdminApiRequest(
      buildRequest("/api/admin/preview/posts/preview-secret", {}, USER_EMAIL),
      "/preview/posts/preview-secret"
    );
    expect(forbidden.status).toBe(403);

    const ok = await handleAdminApiRequest(
      buildRequest("/api/admin/preview/posts/preview-secret", {}, ADMIN_EMAIL),
      "/preview/posts/preview-secret"
    );
    expect(ok.status).toBe(200);
    const payload = await readJson(ok);
    expect(payload.kind).toBe("post");
    expect(payload.slug).toBe("preview-secret");
    expect(payload.title).toBe("Preview Secret");
    expect(payload.draft).toBe(true);
  });

  it("serves memo CRUD from /api/public/memos/* without tRPC routing", async () => {
    const createResponse = await handlePublicApiRequest(
      buildRequest(
        "/api/public/memos",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            title: "HTTP Memo",
            content: "# hello from compatibility api",
            isPublic: false,
            tags: ["compat", "memo"],
            attachments: [],
          }),
        },
        ADMIN_EMAIL
      ),
      "/memos"
    );

    expect(createResponse.status).toBe(200);
    const created = await readJson(createResponse);
    expect(created.slug).toBeTruthy();
    expect(created.isPublic).toBe(false);
    expect(created.tags).toEqual(["compat", "memo"]);
    expect(typeof created.id).toBe("string");

    const createdFile = path.join(LOCAL_CONTENT_BASE_PATH, created.id);
    expect(fs.existsSync(createdFile)).toBe(true);

    const detailResponse = await handlePublicApiRequest(
      buildRequest(`/api/public/memos/${created.slug}`, {}, ADMIN_EMAIL),
      `/memos/${created.slug}`
    );
    expect(detailResponse.status).toBe(200);
    const detail = await readJson(detailResponse);
    expect(detail.slug).toBe(created.slug);
    expect(detail.content).toContain("compatibility api");

    const listResponse = await handlePublicApiRequest(
      buildRequest("/api/public/memos?publicOnly=false&limit=20", {}, ADMIN_EMAIL),
      "/memos"
    );
    expect(listResponse.status).toBe(200);
    const listPayload = await readJson(listResponse);
    expect(Array.isArray(listPayload.memos)).toBe(true);
    expect(listPayload.memos.some((memo: { slug: string }) => memo.slug === created.slug)).toBe(
      true
    );

    const patchResponse = await handlePublicApiRequest(
      buildRequest(
        `/api/public/memos/${created.slug}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id: created.id,
            title: "HTTP Memo Updated",
            content: "# updated via http api",
            isPublic: true,
            tags: ["compat", "updated"],
            attachments: [],
          }),
        },
        ADMIN_EMAIL
      ),
      `/memos/${created.slug}`
    );

    expect(patchResponse.status).toBe(200);
    const updated = await readJson(patchResponse);
    expect(updated.title).toBe("HTTP Memo Updated");
    expect(updated.isPublic).toBe(true);
    expect(updated.tags).toEqual(["compat", "updated"]);
    const updatedFileContent = fs.readFileSync(createdFile, "utf8");
    expect(updatedFileContent).toContain("HTTP Memo Updated");
    expect(updatedFileContent).toContain("updated via http api");

    const deleteResponse = await handlePublicApiRequest(
      buildRequest(`/api/public/memos/${created.slug}`, { method: "DELETE" }, ADMIN_EMAIL),
      `/memos/${created.slug}`
    );
    expect(deleteResponse.status).toBe(200);
    const deleted = await readJson(deleteResponse);
    expect(deleted.success).toBe(true);
    expect(fs.existsSync(createdFile)).toBe(false);

    const afterDelete = await handlePublicApiRequest(
      buildRequest(`/api/public/memos/${created.slug}`, {}, ADMIN_EMAIL),
      `/memos/${created.slug}`
    );
    expect(afterDelete.status).toBe(404);
  });

  it("keeps the path slug authoritative when patching /api/public/memos/:slug", async () => {
    const primaryId = await seedPost({
      id: "memos/path-authoritative.md",
      filePath: "memos/path-authoritative.md",
      slug: "path-authoritative",
      type: "memo",
      title: "Path Authoritative",
      body: "original primary body",
      public: true,
    });
    const secondaryId = await seedPost({
      id: "memos/other-target.md",
      filePath: "memos/other-target.md",
      slug: "other-target",
      type: "memo",
      title: "Other Target",
      body: "original secondary body",
      public: true,
    });

    const patchResponse = await handlePublicApiRequest(
      buildRequest(
        "/api/public/memos/path-authoritative",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            id: secondaryId,
            title: "Updated via path slug",
            content: "updated primary body",
            isPublic: false,
            tags: ["path", "locked"],
            attachments: [],
          }),
        },
        ADMIN_EMAIL
      ),
      "/memos/path-authoritative"
    );

    expect(patchResponse.status).toBe(200);
    const updated = await readJson(patchResponse);
    expect(updated.id).toBe(primaryId);
    expect(updated.slug).toBe("path-authoritative");
    expect(updated.title).toBe("Updated via path slug");
    expect(updated.content).toContain("updated primary body");

    const primaryDetail = await handlePublicApiRequest(
      buildRequest("/api/public/memos/path-authoritative", {}, ADMIN_EMAIL),
      "/memos/path-authoritative"
    );
    const primaryPayload = await readJson(primaryDetail);
    expect(primaryPayload.title).toBe("Updated via path slug");
    expect(primaryPayload.content).toContain("updated primary body");
    expect(primaryPayload.isPublic).toBe(false);

    const secondaryDetail = await handlePublicApiRequest(
      buildRequest("/api/public/memos/other-target", {}, ADMIN_EMAIL),
      "/memos/other-target"
    );
    const secondaryPayload = await readJson(secondaryDetail);
    expect(secondaryPayload.id).toBe(secondaryId);
    expect(secondaryPayload.title).toBe("Other Target");
    expect(secondaryPayload.content).toContain("original secondary body");
  });
});
