import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { llmSettings, postEmbeddings, posts } from "@/lib/schema";
import {
  getAdminLlmSettingsPayload,
  getResolvedLlmConfig,
  testAdminLlmSettings,
  updateAdminLlmSettings,
} from "./llm-settings";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/llm-settings-service-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

describe("llm settings service", () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    process.env.LLM_SETTINGS_MASTER_KEY = "service-test-master-key";
    delete process.env.LLM_SETTINGS_TEST_TIMEOUT_MS;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_BASE_URL;
    delete process.env.EMBEDDING_MODEL_NAME;
    delete process.env.RERANKER_MODEL_NAME;
    delete process.env.TAG_AI_MODEL;
    delete process.env.CHAT_COMPLETION_MODEL;

    fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH);
    }

    const sqlite = new Database(TEST_DB_PATH);
    const client = drizzle(sqlite);
    migrate(client, { migrationsFolder: MIGRATIONS_PATH });
    sqlite.close();

    await initializeDB(true);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    if (!db) throw new Error("Database has not been initialised");
    await db.delete(postEmbeddings);
    await db.delete(posts);
    await db.delete(llmSettings);
  });

  it("falls back to env/default values when database overrides are missing", async () => {
    process.env.CHAT_COMPLETION_MODEL = "openai/gpt-4o-mini";
    process.env.OPENAI_API_BASE_URL = "https://gateway.example.test";
    process.env.OPENAI_API_KEY = "env-shared-key";
    process.env.EMBEDDING_MODEL_NAME = "openai/text-embedding-3-small";

    const resolved = await getResolvedLlmConfig();
    expect(resolved.chat.model).toBe("openai/gpt-4o-mini");
    expect(resolved.chat.baseUrl).toBe("https://gateway.example.test/v1");
    expect(resolved.embedding.model).toBe("openai/text-embedding-3-small");
    expect(resolved.embedding.baseUrl).toBe("https://gateway.example.test/v1");
    expect(resolved.embedding.sources.baseUrl).toBe("inherited");
    expect(resolved.rerank.model).toBeNull();
  });

  it("persists encrypted settings and exposes masked admin payloads", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_BASE_URL;
    delete process.env.EMBEDDING_MODEL_NAME;
    delete process.env.CHAT_COMPLETION_MODEL;

    await updateAdminLlmSettings({
      chat: {
        model: "openai/gpt-4.1-mini",
        baseUrl: "https://chat.example.test",
        apiKeyInput: "chat-secret-value",
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
        apiKeyInput: "rerank-secret-value",
      },
    });

    const resolved = await getResolvedLlmConfig();
    expect(resolved.chat.apiKey).toBe("chat-secret-value");
    expect(resolved.embedding.apiKey).toBe("chat-secret-value");
    expect(resolved.rerank.apiKey).toBe("rerank-secret-value");

    const payload = await getAdminLlmSettingsPayload();
    expect(payload.settings.chat.apiKey.hasValue).toBe(true);
    expect(payload.settings.chat.apiKey.maskedValue).not.toContain("chat-secret-value");
    expect(payload.settings.chat.apiKey.maskedValue).toBe("•".repeat("chat-secret-value".length));
    expect(payload.resolved.embedding.baseUrl).toBe("https://chat.example.test/v1");
    expect(payload.settings.rerank.apiKey.maskedValue).not.toContain("rerank-secret-value");
    expect(payload.settings.rerank.apiKey.maskedValue).toBe(
      "•".repeat("rerank-secret-value".length)
    );
  });

  it("treats same-model provider changes as reindex suggestions instead of hard requirements", async () => {
    if (!db) throw new Error("Database has not been initialised");

    const now = Date.now();
    await db.insert(posts).values({
      id: "visual-post",
      slug: "visual-post",
      type: "post",
      title: "Visual Post",
      excerpt: "visual excerpt",
      body: "visual body",
      publishDate: now - 10_000,
      updateDate: now - 10_000,
      draft: false,
      public: true,
      category: "demo",
      tags: JSON.stringify(["demo"]),
      author: "tester",
      metadata: JSON.stringify({}),
      dataSource: "database",
      contentHash: "visual-content-hash",
      lastModified: now - 10_000,
      source: "local",
      filePath: "visual-post.md",
    });
    await db.insert(postEmbeddings).values({
      id: "visual-embedding",
      postId: "visual-post",
      slug: "visual-post",
      type: "post",
      modelName: "BAAI/bge-m3",
      dim: 1,
      contentHash: "visual-content-hash",
      chunkIndex: -1,
      vector: new Uint8Array([0]),
      errorMessage: null,
      createdAt: now - 10_000,
      updatedAt: now - 10_000,
    });

    await updateAdminLlmSettings({
      chat: {
        model: "",
        baseUrl: "https://chat.example.test",
        apiKeyInput: "chat-secret-value",
      },
      embedding: {
        model: "BAAI/bge-m3",
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
    });

    const payload = await getAdminLlmSettingsPayload();
    expect(payload.hints.embeddingReindexRequired).toBe(false);
    expect(payload.hints.embeddingReindexSuggested).toBe(true);
    expect(payload.hints.currentIndexedModel).toBe("BAAI/bge-m3");
    expect(payload.hints.currentResolvedModel).toBe("BAAI/bge-m3");
  });

  it("requires an API key when a baseURL is configured", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      updateAdminLlmSettings({
        chat: {
          model: "",
          baseUrl: "https://chat.example.test",
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
      })
    ).rejects.toThrow("对话模型 填写了 baseURL 时，必须同时提供 API Key");
  });

  it("requires a custom baseURL and API key when advanced provider settings are enabled", async () => {
    await expect(
      updateAdminLlmSettings({
        chat: {
          model: "",
          baseUrl: "",
        },
        embedding: {
          model: "openai/text-embedding-3-small",
          useCustomProvider: true,
          baseUrlMode: "custom",
          baseUrl: "",
          apiKeyMode: "custom",
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
      })
    ).rejects.toThrow("嵌入模型 开启高级设置后，baseURL 为必填项");
  });

  it("preserves saved custom provider values when advanced settings are turned off", async () => {
    await updateAdminLlmSettings({
      chat: {
        model: "",
        baseUrl: "https://chat.example.test",
        apiKeyInput: "chat-secret-value",
      },
      embedding: {
        model: "openai/text-embedding-3-small",
        useCustomProvider: true,
        baseUrlMode: "custom",
        baseUrl: "https://embed.example.test",
        apiKeyMode: "custom",
        apiKeyInput: "embed-secret-value",
      },
      rerank: {
        model: "",
        useCustomProvider: false,
        baseUrlMode: "inherit",
        baseUrl: "",
        apiKeyMode: "inherit",
        apiKeyInput: "",
      },
    });

    await updateAdminLlmSettings({
      chat: {
        model: "",
        baseUrl: "https://chat.example.test",
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
    });

    const payload = await getAdminLlmSettingsPayload();
    expect(payload.settings.embedding.useCustomProvider).toBe(false);
    expect(payload.settings.embedding.baseUrl).toBe("https://embed.example.test/v1");
    expect(payload.settings.embedding.apiKey.hasValue).toBe(true);
    expect(payload.resolved.embedding.baseUrl).toBe("https://chat.example.test/v1");
    expect(payload.resolved.embedding.apiKeyAvailable).toBe(true);
  });

  it("validates baseURL format and can test unsaved settings", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "pong" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch;

    try {
      await expect(
        updateAdminLlmSettings({
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
        })
      ).rejects.toThrow("对话模型 baseURL 不是合法的 URL");

      const result = await testAdminLlmSettings("chat", {
        chat: {
          model: "openai/gpt-4.1-mini",
          baseUrl: "https://chat.example.test",
          apiKeyInput: "sk-chat-test-123",
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
      });

      expect(result.ok).toBe(true);
      expect(result.summary).toContain("测试通过");
      expect(fetchCalls[0]).toBe("https://chat.example.test/v1/chat/completions");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("times out hanging provider tests instead of waiting forever", async () => {
    const originalFetch = globalThis.fetch;
    process.env.LLM_SETTINGS_TEST_TIMEOUT_MS = "5";
    globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Timed out", "TimeoutError")),
          { once: true }
        );
      });
    }) as typeof fetch;

    try {
      await expect(
        testAdminLlmSettings("chat", {
          chat: {
            model: "openai/gpt-4.1-mini",
            baseUrl: "https://chat.example.test",
            apiKeyInput: "sk-chat-test-123",
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
        })
      ).rejects.toThrow("对话模型测试超时：5ms 内没有收到响应");
    } finally {
      delete process.env.LLM_SETTINGS_TEST_TIMEOUT_MS;
      globalThis.fetch = originalFetch;
    }
  });
});
