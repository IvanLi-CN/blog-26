import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { postEmbeddings, posts } from "../schema";
import { float32ArrayToBlobBuffer } from "./embeddings";
import { enhanced, semantic } from "./search";
import { clearSearchCache, getSearchCacheSize } from "./search-cache";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/search-fallback-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

const originalFetch = globalThis.fetch;
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
    title: string;
    excerpt: string | null;
    body: string;
    vector: [number, number] | null;
    publishDate: number;
  }> = {}
) {
  if (!db) throw new Error("Database has not been initialised");
  const now = Date.now();
  const id = overrides.id ?? "semantic-post";
  const slug = overrides.slug ?? id;
  await db.insert(posts).values({
    id,
    slug,
    type: "post",
    title: overrides.title ?? "SQLite semantic result",
    excerpt: overrides.excerpt ?? "A semantic search fixture",
    body: overrides.body ?? "SQLite and embeddings",
    publishDate: overrides.publishDate ?? now,
    updateDate: overrides.publishDate ?? now,
    draft: false,
    public: true,
    tags: JSON.stringify(["search"]),
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

describe("AI search fallback boundaries", () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);

    const sqlite = new Database(TEST_DB_PATH);
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_PATH });
    sqlite.close();
    await initializeDB(true);
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
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
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

  test("uses uncached FTS for semantic and enhanced requests without vectors", async () => {
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

  test("returns the semantic base when reranking fails", async () => {
    await seedPost();
    process.env.EMBEDDING_MODEL_NAME = "test-embedding";
    process.env.RERANKER_MODEL_NAME = "test-reranker";
    process.env.OPENAI_API_KEY = "search-test-key";
    process.env.OPENAI_API_BASE_URL = "https://search.example.test";

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/embeddings")) {
        return Response.json({ data: [{ embedding: [1, 0] }] });
      }
      return new Response("rerank unavailable", { status: 503 });
    }) as unknown as typeof fetch;

    const base = await semantic({ q: "SQLite", topK: 5 });
    const result = await enhanced({ q: "SQLite", topK: 5, rerank: true });

    expect(result).toEqual(base);
    expect(result[0]?.final).toBeUndefined();
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
