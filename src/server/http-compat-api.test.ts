import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { llmSettings, posts, sessions, users } from "@/lib/schema";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/http-compat-api-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");
const LOCAL_CONTENT_BASE_PATH = path.join(process.cwd(), "tmp/http-compat-local");
const ADMIN_EMAIL = "admin-test@test.local";
const USER_EMAIL = "user-test@test.local";

let handleAdminApiRequest: typeof import("@/server/admin-api/router").handleAdminApiRequest;
let handlePublicApiRequest: typeof import("@/server/public-api/router").handlePublicApiRequest;
let handleFilesApiRequest: typeof import("@/server/files-api/router").handleFilesApiRequest;

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
    process.env.PUBLIC_SITE_URL = "https://pages.example.test";
    process.env.LLM_SETTINGS_MASTER_KEY = "test-master-key";
    delete process.env.WEBDAV_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_BASE_URL;

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

    await db.delete(llmSettings);
    await db.delete(sessions);
    await db.delete(posts);
    await db.delete(users);

    fs.rmSync(LOCAL_CONTENT_BASE_PATH, { recursive: true, force: true });
    fs.mkdirSync(LOCAL_CONTENT_BASE_PATH, { recursive: true });
  });

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
    expect(payload.posts.some((post: { slug: string }) => post.slug === "http-snapshot-post")).toBe(
      true
    );
    expect(payload.memos.some((memo: { slug: string }) => memo.slug === "http-snapshot-memo")).toBe(
      true
    );
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
      buildRequest("/api/public/search/suggestions?q=Zettelkasten&reason=empty&limit=3"),
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
    expect(payload.suggestions.some((term: string) => term.toLowerCase().includes("react"))).toBe(
      true
    );
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
    expect(unauthorized.status).toBe(401);
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

  it("keeps WebDAV 404 infrastructure errors as server failures", async () => {
    const originalWebdavUrl = process.env.WEBDAV_URL;
    const originalContentSources = process.env.CONTENT_SOURCES;
    const originalFetch = globalThis.fetch;
    process.env.WEBDAV_URL = "https://webdav.example.test";
    process.env.CONTENT_SOURCES = "local,webdav";
    globalThis.fetch = (async () => new Response("missing", { status: 404 })) as typeof fetch;

    try {
      const response = await handleFilesApiRequest(
        buildRequest("/api/files/webdav/blog/assets/missing-cover.jpg", {
          method: "GET",
          headers: {
            origin: "https://pages.example.test",
          },
        }),
        { source: "webdav", path: ["blog", "assets", "missing-cover.jpg"] }
      );

      expect(response.status).toBe(500);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://pages.example.test"
      );
      await expect(readJson(response)).resolves.toMatchObject({ error: "读取文件失败" });
    } finally {
      if (originalWebdavUrl) {
        process.env.WEBDAV_URL = originalWebdavUrl;
      } else {
        delete process.env.WEBDAV_URL;
      }
      if (originalContentSources) {
        process.env.CONTENT_SOURCES = originalContentSources;
      } else {
        delete process.env.CONTENT_SOURCES;
      }
      globalThis.fetch = originalFetch;
    }
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
});
