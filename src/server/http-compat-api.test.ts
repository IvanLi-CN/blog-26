import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { buildPublicMediaHash } from "@/lib/public-media";
import { llmSettings, posts, sessions, users } from "@/lib/schema";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/http-compat-api-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");
const LOCAL_CONTENT_BASE_PATH = path.join(process.cwd(), "tmp/http-compat-local");
const ADMIN_EMAIL = "admin-test@test.local";
const USER_EMAIL = "user-test@test.local";

let handleAdminApiRequest: typeof import("@/server/admin-api/router").handleAdminApiRequest;
let handlePublicApiRequest: typeof import("@/server/public-api/router").handlePublicApiRequest;
let handleFilesApiRequest: typeof import("@/server/files-api/router").handleFilesApiRequest;
let handleInternalAssetSourceRequest: typeof import("@/server/public-media").handleInternalAssetSourceRequest;

function resetHttpCompatEnv() {
  process.env.NODE_ENV = "development";
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.DB_PATH = TEST_DB_PATH;
  process.env.LOCAL_CONTENT_BASE_PATH = LOCAL_CONTENT_BASE_PATH;
  process.env.CONTENT_SOURCES = "local";
  process.env.LOCAL_BLOG_PATH = "/blog,/Hardware";
  process.env.PUBLIC_SITE_URL = "https://pages.example.test";
  process.env.LLM_SETTINGS_MASTER_KEY = "test-master-key";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_BASE_URL;
}

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

function createSuccessfulSyncResult() {
  return {
    success: true,
    startTime: Date.now(),
    endTime: Date.now(),
    sources: ["local"],
    stats: {
      totalProcessed: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      errors: 0,
    },
    errors: [],
    logs: [],
  };
}

