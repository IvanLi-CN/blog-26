import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { contentSearchIndex } from "@/server/services/content-search-index";
import { postEmbeddings, posts } from "../schema";
import { float32ArrayToBlobBuffer } from "./embeddings";
import { enhanced, semantic } from "./search";
import { clearSearchCache, getSearchCacheSize } from "./search-cache";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/search-fallback-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
const originalEnv = {
  embeddingModel: process.env.EMBEDDING_MODEL_NAME,
  rerankerModel: process.env.RERANKER_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  baseUrl: process.env.OPENAI_API_BASE_URL,
};

async function seedPost(
  overrides: Partial<{
    id: string;
    slug: string;
    type: "post" | "memo";
    title: string;
    excerpt: string | null;
    body: string;
    draft: boolean;
    public: boolean;
    vector: [number, number] | null;
    publishDate: number;
    tags: string[];
  }> = {}
) {
  if (!db) throw new Error("Database has not been initialised");
  const now = Date.now();
  const id = overrides.id ?? "semantic-post";
  const slug = overrides.slug ?? id;
  await db.insert(posts).values({
    id,
    slug,
    type: overrides.type ?? "post",
    title: overrides.title ?? "SQLite semantic result",
    excerpt: overrides.excerpt ?? "A semantic search fixture",
    body: overrides.body ?? "SQLite and embeddings",
    publishDate: overrides.publishDate ?? now,
    updateDate: overrides.publishDate ?? now,
    draft: overrides.draft ?? false,
    public: overrides.public ?? true,
    tags: JSON.stringify(overrides.tags ?? ["search"]),
    author: "search-test",
    image: null,
    metadata: null,
    dataSource: "local",
    contentHash: randomUUID(),
  });
  await db.insert(postEmbeddings).values({
    id: `${id}-embedding`,
    postId: id,
    slug,
    type: "post",
    modelName: "test-embedding",
    dim: 2,
    contentHash: "search-test-hash",
    chunkIndex: -1,
    vector: overrides.vector === null ? null : float32ArrayToBlobBuffer(overrides.vector ?? [1, 0]),
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe.skipIf(process.platform !== "linux")("AI search fallback boundaries", () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);

    const sqlite = new Database(TEST_DB_PATH);
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_PATH });
    sqlite.close();
    await initializeDB(true);
    fs.rmSync(`${TEST_DB_PATH}.search`, { recursive: true, force: true });
    await (await contentSearchIndex()).prepare();
  });

  beforeEach(async () => {
    if (!db) throw new Error("Database has not been initialised");
    await db.delete(postEmbeddings);
    await db.delete(posts);
    clearSearchCache();
    delete process.env.EMBEDDING_MODEL_NAME;
    delete process.env.RERANKER_MODEL_NAME;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_BASE_URL;
    console.warn = mock(() => undefined) as unknown as typeof console.warn;
  });

  test("blank semantic queries return without an embedding request", async () => {
    await seedPost();
    const fetchMock = mock(async () => {
      throw new Error("blank query must not call an AI provider");
    });
    globalThis.fetch = Object.assign(fetchMock, { preconnect: originalFetch.preconnect });

    expect(await semantic({ q: "   ", publishedOnly: true })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  afterAll(() => {
    delete process.env.CHAT_COMPLETION_MODEL;
    if (originalEnv.embeddingModel) process.env.EMBEDDING_MODEL_NAME = originalEnv.embeddingModel;
    else delete process.env.EMBEDDING_MODEL_NAME;
    if (originalEnv.rerankerModel) process.env.RERANKER_MODEL_NAME = originalEnv.rerankerModel;
    else delete process.env.RERANKER_MODEL_NAME;
    if (originalEnv.apiKey) process.env.OPENAI_API_KEY = originalEnv.apiKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalEnv.baseUrl) process.env.OPENAI_API_BASE_URL = originalEnv.baseUrl;
    else delete process.env.OPENAI_API_BASE_URL;
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);
  });

  test("exposes clipping identity from stored tags without changing Memo routes", async () => {
    const previousRoot = process.env.LOCAL_CONTENT_BASE_PATH;
    const contentRoot = fs.mkdtempSync(path.join(process.cwd(), "tmp/public-clipping-"));
    process.env.LOCAL_CONTENT_BASE_PATH = contentRoot;
    fs.mkdirSync(path.join(contentRoot, "Memos"));
    fs.writeFileSync(
      path.join(contentRoot, "Memos/clipping-search.md"),
      "---\npublic: true\n---\nSQLite"
    );
    await seedPost({
      id: "Memos/clipping-search.md",
      slug: "clipping-search",
      type: "memo",
      tags: ["剪藏", "search"],
    });
    await seedPost({ id: "ordinary-post", type: "post", tags: ["剪藏"] });
    const results = await semantic({ q: "SQLite" });
    expect(results.find((item) => item.slug === "clipping-search")?.isClipping).toBe(true);
    expect(results.find((item) => item.slug === "clipping-search")?.type).toBe("memo");
    expect(results.find((item) => item.slug === "ordinary-post")?.isClipping).toBeUndefined();
    if (previousRoot === undefined) delete process.env.LOCAL_CONTENT_BASE_PATH;
    else process.env.LOCAL_CONTENT_BASE_PATH = previousRoot;
    fs.rmSync(contentRoot, { recursive: true, force: true });
  });

  test("keeps legacy semantic and keyword fallback current without vectors", async () => {
    if (!db) throw new Error("Database has not been initialised");
    await db.insert(posts).values({
      id: "fts-fallback-post",
      slug: "fts-fallback-post",
      type: "post",
      title: "FTS fallback result",
      excerpt: null,
      body: "SQLite fallback",
      publishDate: Date.now(),
      updateDate: Date.now(),
      draft: false,
      public: true,
      tags: null,
      author: "search-test",
      image: null,
      metadata: null,
      dataSource: "local",
      contentHash: randomUUID(),
    });

    const first = await semantic({ q: "SQLite" });
    await db.update(posts).set({ title: "FTS fallback result updated" });
    const second = await enhanced({ q: "SQLite", rerank: true });

    expect(first.map((result) => result.slug)).toEqual(["fts-fallback-post"]);
    expect(second.map((result) => result.title)).toEqual(["FTS fallback result updated"]);
  });

  test("uses FTS when the selected model only has failed vector rows", async () => {
    await seedPost({
      id: "failed-embedding-post",
      title: "FTS after embedding failure",
      vector: null,
    });
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";

    let embeddingCalls = 0;
    globalThis.fetch = mock(async () => {
      embeddingCalls += 1;
      return Response.json({ data: [{ embedding: [1, 0] }] });
    }) as unknown as typeof fetch;

    const result = await semantic({ q: "SQLite" });

    expect(result.map((entry) => entry.slug)).toEqual(["failed-embedding-post"]);
    expect(embeddingCalls).toBe(0);
    expect(getSearchCacheSize()).toBe(0);
  });

  test("uses FTS when vectors do not cover the requested type", async () => {
    await seedPost({
      id: "type-scoped-post",
      body: "type scoped fallback",
      vector: null,
    });
    await seedPost({
      id: "type-scoped-memo",
      type: "memo",
      body: "type scoped fallback",
      vector: [1, 0],
    });
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";

    let embeddingCalls = 0;
    globalThis.fetch = mock(async () => {
      embeddingCalls += 1;
      return Response.json({ data: [{ embedding: [1, 0] }] });
    }) as unknown as typeof fetch;

    const result = await semantic({ q: "type scoped fallback", type: "post" });

    expect(result.map((entry) => entry.slug)).toEqual(["type-scoped-post"]);
    expect(embeddingCalls).toBe(0);
  });

  test("uses FTS when vectors only cover private rows for public search", async () => {
    await seedPost({
      id: "visibility-scoped-private",
      body: "visibility scoped fallback",
      draft: true,
      public: false,
      vector: [1, 0],
    });
    await seedPost({
      id: "visibility-scoped-public",
      body: "visibility scoped fallback",
      vector: null,
    });
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";

    let embeddingCalls = 0;
    globalThis.fetch = mock(async () => {
      embeddingCalls += 1;
      return Response.json({ data: [{ embedding: [1, 0] }] });
    }) as unknown as typeof fetch;

    const result = await semantic({ q: "visibility scoped fallback" });

    expect(result.map((entry) => entry.slug)).toEqual(["visibility-scoped-public"]);
    expect(embeddingCalls).toBe(0);
  });

  test("uses FTS when a stored vector is corrupt", async () => {
    await seedPost({ id: "corrupt-vector-post", body: "SQLite corrupt vector fallback" });
    await db?.update(postEmbeddings).set({ vector: Buffer.from([1, 2, 3]) });
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";

    globalThis.fetch = mock(async () =>
      Response.json({ data: [{ embedding: [1, 0] }] })
    ) as unknown as typeof fetch;

    const result = await semantic({ q: "SQLite" });

    expect(result.map((entry) => entry.slug)).toEqual(["corrupt-vector-post"]);
    expect(getSearchCacheSize()).toBe(0);
  });

  test("orders semantic ties by publish date and id", async () => {
    await seedPost({
      id: "semantic-tie-older-a",
      slug: "semantic-tie-older-a",
      publishDate: 100,
    });
    await seedPost({
      id: "semantic-tie-older-b",
      slug: "semantic-tie-older-b",
      publishDate: 100,
    });
    await seedPost({
      id: "semantic-tie-newer",
      slug: "semantic-tie-newer",
      publishDate: 200,
    });
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";
    globalThis.fetch = mock(async () =>
      Response.json({ data: [{ embedding: [1, 0] }] })
    ) as unknown as typeof fetch;

    const result = await semantic({ q: "SQLite", topK: 10 });

    expect(result.map((entry) => entry.slug)).toEqual([
      "semantic-tie-newer",
      "semantic-tie-older-b",
      "semantic-tie-older-a",
    ]);
  });

  test("semantic limits count unique routes and preserve independent content types", async () => {
    await seedPost({ id: "newer-duplicate", slug: "shared", publishDate: 300 });
    await seedPost({ id: "older-duplicate", slug: "shared", publishDate: 200 });
    await seedPost({ id: "independent", slug: "other", publishDate: 100 });
    await seedPost({ id: "memo-shared", slug: "shared", type: "memo", publishDate: 50 });
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";
    globalThis.fetch = mock(async () =>
      Response.json({ data: [{ embedding: [1, 0] }] })
    ) as unknown as typeof fetch;
    const result = await semantic({ q: "SQLite", topK: 3 });
    expect(result.map((entry) => [entry.type, entry.slug])).toEqual([
      ["post", "shared"],
      ["post", "other"],
      ["memo", "shared"],
    ]);
  });

  test("enhanced uses original keyword fallback when current RAG quality is not validated", async () => {
    await seedPost();
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.CHAT_COMPLETION_MODEL = "test-chat";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";
    const fetcher = mock(async () => {
      throw new Error("No AI request expected");
    });
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const result = await enhanced({ q: "SQLite", topK: 5, rerank: true });
    expect(result.map((item) => item.slug)).toEqual(["semantic-post"]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("rerank false ignores reranker overrides and retains semantic search", async () => {
    await seedPost();
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";
    const fetcher = mock(async () => Response.json({ data: [{ embedding: [1, 0] }] }));
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const result = await enhanced({
      q: "SQLite",
      rerank: false,
      rerankerModel: "legacy-inert",
      rerankTopK: 1,
    });
    expect(result.map((item) => item.slug)).toEqual(["semantic-post"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const legacyOverride = await enhanced({
      q: "SQLite",
      rerank: true,
      rerankerModel: "unsupported",
    });
    expect(legacyOverride.map((item) => item.slug)).toEqual(["semantic-post"]);
  });

  test("enhanced preserves the explicit legacy reranker model override", async () => {
    await seedPost();
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.RERANKER_MODEL_NAME = "configured-reranker";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";
    let requestedReranker = "";
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/rerank")) {
        requestedReranker = JSON.parse(String(init?.body)).model;
        return Response.json({ results: [{ index: 0, relevance_score: 0.9 }] });
      }
      return Response.json({ data: [{ embedding: [1, 0] }] });
    }) as unknown as typeof fetch;

    const result = await enhanced({
      q: "SQLite",
      topK: 5,
      rerank: true,
      rerankerModel: "legacy-reranker-override",
    });

    expect(requestedReranker).toBe("legacy-reranker-override");
    expect(result.map((item) => item.slug)).toEqual(["semantic-post"]);
  });

  test("routes valid and invalid advanced syntax through FTS with vectors available", async () => {
    await seedPost();
    await seedPost({
      id: "body-only-post",
      title: "Guide result",
      body: "SQLite appears in the body",
      vector: [0, 1],
    });
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";

    let embeddingCalls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/embeddings")) embeddingCalls += 1;
      return Response.json({ data: [{ embedding: [1, 0] }] });
    }) as unknown as typeof fetch;

    const valid = await semantic({ q: "title:SQLite", topK: 10 });
    const invalid = await semantic({ q: '"SQLite', topK: 10 });

    expect(valid.map((result) => result.slug)).toEqual(["semantic-post"]);
    expect(invalid.map((result) => result.slug)).toEqual(["semantic-post", "body-only-post"]);
    expect(embeddingCalls).toBe(0);
    expect(getSearchCacheSize()).toBe(0);
  });
});