function createFailedSyncResult(message: string) {
  return {
    ...createSuccessfulSyncResult(),
    success: false,
    errors: [{ source: "local", operation: "sync", message, timestamp: Date.now() }],
  };
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
    source: "local" | "local";
    filePath: string;
    author: string | null;
    metadata: string | null;
    image: string | null;
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
    image: overrides.image ?? null,
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
    resetHttpCompatEnv();
    const { resetContentSourceManager } = await import("@/lib/content-sources");
    await resetContentSourceManager();

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
    ({ handleFilesApiRequest } = await import("@/server/files-api/router"));
    ({ handleInternalAssetSourceRequest } = await import("@/server/public-media"));

    await initializeDB(true);
  }, 20_000);

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH);
    }
    fs.rmSync(LOCAL_CONTENT_BASE_PATH, { recursive: true, force: true });
  }, 10_000);

  beforeEach(async () => {
    resetHttpCompatEnv();
    const { resetContentSourceManager } = await import("@/lib/content-sources");
    await resetContentSourceManager();

    if (!db) {
      throw new Error("Database has not been initialised");
    }

    await db.delete(llmSettings);
    await db.delete(sessions);
    await db.delete(posts);
    await db.delete(users);

    fs.rmSync(LOCAL_CONTENT_BASE_PATH, { recursive: true, force: true });
    fs.mkdirSync(LOCAL_CONTENT_BASE_PATH, { recursive: true });
  }, 10_000);

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const { resetContentSourceManager } = await import("@/lib/content-sources");
    await resetContentSourceManager();
  }, 10_000);

  it("returns masked LLM settings, persists overrides, and can clear saved keys", async () => {
    const initial = await handleAdminApiRequest(
      buildRequest("/api/admin/llm-settings", {}, ADMIN_EMAIL),
      "/llm-settings"
    );
    expect(initial.status).toBe(200);
    const initialPayload = await readJson(initial);
    expect(initialPayload.settings.chat.model).toBe("");
    expect(initialPayload.resolved.chat.model).toBeDefined();
    expect(initialPayload.settings.chat.apiKey.hasValue).toBe(false);

    const saved = await handleAdminApiRequest(
      buildRequest(
        "/api/admin/llm-settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat: {
              model: "openai/gpt-4.1-mini",
              baseUrl: "https://api.example.test",
              apiKeyInput: "sk-test-chat-123456",
            },
            embedding: {
              model: "openai/text-embedding-3-small",
              useCustomProvider: false,
              baseUrlMode: "inherit",
              baseUrl: "",
              apiKeyMode: "inherit",
              apiKeyInput: "",
            },
            rerank: {
              model: "cohere/rerank-v3.5",
              useCustomProvider: true,
              baseUrlMode: "custom",
              baseUrl: "https://rerank.example.test",
              apiKeyMode: "custom",
              apiKeyInput: "sk-rerank-123456",
            },
          }),
        },
        ADMIN_EMAIL
      ),
      "/llm-settings"
    );
    expect(saved.status).toBe(200);
    const savedPayload = await readJson(saved);
    expect(savedPayload.settings.chat.apiKey.hasValue).toBe(true);
    expect(savedPayload.settings.chat.apiKey.maskedValue).not.toContain("sk-test-chat-123456");
    expect(savedPayload.settings.chat.apiKey.maskedValue).toBe("•".repeat(19));
    expect(savedPayload.resolved.chat.baseUrl).toBe("https://api.example.test/v1");
    expect(savedPayload.resolved.embedding.baseUrl).toBe("https://api.example.test/v1");
    expect(savedPayload.resolved.embedding.apiKeyAvailable).toBe(true);
    expect(savedPayload.settings.rerank.apiKey.hasValue).toBe(true);

    const reloaded = await handleAdminApiRequest(
      buildRequest("/api/admin/llm-settings", {}, ADMIN_EMAIL),
      "/llm-settings"
    );
    expect(reloaded.status).toBe(200);
    const reloadedPayload = await readJson(reloaded);
    expect(reloadedPayload.settings.chat.model).toBe("openai/gpt-4.1-mini");
    expect(reloadedPayload.settings.chat.apiKey.hasValue).toBe(true);
    expect(reloadedPayload.settings.chat.apiKey.maskedValue).not.toContain("sk-test-chat-123456");
    expect(reloadedPayload.settings.chat.apiKey.maskedValue).toBe("•".repeat(19));

    const cleared = await handleAdminApiRequest(
      buildRequest(
        "/api/admin/llm-settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat: {
              model: "openai/gpt-4.1-mini",
              baseUrl: "",
              clearApiKey: true,
            },
            embedding: {
              model: "openai/text-embedding-3-small",
              useCustomProvider: false,
              baseUrlMode: "inherit",
              baseUrl: "",
              apiKeyMode: "inherit",
            },
            rerank: {
              model: "cohere/rerank-v3.5",
              useCustomProvider: true,
              baseUrlMode: "custom",
              baseUrl: "https://rerank.example.test",
              apiKeyMode: "custom",
            },
          }),
        },
        ADMIN_EMAIL
      ),
      "/llm-settings"
    );
    expect(cleared.status).toBe(200);
    const clearedPayload = await readJson(cleared);
    expect(clearedPayload.settings.chat.apiKey.hasValue).toBe(false);
    expect(clearedPayload.settings.rerank.apiKey.hasValue).toBe(true);
  });

  it("rejects baseURL saves without an available API key", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await handleAdminApiRequest(
      buildRequest(
        "/api/admin/llm-settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat: {
              model: "",
              baseUrl: "https://api.example.test",
            },
            embedding: {
              model: "",
              useCustomProvider: false,
              baseUrlMode: "inherit",
              baseUrl: "",
              apiKeyMode: "inherit",
            },
            rerank: {
              model: "",
              useCustomProvider: false,
              baseUrlMode: "inherit",
              baseUrl: "",
              apiKeyMode: "inherit",
            },
          }),
        },
        ADMIN_EMAIL
      ),
      "/llm-settings"
    );

    expect(response.status).toBe(400);
    const payload = await readJson(response);
    expect(payload.error.message).toContain("必须同时提供 API Key");
  });

  it("uses resolved tier LLM settings when listing upstream models", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_BASE_URL;

    const saved = await handleAdminApiRequest(
      buildRequest(
        "/api/admin/llm-settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat: {
              model: "openai/gpt-4.1-mini",
              baseUrl: "https://models.example.test",
              apiKeyInput: "sk-test-chat-123456",
            },
            embedding: {
              model: "",
              useCustomProvider: true,
              baseUrlMode: "custom",
              baseUrl: "https://embedding-models.example.test",
              apiKeyMode: "custom",
              apiKeyInput: "sk-test-embedding-123456",
            },
            rerank: {
              model: "",
              useCustomProvider: false,
              baseUrlMode: "inherit",
              baseUrl: "",
              apiKeyMode: "inherit",
            },
          }),
        },
        ADMIN_EMAIL
      ),
      "/llm-settings"
    );
    expect(saved.status).toBe(200);

    const originalFetch = globalThis.fetch;
    const seenUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seenUrls.push(url);
      if (url === "https://models.example.test/v1/models") {
        return new Response(
          JSON.stringify({
            object: "list",
            data: [{ id: "gpt-4o-mini", object: "model", created: 0, owned_by: "openai" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url === "https://embedding-models.example.test/v1/models") {
        return new Response(
          JSON.stringify({
            object: "list",
            data: [
              { id: "text-embedding-3-small", object: "model", created: 0, owned_by: "openai" },
              { id: "provider-embedding-custom", object: "model", created: 0, owned_by: "custom" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    try {
      const response = await handleAdminApiRequest(
        buildRequest("/api/admin/llm/models?source=upstream", {}, ADMIN_EMAIL),
        "/llm/models"
      );

      expect(response.status).toBe(200);
      const payload = await readJson(response);
      expect(payload.source).toBe("upstream");
      expect(payload.models).toEqual([
        expect.objectContaining({
          id: "gpt-4o-mini",
          name: "GPT-4o mini",
          known: true,
        }),
      ]);

      const embeddingResponse = await handleAdminApiRequest(
        buildRequest("/api/admin/llm/models?source=upstream&tier=embedding", {}, ADMIN_EMAIL),
        "/llm/models"
      );

      expect(embeddingResponse.status).toBe(200);
      const embeddingPayload = await readJson(embeddingResponse);
      expect(embeddingPayload.models).toEqual([
        expect.objectContaining({
          capabilities: ["embedding"],
          id: "provider-embedding-custom",
          known: false,
          name: "provider-embedding-custom",
        }),
        expect.objectContaining({
          capabilities: ["embedding"],
          id: "text-embedding-3-small",
          name: "Text Embedding 3 Small",
          known: true,
        }),
      ]);
      expect(seenUrls).toEqual([
        "https://models.example.test/v1/models",
        "https://embedding-models.example.test/v1/models",
      ]);

      const invalidTierResponse = await handleAdminApiRequest(
        buildRequest("/api/admin/llm/models?source=upstream&tier=invalid", {}, ADMIN_EMAIL),
        "/llm/models"
      );

      expect(invalidTierResponse.status).toBe(400);
      const invalidTierPayload = await readJson(invalidTierResponse);
      expect(invalidTierPayload.error.code).toBe("BAD_REQUEST");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns tier-filtered model catalog entries for admin LLM settings", async () => {
    const response = await handleAdminApiRequest(
      buildRequest("/api/admin/llm-settings/catalog?tier=embedding", {}, ADMIN_EMAIL),
      "/llm-settings/catalog"
    );
    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items.every((item: any) => item.capabilities.includes("embeddings"))).toBe(true);
  });

  it("validates URLs and can test unsaved LLM settings through the admin API", async () => {
    const invalidResponse = await handleAdminApiRequest(
      buildRequest(
        "/api/admin/llm-settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat: {
              model: "",
              baseUrl: "not-a-url",
            },
            embedding: {
              model: "",
              useCustomProvider: false,
              baseUrlMode: "inherit",
              baseUrl: "",
              apiKeyMode: "inherit",
            },
            rerank: {
              model: "",
              useCustomProvider: false,
              baseUrlMode: "inherit",
              baseUrl: "",
              apiKeyMode: "inherit",
            },
          }),
        },
        ADMIN_EMAIL
      ),
      "/llm-settings"
    );
    expect(invalidResponse.status).toBe(400);
    expect((await readJson(invalidResponse)).error.message).toContain("不是合法的 URL");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/chat/completions")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "pong" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/llm-settings/test",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tier: "chat",
              settings: {
                chat: {
                  model: "openai/gpt-4.1-mini",
                  baseUrl: "https://chat.example.test",
                  apiKeyInput: "sk-chat-test-123456",
                },
                embedding: {
                  model: "",
                  useCustomProvider: false,
                  baseUrlMode: "inherit",
                  baseUrl: "",
                  apiKeyMode: "inherit",
                  apiKeyInput: "",
                },
                rerank: {
                  model: "",
                  useCustomProvider: false,
                  baseUrlMode: "inherit",
                  baseUrl: "",
                  apiKeyMode: "inherit",
                  apiKeyInput: "",
                },
              },
            }),
          },
          ADMIN_EMAIL
        ),
        "/llm-settings/test"
      );

      expect(response.status).toBe(200);
      const payload = await readJson(response);
      expect(payload.ok).toBe(true);
      expect(payload.summary).toContain("测试通过");
      expect(payload.baseUrl).toBe("https://chat.example.test/v1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns an actionable config error when the LLM settings master key is missing", async () => {
    const previousMasterKey = process.env.LLM_SETTINGS_MASTER_KEY;
    delete process.env.LLM_SETTINGS_MASTER_KEY;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/llm-settings",
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat: {
                model: "openai/gpt-4.1-mini",
                baseUrl: "https://api.example.test",
                apiKeyInput: "sk-test-chat-123456",
              },
              embedding: {
                model: "openai/text-embedding-3-small",
                useCustomProvider: false,
                baseUrlMode: "inherit",
                baseUrl: "",
                apiKeyMode: "inherit",
                apiKeyInput: "",
              },
              rerank: {
                model: "",
                useCustomProvider: false,
                baseUrlMode: "inherit",
                baseUrl: "",
                apiKeyMode: "inherit",
                apiKeyInput: "",
              },
            }),
          },
          ADMIN_EMAIL
        ),
        "/llm-settings"
      );

      expect(response.status).toBe(503);
      const payload = await readJson(response);
      expect(payload.error.code).toBe("LLM_SETTINGS_MASTER_KEY_MISSING");
      expect(payload.error.message).toContain("LLM_SETTINGS_MASTER_KEY");
    } finally {
      if (previousMasterKey === undefined) {
        delete process.env.LLM_SETTINGS_MASTER_KEY;
      } else {
        process.env.LLM_SETTINGS_MASTER_KEY = previousMasterKey;
      }
    }
  });

  it("returns actionable provider test failures instead of a generic 500", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/chat/completions")) {
        return new Response("bad credentials", { status: 401, statusText: "Unauthorized" });
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/llm-settings/test",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tier: "chat",
              settings: {
                chat: {
                  model: "openai/gpt-4.1-mini",
                  baseUrl: "https://chat.example.test",
                  apiKeyInput: "sk-chat-test-123456",
                },
                embedding: {
                  model: "",
                  useCustomProvider: false,
                  baseUrlMode: "inherit",
                  baseUrl: "",
                  apiKeyMode: "inherit",
                  apiKeyInput: "",
                },
                rerank: {
                  model: "",
                  useCustomProvider: false,
                  baseUrlMode: "inherit",
                  baseUrl: "",
                  apiKeyMode: "inherit",
                  apiKeyInput: "",
                },
              },
            }),
          },
          ADMIN_EMAIL
        ),
        "/llm-settings/test"
      );

      expect(response.status).toBe(502);
      const payload = await readJson(response);
      expect(payload.error.code).toBe("PROVIDER_TEST_FAILED");
      expect(payload.error.message).toContain("对话模型测试失败：401 Unauthorized bad credentials");
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  it("adds CORS headers for configured Pages frontend origins", async () => {
    await seedPost({
      id: "blog/cors-visible.md",
      filePath: "blog/cors-visible.md",
      slug: "cors-visible",
      title: "CORS Visible",
      body: "Visible over public API",
      public: true,
    });

    const preflight = await handlePublicApiRequest(
      buildRequest(
        "/api/public/memos",
        {
          method: "OPTIONS",
          headers: {
            origin: "https://pages.example.test",
            "access-control-request-headers": "content-type",
          },
        },
        ADMIN_EMAIL
      ),
      "/memos"
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://pages.example.test");
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");

    const response = await handlePublicApiRequest(
      buildRequest(
        "/api/public/posts?limit=1",
        {
          headers: {
            origin: "https://pages.example.test",
          },
        },
        ADMIN_EMAIL
      ),
      "/posts"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://pages.example.test");
  });

  it("exports a live public snapshot from /api/public/snapshot", async () => {
    await seedPost({
      id: "blog/http-snapshot-post.md",
      filePath: "blog/http-snapshot-post.md",
      slug: "http-snapshot-post",
      type: "post",
      title: "HTTP Snapshot Post",
      excerpt: "snapshot post excerpt",
      body: "snapshot post body",
      public: true,
      draft: false,
      tags: JSON.stringify(["Hardware/DC-DC", "Project/Pages"]),
    });

    await seedPost({
      id: "Memos/http-snapshot-memo.md",
      filePath: "Memos/http-snapshot-memo.md",
      slug: "http-snapshot-memo",
      type: "memo",
      title: "HTTP Snapshot Memo",
      excerpt: "snapshot memo excerpt",
      body: "# memo body\n\n#Hardware/DC-DC",
      public: true,
      draft: false,
      tags: JSON.stringify(["Hardware/DC-DC"]),
      source: "local",
    });

    const response = await handlePublicApiRequest(
      buildRequest(
        "/api/public/snapshot",
        {
          headers: {
            origin: "https://pages.example.test",
          },
        },
        ADMIN_EMAIL
      ),
      "/snapshot"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://pages.example.test");

    const payload = await readJson(response);
    expect(typeof payload.generatedAt).toBe("string");
    expect(Array.isArray(payload.posts)).toBe(true);
    expect(Array.isArray(payload.memos)).toBe(true);
    const snapshotPost = payload.posts.find(
      (post: { slug: string }) => post.slug === "http-snapshot-post"
    );
    const snapshotMemo = payload.memos.find(
      (memo: { slug: string }) => memo.slug === "http-snapshot-memo"
    );

    expect(snapshotPost?.filePath).toBe("blog/http-snapshot-post.md");
    expect(snapshotMemo?.filePath).toBe("Memos/http-snapshot-memo.md");
  }, 15_000);

  it("rewrites public snapshot media fields to assets facade urls", async () => {
    fs.mkdirSync(path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets"), { recursive: true });
    fs.writeFileSync(path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets/public-cover.png"), "cover");

    await seedPost({
      id: "blog/public-media-post.md",
      filePath: "blog/public-media-post.md",
      slug: "public-media-post",
      type: "post",
      title: "Public Media Post",
      body: "![inline](./assets/public-cover.png)",
      image: "./assets/public-cover.png",
      public: true,
      draft: false,
    });

    const response = await handlePublicApiRequest(
      buildRequest("/api/public/snapshot"),
      "/snapshot"
    );
    expect(response.status).toBe(200);

    const payload = await readJson(response);
    const snapshotPost = payload.posts.find(
      (post: { slug: string }) => post.slug === "public-media-post"
    );
    expect(snapshotPost?.image).toContain("/api/public/assets/post/public-media-post/");
    expect(snapshotPost?.image).not.toContain("/api/files/");
    expect(snapshotPost?.media?.cover?.variants?.cover).toContain(
      "/api/public/assets/post/public-media-post/"
    );
  });

  it("rewrites local media urls to the public facade for public rows", async () => {
    await seedPost({
      id: "blog/local-media-post.md",
      filePath: "blog/local-media-post.md",
      slug: "local-media-post",
      type: "post",
      title: "Local Media Post",
      body: "![inline](./assets/local-cover.png)",
      image: "./assets/local-cover.png",
      public: true,
      draft: false,
      source: "local",
    });

    const response = await handlePublicApiRequest(
      buildRequest("/api/public/snapshot"),
      "/snapshot"
    );
    expect(response.status).toBe(200);

    const payload = await readJson(response);
    const snapshotPost = payload.posts.find(
      (post: { slug: string }) => post.slug === "local-media-post"
    );
    expect(snapshotPost?.image).toContain("/api/public/assets/post/local-media-post/");
    expect(snapshotPost?.image).not.toContain("/api/files/");
    expect(snapshotPost?.media?.cover?.variants?.cover).toContain(
      "/api/public/assets/post/local-media-post/"
    );
  });

  it("proxies public facade image requests through imagorvideo without redirecting", async () => {
    fs.mkdirSync(path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets"), { recursive: true });
    fs.writeFileSync(path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets/facade-cover.png"), "cover");

    await seedPost({
      id: "blog/facade-post.md",
      filePath: "blog/facade-post.md",
      slug: "facade-post",
      type: "post",
      title: "Facade Post",
      image: "./assets/facade-cover.png",
      body: "Body",
      public: true,
      draft: false,
    });

    const originalFetch = globalThis.fetch;
    process.env.PUBLIC_MEDIA_IMAGOR_BASE_URL = "http://imagor.example.test";
    process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL = "http://blog:25090";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://imagor.example.test/")) {
        expect(init?.method).toBe("GET");
        expect(url).toContain("/fit-in/1600x900/");
        expect(url).toContain("filters:");
        expect(url).toContain("http://blog:25090/_internal/assets/source/post/facade-post/");
        return new Response("optimized-image", {
          status: 200,
          headers: {
            "content-type": "image/webp",
            "cache-control": "public, max-age=600",
          },
        });
      }
      return originalFetch(input as never, init);
    }) as typeof fetch;

    try {
      const mediaHash = buildPublicMediaHash("blog/assets/facade-cover.png", "cover");
      const response = await handlePublicApiRequest(
        buildRequest(`/api/public/assets/post/facade-post/${mediaHash}/cover.webp`),
        `/assets/post/facade-post/${mediaHash}/cover.webp`
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
      expect(response.headers.get("cache-control")).toBe("public, max-age=600");
      expect(response.headers.get("location")).toBeNull();
      expect(await response.text()).toBe("optimized-image");
    } finally {
      delete process.env.PUBLIC_MEDIA_IMAGOR_BASE_URL;
      delete process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL;
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to source bytes in non-production when imagor is unavailable", async () => {
    fs.mkdirSync(path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets"), { recursive: true });
    fs.writeFileSync(path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets/fallback-cover.png"), "cover");

    await seedPost({
      id: "blog/fallback-post.md",
      filePath: "blog/fallback-post.md",
      slug: "fallback-post",
      type: "post",
      title: "Fallback Post",
      image: "./assets/fallback-cover.png",
      body: "Body",
      public: true,
      draft: false,
    });

    const originalFetch = globalThis.fetch;
    process.env.PUBLIC_MEDIA_IMAGOR_BASE_URL = "http://imagor.example.test";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith("http://imagor.example.test/")) {
        throw new Error("imagor offline");
      }
      return originalFetch(input as never, init);
    }) as typeof fetch;

    try {
      const mediaHash = buildPublicMediaHash("blog/assets/fallback-cover.png", "cover");
      const response = await handlePublicApiRequest(
        buildRequest(`/api/public/assets/post/fallback-post/${mediaHash}/cover.webp`),
        `/assets/post/fallback-post/${mediaHash}/cover.webp`
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("x-public-media-fallback")).toBe("source");
      expect(await response.text()).toBe("cover");
    } finally {
      delete process.env.PUBLIC_MEDIA_IMAGOR_BASE_URL;
      globalThis.fetch = originalFetch;
    }
  });

  it("serves internal source media with range support", async () => {
    fs.mkdirSync(path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets"), { recursive: true });
    fs.writeFileSync(
      path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets/range-video.mp4"),
      "0123456789"
    );

    await seedPost({
      id: "blog/range-video-post.md",
      filePath: "blog/range-video-post.md",
      slug: "range-video-post",
      type: "post",
      title: "Range Video Post",
      body: '<video src="./assets/range-video.mp4" controls></video>',
      public: true,
      draft: false,
    });

    process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL = "http://localhost";
    try {
      const mediaHash = buildPublicMediaHash("blog/assets/range-video.mp4", "playback");
      const response = await handleInternalAssetSourceRequest(
        buildRequest(`/_internal/assets/source/post/range-video-post/${mediaHash}`, {
          headers: {
            range: "bytes=2-5",
          },
        }),
        { kind: "post", slug: "range-video-post", mediaHash }
      );

      expect(response.status).toBe(206);
      expect(response.headers.get("accept-ranges")).toBe("bytes");
      expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
      expect(await response.text()).toBe("2345");
    } finally {
      delete process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL;
    }
  });

  it("rejects internal source requests that do not use the configured internal host", async () => {
    fs.mkdirSync(path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets"), { recursive: true });
    fs.writeFileSync(path.join(LOCAL_CONTENT_BASE_PATH, "blog/assets/private-cover.png"), "cover");

    await seedPost({
      id: "blog/private-host-check.md",
      filePath: "blog/private-host-check.md",
      slug: "private-host-check",
      type: "post",
      title: "Private Host Check",
      image: "./assets/private-cover.png",
      public: true,
      draft: false,
    });

    process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL = "http://blog:25090";
    try {
      const mediaHash = buildPublicMediaHash("blog/assets/private-cover.png", "cover");
      const response = await handleInternalAssetSourceRequest(
        buildRequest(`/_internal/assets/source/post/private-host-check/${mediaHash}`),
        { kind: "post", slug: "private-host-check", mediaHash }
      );

      expect(response.status).toBe(404);
    } finally {
      delete process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL;
    }
  });

  it("serves public search recovery suggestions from /api/public/search/suggestions", async () => {
    await seedPost({
      slug: "react-hooks-deep-dive",
      type: "post",
      title: "React Hooks 深度解析",
      excerpt: "从依赖数组、闭包和渲染时机解释 Hook 的稳定用法。",
      tags: JSON.stringify(["frontend/react", "programming/hooks"]),
    });

    const response = await handlePublicApiRequest(
      buildRequest("/api/public/search/suggestions?q=React%20Hookz&reason=empty&limit=3"),
      "/search/suggestions"
    );

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload).toEqual(
      expect.objectContaining({
        source: "fallback",
        reason: "empty",
      })
    );
    expect(payload.suggestions).toEqual(expect.any(Array));
    expect(payload.items).toEqual(expect.any(Array));
    expect(
      payload.items.some((item: { strategy?: string }) =>
        ["broader_by_domain", "related", "sibling", "alternative_label"].includes(
          item.strategy ?? ""
        )
      )
    ).toBe(true);
    expect(payload.suggestions.some((term: string) => /react|hooks/i.test(term))).toBe(true);
  });

  it("requires admin auth for cross-origin file uploads while preserving Pages CORS", async () => {
    const pathname = "/api/files/local/Memos/uploads/http-upload.txt";
    const params = { source: "local", path: ["Memos", "uploads", "http-upload.txt"] };
    const headers = {
      origin: "https://pages.example.test",
      "content-type": "text/plain",
    };

    const unauthorized = await handleFilesApiRequest(
      buildRequest(pathname, { method: "POST", headers, body: "hello" }),
      params
    );
    expect(unauthorized.status).toBe(403);
    expect(unauthorized.headers.get("access-control-allow-origin")).toBe(
      "https://pages.example.test"
    );

    const forbidden = await handleFilesApiRequest(
      buildRequest(pathname, { method: "POST", headers, body: "hello" }, USER_EMAIL),
      params
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("access-control-allow-origin")).toBe("https://pages.example.test");

    const ok = await handleFilesApiRequest(
      buildRequest(pathname, { method: "POST", headers, body: "hello" }, ADMIN_EMAIL),
      params
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://pages.example.test");

    const payload = await readJson(ok);
    expect(payload.success).toBe(true);
    expect(payload.path).toBe("Memos/uploads/http-upload.txt");

    const uploadedFile = path.join(LOCAL_CONTENT_BASE_PATH, "Memos/uploads/http-upload.txt");
    expect(fs.existsSync(uploadedFile)).toBe(true);
    expect(fs.readFileSync(uploadedFile, "utf-8")).toBe("hello");
  });

  it("keeps same-origin file uploads compatible without admin auth", async () => {
    const pathname = "/api/files/local/Memos/uploads/http-upload-same-origin.txt";
    const params = {
      source: "local",
      path: ["Memos", "uploads", "http-upload-same-origin.txt"],
    };

    const response = await handleFilesApiRequest(
      buildRequest(pathname, { method: "POST", body: "same-origin-ok" }),
      params
    );

    expect(response.status).toBe(200);
    const payload = await readJson(response);
    expect(payload.success).toBe(true);
    expect(payload.path).toBe("Memos/uploads/http-upload-same-origin.txt");

    const uploadedFile = path.join(
      LOCAL_CONTENT_BASE_PATH,
      "Memos/uploads/http-upload-same-origin.txt"
    );
    expect(fs.existsSync(uploadedFile)).toBe(true);
    expect(fs.readFileSync(uploadedFile, "utf-8")).toBe("same-origin-ok");
  });

  it("returns a missing-image friendly 404 for local files", async () => {
    const response = await handleFilesApiRequest(
      buildRequest("/api/files/local/blog/assets/missing-cover.jpg", {
        method: "GET",
        headers: {
          accept: "image/jpeg,image/*",
          origin: "https://pages.example.test",
        },
      }),
      { source: "local", path: ["blog", "assets", "missing-cover.jpg"] }
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://pages.example.test");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.byteLength).toBe(0);
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

  it("allows clearing a memo body via /api/public/memos/:slug", async () => {
    await seedPost({
      id: "memos/clearable-body.md",
      filePath: "memos/clearable-body.md",
      slug: "clearable-body",
      type: "memo",
      title: "Clearable Body",
      body: "body to remove",
      public: true,
    });

    const patchResponse = await handlePublicApiRequest(
      buildRequest(
        "/api/public/memos/clearable-body",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            content: "",
            title: "Cleared Memo",
            isPublic: false,
            tags: [],
            attachments: [],
          }),
        },
        ADMIN_EMAIL
      ),
      "/memos/clearable-body"
    );

    expect(patchResponse.status).toBe(200);
    const updated = await readJson(patchResponse);
    expect(updated.slug).toBe("clearable-body");
    expect(updated.title).toBe("Cleared Memo");
    expect(updated.content).toBe("");
    expect(updated.isPublic).toBe(false);
  });

  it("returns structured validation details when creating an empty post", async () => {
    const response = await handleAdminApiRequest(
      buildRequest(
        "/api/admin/posts",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "未命名文章",
            slug: "untitled-post",
            body: "",
            excerpt: "",
            type: "post",
            draft: true,
            public: false,
          }),
        },
        ADMIN_EMAIL
      ),
      "/posts"
    );

    expect(response.status).toBe(400);
    const payload = await readJson(response);
    expect(payload.error.code).toBe("BAD_REQUEST");
    expect(Array.isArray(payload.error.details)).toBe(true);
    expect(payload.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["body"],
          message: "内容不能为空",
        }),
      ])
    );
  });

  it("initializes the local content source once and reuses it for repeated admin writes", async () => {
    const { LocalContentSource, getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const initializedFilePath = "Hardware/new-admin-file.md";
    const repeatedFilePath = "Hardware/repeated-admin-file.md";
    fs.mkdirSync(hardwareDir, { recursive: true });

    const manager = getContentSourceManager();
    const originalInitialize = LocalContentSource.prototype.initialize;
    const originalSyncAll = manager.syncAll;
    let initializeCalls = 0;

    LocalContentSource.prototype.initialize = async function (...args) {
      initializeCalls += 1;
      return await originalInitialize.apply(this, args);
    };
    manager.syncAll = (async () => ({
      success: true,
      startTime: Date.now(),
      endTime: Date.now(),
      sources: ["local"],
      stats: {
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
      },
      errors: [],
      logs: [],
    })) as typeof manager.syncAll;

    try {
      const initializedWrite = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/write",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              path: initializedFilePath,
              content: "",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/write"
      );

      expect(initializedWrite.status).toBe(200);
      const initializedPayload = await readJson(initializedWrite);
      expect(initializedPayload.success).toBe(true);
      expect(fs.existsSync(path.join(hardwareDir, "new-admin-file.md"))).toBe(true);

      const firstRepeatedWrite = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/write",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              path: repeatedFilePath,
              content: "first",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/write"
      );
      expect(firstRepeatedWrite.status).toBe(200);
      const initializeCallsAfterFirstRepeatedWrite = initializeCalls;

      const secondRepeatedWrite = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/write",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              path: repeatedFilePath,
              content: "second",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/write"
      );
      expect(secondRepeatedWrite.status).toBe(200);
      expect(initializeCallsAfterFirstRepeatedWrite).toBeGreaterThan(0);
      expect(initializeCalls).toBe(initializeCallsAfterFirstRepeatedWrite);
      expect(fs.readFileSync(path.join(LOCAL_CONTENT_BASE_PATH, repeatedFilePath), "utf-8")).toBe(
        "second"
      );
    } finally {
      LocalContentSource.prototype.initialize = originalInitialize;
      manager.syncAll = originalSyncAll;
    }
  });

  it("initializes the local content source before renaming files", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    fs.mkdirSync(hardwareDir, { recursive: true });
    fs.writeFileSync(path.join(hardwareDir, "rename-me.md"), "rename");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    let syncedSources: string[] | null = null;

    manager.syncAll = async function (...args) {
      const result = await originalSyncAll.apply(this, args);
      syncedSources = result.sources;
      return result;
    } as typeof manager.syncAll;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/rename",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              oldPath: "Hardware/rename-me.md",
              newName: "renamed.md",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/rename"
      );

      expect(response.status).toBe(200);
      expect(fs.existsSync(path.join(hardwareDir, "renamed.md"))).toBe(true);
      expect(syncedSources).toContain("local");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("moves and copies local files through the admin API", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const docsDir = path.join(hardwareDir, "docs");
    const archiveDir = path.join(hardwareDir, "archive");
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "move-me.md"), "move");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const moveResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/docs/move-me.md"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );
      expect(moveResponse.status).toBe(200);
      const movePayload = await readJson(moveResponse);
      expect(movePayload.moved).toEqual([
        {
          path: "Hardware/docs/move-me.md",
          nextPath: "Hardware/archive/move-me.md",
          type: "file",
        },
      ]);
      expect(fs.existsSync(path.join(archiveDir, "move-me.md"))).toBe(true);

      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/archive/move-me.md"],
              destinationPath: "Hardware/docs",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );
      expect(copyResponse.status).toBe(200);
      const copyPayload = await readJson(copyResponse);
      expect(copyPayload.copied).toEqual([
        {
          path: "Hardware/archive/move-me.md",
          nextPath: "Hardware/docs/move-me.md",
          type: "file",
        },
      ]);
      expect(fs.readFileSync(path.join(docsDir, "move-me.md"), "utf-8")).toBe("move");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("keeps local file source enabled when CONTENT_SOURCES contains only legacy values", async () => {
    process.env.CONTENT_SOURCES = "webdav";

    try {
      const response = await handleAdminApiRequest(
        buildRequest("/api/admin/files/sources", {}, ADMIN_EMAIL),
        "/files/sources"
      );

      expect(response.status).toBe(200);
      const payload = await readJson(response);
      expect(payload[0]).toMatchObject({
        name: "local",
        type: "local",
        enabled: true,
      });
    } finally {
      resetHttpCompatEnv();
    }
  });

  it("rolls back file writes when content sync fails", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    fs.mkdirSync(hardwareDir, { recursive: true });

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () =>
      createFailedSyncResult("index unavailable")) as typeof manager.syncAll;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/write",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              path: "Hardware/sync-failure.md",
              content: "sync failure",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/write"
      );

      expect(response.status).toBe(500);
      const payload = await readJson(response);
      expect(payload.error.message).toContain("内容同步失败：index unavailable");
      expect(fs.existsSync(path.join(hardwareDir, "sync-failure.md"))).toBe(false);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rolls back file-tree mutations when content sync fails", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const docsDir = path.join(hardwareDir, "docs");
    const archiveDir = path.join(hardwareDir, "archive");
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "rename.md"), "rename");
    fs.writeFileSync(path.join(docsDir, "move.md"), "move");
    fs.writeFileSync(path.join(docsDir, "copy.md"), "copy");
    fs.writeFileSync(path.join(docsDir, "delete.md"), "delete");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () =>
      createFailedSyncResult("index unavailable")) as typeof manager.syncAll;

    try {
      const renameResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/rename",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              oldPath: "Hardware/docs/rename.md",
              newName: "renamed.md",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/rename"
      );

      expect(renameResponse.status).toBe(500);
      expect(fs.existsSync(path.join(docsDir, "rename.md"))).toBe(true);
      expect(fs.existsSync(path.join(docsDir, "renamed.md"))).toBe(false);

      const moveResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/docs/move.md"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );

      expect(moveResponse.status).toBe(500);
      expect(fs.existsSync(path.join(docsDir, "move.md"))).toBe(true);
      expect(fs.existsSync(path.join(archiveDir, "move.md"))).toBe(false);

      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/docs/copy.md"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );

      expect(copyResponse.status).toBe(500);
      expect(fs.existsSync(path.join(docsDir, "copy.md"))).toBe(true);
      expect(fs.existsSync(path.join(archiveDir, "copy.md"))).toBe(false);

      const deleteResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/delete",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              entries: [{ path: "Hardware/docs/delete.md", type: "file" }],
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/delete"
      );

      expect(deleteResponse.status).toBe(500);
      expect(fs.existsSync(path.join(docsDir, "delete.md"))).toBe(true);
      expect(fs.readFileSync(path.join(docsDir, "delete.md"), "utf-8")).toBe("delete");
      expect(
        fs
          .readdirSync(LOCAL_CONTENT_BASE_PATH)
          .some((entry) => entry.startsWith(".admin-delete-rollback-"))
      ).toBe(false);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rewrites runtime file URLs when writing MDX files", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    fs.mkdirSync(path.join(hardwareDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(hardwareDir, "assets", "cover.png"), "cover");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/write",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              path: "Hardware/article.mdx",
              content:
                "---\nimage: /api/files/local/Hardware/assets/cover.png\n---\n\n![cover](/api/files/local/Hardware/assets/cover.png)",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/write"
      );

      expect(response.status).toBe(200);
      const savedContent = fs.readFileSync(path.join(hardwareDir, "article.mdx"), "utf-8");
      expect(savedContent).not.toContain("/api/files/");
      expect(savedContent).toContain("image: ./assets/cover.png");
      expect(savedContent).toContain("![cover](./assets/cover.png)");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rebases moved markdown links and copied markdown file links", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const docsDir = path.join(hardwareDir, "docs");
    const archiveDir = path.join(hardwareDir, "archive");
    fs.mkdirSync(path.join(docsDir, "assets"), { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "assets", "cover.png"), "cover");
    fs.writeFileSync(
      path.join(docsDir, "linked.md"),
      [
        "---",
        "image: ./assets/cover.png",
        "---",
        "",
        "![cover](./assets/cover.png)",
        "![[./assets/wiki.png|1200]]",
      ].join("\n")
    );

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const moveResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/docs/linked.md"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );
      expect(moveResponse.status).toBe(200);
      const movedContent = fs.readFileSync(path.join(archiveDir, "linked.md"), "utf-8");
      expect(movedContent).toContain("image: ../docs/assets/cover.png");
      expect(movedContent).toContain("![cover](../docs/assets/cover.png)");
      expect(movedContent).toContain("![[../docs/assets/wiki.png|1200]]");

      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/archive/linked.md"],
              destinationPath: "Hardware/docs",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );
      expect(copyResponse.status).toBe(200);
      const copiedContent = fs.readFileSync(path.join(docsDir, "linked.md"), "utf-8");
      expect(copiedContent).toContain("image: ./assets/cover.png");
      expect(copiedContent).toContain("![cover](./assets/cover.png)");
      expect(copiedContent).toContain("![[./assets/wiki.png|1200]]");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rejects moving and copying local files across configured content roots", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const blogDir = path.join(LOCAL_CONTENT_BASE_PATH, "blog");
    fs.mkdirSync(hardwareDir, { recursive: true });
    fs.mkdirSync(blogDir, { recursive: true });
    fs.writeFileSync(path.join(hardwareDir, "move-me.md"), "move");
    fs.writeFileSync(path.join(hardwareDir, "copy-me.md"), "copy");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/move-me.md"],
              destinationPath: "blog",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );

      expect(response.status).toBe(400);
      const payload = await readJson(response);
      expect(payload.error.message).toContain("不能跨内容根目录操作项目");
      expect(fs.existsSync(path.join(hardwareDir, "move-me.md"))).toBe(true);
      expect(fs.existsSync(path.join(blogDir, "move-me.md"))).toBe(false);

      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/copy-me.md"],
              destinationPath: "blog",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );

      expect(copyResponse.status).toBe(400);
      const copyPayload = await readJson(copyResponse);
      expect(copyPayload.error.message).toContain("不能跨内容根目录操作项目");
      expect(fs.existsSync(path.join(hardwareDir, "copy-me.md"))).toBe(true);
      expect(fs.existsSync(path.join(blogDir, "copy-me.md"))).toBe(false);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rejects empty destinations for local move and copy operations", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const blogDir = path.join(LOCAL_CONTENT_BASE_PATH, "blog");
    fs.mkdirSync(blogDir, { recursive: true });
    fs.writeFileSync(path.join(blogDir, "move-me.md"), "move");
    fs.writeFileSync(path.join(blogDir, "copy-me.md"), "copy");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const moveResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["blog/move-me.md"],
              destinationPath: "",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );

      expect(moveResponse.status).toBe(400);
      expect(fs.existsSync(path.join(blogDir, "move-me.md"))).toBe(true);
      expect(fs.existsSync(path.join(LOCAL_CONTENT_BASE_PATH, "move-me.md"))).toBe(false);

      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["blog/copy-me.md"],
              destinationPath: "",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );

      expect(copyResponse.status).toBe(400);
      expect(fs.existsSync(path.join(blogDir, "copy-me.md"))).toBe(true);
      expect(fs.existsSync(path.join(LOCAL_CONTENT_BASE_PATH, "copy-me.md"))).toBe(false);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rebases inbound markdown references after moving local asset files", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const assetsDir = path.join(hardwareDir, "assets");
    const archiveDir = path.join(hardwareDir, "archive");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "cover.png"), "cover");
    fs.writeFileSync(
      path.join(hardwareDir, "post.md"),
      ["---", "image: ./assets/cover.png", "---", "", "![cover](./assets/cover.png)"].join("\n")
    );

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/assets/cover.png"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );

      expect(response.status).toBe(200);
      const content = fs.readFileSync(path.join(hardwareDir, "post.md"), "utf-8");
      expect(content).toContain("image: ./archive/cover.png");
      expect(content).toContain("![cover](./archive/cover.png)");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rolls back local file moves when inbound markdown reference rebasing fails", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const assetsDir = path.join(hardwareDir, "assets");
    const archiveDir = path.join(hardwareDir, "archive");
    const postPath = path.join(hardwareDir, "post.md");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "cover.png"), "cover");
    fs.writeFileSync(postPath, "![cover](./assets/cover.png)");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      fs.chmodSync(postPath, 0o444);
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/assets/cover.png"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(fs.existsSync(path.join(assetsDir, "cover.png"))).toBe(true);
      expect(fs.existsSync(path.join(archiveDir, "cover.png"))).toBe(false);
      fs.chmodSync(postPath, 0o644);
      expect(fs.readFileSync(postPath, "utf-8")).toBe("![cover](./assets/cover.png)");
    } finally {
      fs.chmodSync(postPath, 0o644);
      manager.syncAll = originalSyncAll;
    }
  });

  it("rolls back local file renames when inbound markdown reference rebasing fails", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const assetsDir = path.join(hardwareDir, "assets");
    const postPath = path.join(hardwareDir, "post.md");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "cover.png"), "cover");
    fs.writeFileSync(postPath, "![cover](./assets/cover.png)");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      fs.chmodSync(postPath, 0o444);
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/rename",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              oldPath: "Hardware/assets/cover.png",
              newName: "hero.png",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/rename"
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(fs.existsSync(path.join(assetsDir, "cover.png"))).toBe(true);
      expect(fs.existsSync(path.join(assetsDir, "hero.png"))).toBe(false);
      fs.chmodSync(postPath, 0o644);
      expect(fs.readFileSync(postPath, "utf-8")).toBe("![cover](./assets/cover.png)");
    } finally {
      fs.chmodSync(postPath, 0o644);
      manager.syncAll = originalSyncAll;
    }
  });

  it("removes copied targets when copied markdown rebasing fails", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const docsDir = path.join(hardwareDir, "docs");
    const archiveDir = path.join(hardwareDir, "archive");
    const sourcePath = path.join(docsDir, "linked.md");
    fs.mkdirSync(path.join(docsDir, "assets"), { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "assets", "cover.png"), "cover");
    fs.writeFileSync(sourcePath, "![cover](./assets/cover.png)");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      fs.chmodSync(sourcePath, 0o444);
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/docs/linked.md"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(fs.existsSync(path.join(archiveDir, "linked.md"))).toBe(false);
      expect(fs.existsSync(sourcePath)).toBe(true);
    } finally {
      fs.chmodSync(sourcePath, 0o644);
      manager.syncAll = originalSyncAll;
    }
  });

  it("rebases inbound markdown references after renaming local asset files", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const assetsDir = path.join(hardwareDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, "cover.png"), "cover");
    fs.writeFileSync(
      path.join(hardwareDir, "post.md"),
      ["---", "image: ./assets/cover.png", "---", "", "![cover](./assets/cover.png)"].join("\n")
    );

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/rename",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              oldPath: "Hardware/assets/cover.png",
              newName: "hero.png",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/rename"
      );

      expect(response.status).toBe(200);
      const content = fs.readFileSync(path.join(hardwareDir, "post.md"), "utf-8");
      expect(content).toContain("image: ./assets/hero.png");
      expect(content).toContain("![cover](./assets/hero.png)");
      expect(fs.existsSync(path.join(assetsDir, "hero.png"))).toBe(true);
      expect(fs.existsSync(path.join(assetsDir, "cover.png"))).toBe(false);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rebases inbound markdown references across configured roots after renaming local assets", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const blogAssetsDir = path.join(LOCAL_CONTENT_BASE_PATH, "blog", "assets");
    const memoDir = path.join(LOCAL_CONTENT_BASE_PATH, "Memos");
    fs.mkdirSync(blogAssetsDir, { recursive: true });
    fs.mkdirSync(memoDir, { recursive: true });
    fs.writeFileSync(path.join(blogAssetsDir, "cover.png"), "cover");
    fs.writeFileSync(
      path.join(memoDir, "note.md"),
      ["# Note", "", "![cover](../blog/assets/cover.png)"].join("\n")
    );

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/rename",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              oldPath: "blog/assets/cover.png",
              newName: "hero.png",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/rename"
      );

      expect(response.status).toBe(200);
      const memoContent = fs.readFileSync(path.join(memoDir, "note.md"), "utf-8");
      expect(memoContent).toContain("![cover](../blog/assets/hero.png)");
      expect(fs.existsSync(path.join(blogAssetsDir, "hero.png"))).toBe(true);
      expect(fs.existsSync(path.join(blogAssetsDir, "cover.png"))).toBe(false);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rebases copied markdown links inside directory subtrees", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const docsDir = path.join(hardwareDir, "docs");
    const archiveDir = path.join(hardwareDir, "archive");
    const sharedDir = path.join(docsDir, "shared");
    fs.mkdirSync(path.join(docsDir, "series"), { recursive: true });
    fs.mkdirSync(path.join(docsDir, "series", "assets"), { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.writeFileSync(path.join(sharedDir, "logo.png"), "logo");
    fs.writeFileSync(path.join(docsDir, "series", "assets", "cover.png"), "cover");
    fs.writeFileSync(
      path.join(docsDir, "series", "overview.md"),
      ["# Series", "", "![cover](./assets/cover.png)", "![logo](../shared/logo.png)"].join("\n")
    );

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/docs/series"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );

      expect(copyResponse.status).toBe(200);
      const copiedContent = fs.readFileSync(
        path.join(archiveDir, "series", "overview.md"),
        "utf-8"
      );
      expect(copiedContent).toContain("![logo](../../docs/shared/logo.png)");
      expect(copiedContent).toContain("![cover](./assets/cover.png)");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rebases markdown links across related entries copied in one batch", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const docsDir = path.join(hardwareDir, "docs");
    const archiveDir = path.join(hardwareDir, "archive");
    fs.mkdirSync(path.join(docsDir, "assets"), { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "assets", "cover.png"), "cover");
    fs.writeFileSync(
      path.join(docsDir, "post.md"),
      [
        "---",
        "image: ./assets/cover.png",
        "---",
        "",
        "![cover](./assets/cover.png)",
        "[Asset ref]: ./assets/cover.png",
      ].join("\n")
    );

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/docs/post.md", "Hardware/docs/assets"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );

      expect(copyResponse.status).toBe(200);
      const copiedContent = fs.readFileSync(path.join(archiveDir, "post.md"), "utf-8");
      expect(copiedContent).toContain("image: ./assets/cover.png");
      expect(copiedContent).toContain("![cover](./assets/cover.png)");
      expect(copiedContent).toContain("[Asset ref]: ./assets/cover.png");
      expect(fs.existsSync(path.join(archiveDir, "assets", "cover.png"))).toBe(true);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rebases persisted markdown asset links for .markdown files", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const docsDir = path.join(hardwareDir, "docs");
    const archiveDir = path.join(hardwareDir, "archive");
    fs.mkdirSync(path.join(docsDir, "assets"), { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "assets", "cover.png"), "cover");
    fs.writeFileSync(
      path.join(docsDir, "linked.markdown"),
      ["---", "image: ./assets/cover.png", "---", "", "![cover](./assets/cover.png)"].join("\n")
    );

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const moveResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/docs/linked.markdown"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );
      expect(moveResponse.status).toBe(200);

      const movedContent = fs.readFileSync(path.join(archiveDir, "linked.markdown"), "utf-8");
      expect(movedContent).toContain("image: ../docs/assets/cover.png");
      expect(movedContent).toContain("![cover](../docs/assets/cover.png)");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rebases persisted markdown asset links for .mdx files", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const docsDir = path.join(hardwareDir, "docs");
    const archiveDir = path.join(hardwareDir, "archive");
    fs.mkdirSync(path.join(docsDir, "assets"), { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "assets", "cover.png"), "cover");
    fs.writeFileSync(
      path.join(docsDir, "linked.mdx"),
      ["---", "image: ./assets/cover.png", "---", "", "![cover](./assets/cover.png)"].join("\n")
    );

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const moveResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/docs/linked.mdx"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );
      expect(moveResponse.status).toBe(200);

      const movedContent = fs.readFileSync(path.join(archiveDir, "linked.mdx"), "utf-8");
      expect(movedContent).toContain("image: ../docs/assets/cover.png");
      expect(movedContent).toContain("![cover](../docs/assets/cover.png)");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rejects copying local files when the destination already has the same name", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const docsDir = path.join(hardwareDir, "docs");
    const archiveDir = path.join(hardwareDir, "archive");
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, "duplicate.md"), "from-docs");
    fs.writeFileSync(path.join(archiveDir, "duplicate.md"), "from-archive");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/archive/duplicate.md"],
              destinationPath: "Hardware/docs",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );

      expect(copyResponse.status).toBe(409);
      const payload = await readJson(copyResponse);
      expect(payload.error.message).toContain("目标已存在");
      expect(fs.readFileSync(path.join(docsDir, "duplicate.md"), "utf-8")).toBe("from-docs");
      expect(fs.readFileSync(path.join(archiveDir, "duplicate.md"), "utf-8")).toBe("from-archive");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rejects nested selection payloads for local move operations", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const seriesDir = path.join(hardwareDir, "series");
    const nestedDir = path.join(seriesDir, "react");
    const archiveDir = path.join(hardwareDir, "archive");
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, "notes.md"), "nested");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const moveResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/series", "Hardware/series/react/notes.md"],
              destinationPath: "Hardware/archive",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );

      expect(moveResponse.status).toBe(400);
      const payload = await readJson(moveResponse);
      expect(payload.error.message).toContain("不能同时操作父目录与其子项");
      expect(fs.existsSync(seriesDir)).toBe(true);
      expect(fs.existsSync(path.join(nestedDir, "notes.md"))).toBe(true);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rejects moving or copying a directory into its descendant directory", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const seriesDir = path.join(hardwareDir, "series");
    const reactDir = path.join(seriesDir, "react");
    fs.mkdirSync(reactDir, { recursive: true });
    fs.writeFileSync(path.join(seriesDir, "overview.md"), "series");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const moveResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/series"],
              destinationPath: "Hardware/series/react",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );

      expect(moveResponse.status).toBe(400);
      const movePayload = await readJson(moveResponse);
      expect(movePayload.error.message).toContain("不能将目录移动到其自身或后代目录内");

      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["Hardware/series"],
              destinationPath: "Hardware/series/react",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );

      expect(copyResponse.status).toBe(400);
      const copyPayload = await readJson(copyResponse);
      expect(copyPayload.error.message).toContain("不能将目录复制到其自身或后代目录内");
      expect(fs.existsSync(seriesDir)).toBe(true);
      expect(fs.existsSync(reactDir)).toBe(true);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rejects dot-segment destinations for local move and copy operations", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const blogDir = path.join(LOCAL_CONTENT_BASE_PATH, "blog");
    fs.mkdirSync(blogDir, { recursive: true });
    fs.writeFileSync(path.join(blogDir, "post.md"), "post");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const moveResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/move",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["blog/post.md"],
              destinationPath: "blog/..",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/move"
      );

      expect(moveResponse.status).toBe(400);
      const movePayload = await readJson(moveResponse);
      expect(movePayload.error.message).toContain("本地路径不能包含 . 或 .. 路径段");

      const copyResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/copy",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              paths: ["blog/post.md"],
              destinationPath: "blog/..",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/copy"
      );

      expect(copyResponse.status).toBe(400);
      const copyPayload = await readJson(copyResponse);
      expect(copyPayload.error.message).toContain("本地路径不能包含 . 或 .. 路径段");
      expect(fs.existsSync(path.join(blogDir, "post.md"))).toBe(true);
      expect(fs.existsSync(path.join(LOCAL_CONTENT_BASE_PATH, "post.md"))).toBe(false);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("rejects deleting non-empty directories and allows deleting empty directories", async () => {
    const { getContentSourceManager } = await import("@/lib/content-sources");

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    const fullDir = path.join(hardwareDir, "full-dir");
    const emptyDir = path.join(hardwareDir, "empty-dir");
    fs.mkdirSync(fullDir, { recursive: true });
    fs.mkdirSync(emptyDir, { recursive: true });
    fs.writeFileSync(path.join(fullDir, "nested.md"), "nested");

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => createSuccessfulSyncResult()) as typeof manager.syncAll;

    try {
      const failedDeleteResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/delete",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              entries: [{ path: "Hardware/full-dir", type: "directory" }],
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/delete"
      );
      expect(failedDeleteResponse.status).toBe(400);
      const failedPayload = await readJson(failedDeleteResponse);
      expect(failedPayload.error.message).toContain("目录不为空");

      const successDeleteResponse = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/delete",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              entries: [{ path: "Hardware/empty-dir", type: "directory" }],
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/delete"
      );
      expect(successDeleteResponse.status).toBe(200);
      const successPayload = await readJson(successDeleteResponse);
      expect(successPayload.deleted).toEqual([
        {
          path: "Hardware/empty-dir",
          type: "directory",
        },
      ]);
      expect(fs.existsSync(emptyDir)).toBe(false);
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });

  it("uses the current local content env after config modules were imported earlier", async () => {
    process.env.LOCAL_CONTENT_BASE_PATH = "";
    process.env.CONTENT_SOURCES = "webdav";

    await import("@/config/paths?http-compat-stale-config-preload");

    resetHttpCompatEnv();
    const { resetContentSourceManager } = await import("@/lib/content-sources");
    await resetContentSourceManager();

    const hardwareDir = path.join(LOCAL_CONTENT_BASE_PATH, "Hardware");
    fs.mkdirSync(hardwareDir, { recursive: true });

    const manager = (await import("@/lib/content-sources")).getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => ({
      success: true,
      startTime: Date.now(),
      endTime: Date.now(),
      sources: ["local"],
      stats: {
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
      },
      errors: [],
      logs: [],
    })) as typeof manager.syncAll;

    try {
      const response = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/write",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              path: "Hardware/stale-config-admin-file.md",
              content: "from-current-env",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/write"
      );

      expect(response.status).toBe(200);
      expect(fs.readFileSync(path.join(hardwareDir, "stale-config-admin-file.md"), "utf-8")).toBe(
        "from-current-env"
      );
    } finally {
      manager.syncAll = originalSyncAll;
      resetHttpCompatEnv();
      await resetContentSourceManager();
    }
  });

  it("re-registers the local content source when env-derived roots change", async () => {
    const { getContentSourceManager, resetContentSourceManager } = await import(
      "@/lib/content-sources"
    );
    await resetContentSourceManager();

    const firstBasePath = path.join(LOCAL_CONTENT_BASE_PATH, "first-root");
    const secondBasePath = path.join(LOCAL_CONTENT_BASE_PATH, "second-root");
    fs.mkdirSync(path.join(firstBasePath, "Hardware"), { recursive: true });
    fs.mkdirSync(path.join(secondBasePath, "Projects"), { recursive: true });

    process.env.LOCAL_CONTENT_BASE_PATH = firstBasePath;
    process.env.LOCAL_BLOG_PATH = "/Hardware";
    process.env.LOCAL_PROJECTS_PATH = "/projects";

    const manager = getContentSourceManager();
    const originalSyncAll = manager.syncAll;
    manager.syncAll = (async () => ({
      success: true,
      startTime: Date.now(),
      endTime: Date.now(),
      sources: ["local"],
      stats: {
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
      },
      errors: [],
      logs: [],
    })) as typeof manager.syncAll;

    try {
      const firstWrite = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/write",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              path: "Hardware/first-root-file.md",
              content: "first-root",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/write"
      );
      expect(firstWrite.status).toBe(200);
      expect(
        fs.readFileSync(path.join(firstBasePath, "Hardware/first-root-file.md"), "utf-8")
      ).toBe("first-root");

      process.env.LOCAL_CONTENT_BASE_PATH = secondBasePath;
      process.env.LOCAL_BLOG_PATH = "/blog";
      process.env.LOCAL_PROJECTS_PATH = "/Projects";

      const secondWrite = await handleAdminApiRequest(
        buildRequest(
          "/api/admin/files/write",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "local",
              path: "Projects/second-root-file.md",
              content: "second-root",
            }),
          },
          ADMIN_EMAIL
        ),
        "/files/write"
      );
      expect(secondWrite.status).toBe(200);
      expect(fs.existsSync(path.join(firstBasePath, "Projects/second-root-file.md"))).toBe(false);
      expect(
        fs.readFileSync(path.join(secondBasePath, "Projects/second-root-file.md"), "utf-8")
      ).toBe("second-root");
    } finally {
      manager.syncAll = originalSyncAll;
    }
  });
});
