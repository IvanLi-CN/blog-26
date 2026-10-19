import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { projectionDigest } from "@/lib/ai/embedding-target";
import { buildEmbeddingInput, hashEmbeddingInput } from "@/lib/ai/embeddings";
import { enhanced } from "@/lib/ai/search";
import { clearSearchCache } from "@/lib/ai/search-cache";
import { db, initializeDB } from "@/lib/db";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import {
  llmSettings,
  postEmbeddings,
  posts,
  ragIndexConfigs,
  ragIndexTargets,
  searchIndexState,
  searchSemanticEmbeddings,
  searchSettings,
} from "@/lib/schema";
import { searchContent } from "@/lib/search/content-search";
import { DEFAULT_SEARCH_POLICY } from "@/lib/search/settings";
import { handleMcpHttpRequest } from "@/server/mcp-http";
import { handlePublicApiRequest } from "@/server/public-api/router";
import { appRouter } from "@/server/router";
import { makePublicBundle } from "../../../tests/lib/playbook-fixture";
import { executeContentModes } from "./content-search";
import { contentSearchIndex } from "./content-search-index";
import { updateAdminLlmSettings } from "./llm-settings";
import { ragCatalog } from "./rag-index";
import {
  getAdminSearchSettings,
  readSearchSettings,
  recordSearchQuality,
  resolveSearchPolicy,
  saveSearchPolicy,
} from "./search-policy";
import { preparePlaybookSemanticProjection } from "./search-semantic-projection";
import { getSearchValidationRun, startSearchValidation } from "./search-validation";

const originalFetch = globalThis.fetch;
const envNames = [
  "DB_PATH",
  "SEARCH_INDEX_PATH",
  "OPENAI_API_KEY",
  "OPENAI_API_BASE_URL",
  "CHAT_COMPLETION_MODEL",
  "EMBEDDING_MODEL_NAME",
  "LOCAL_CONTENT_BASE_PATH",
  "PLAYBOOK_CACHE_DIR",
  "LLM_SETTINGS_MASTER_KEY",
] as const;
const oldEnv = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
let directory: string;
function fixture(id: string, body: string, overrides: Partial<typeof posts.$inferInsert> = {}) {
  return {
    id,
    slug: id,
    type: "post",
    title: id,
    body,
    publishDate: 1,
    updateDate: 1,
    draft: false,
    public: true,
    dataSource: "local",
    contentHash: id,
    ...overrides,
  };
}
function fakeFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): typeof fetch {
  return Object.assign(mock(handler), { preconnect: originalFetch.preconnect });
}

function waitWithAbort(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function readSseText(response: Response, firstChunk?: (text: string) => void) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing SSE body");
  const decoder = new TextDecoder();
  let output = "";
  let first = true;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const text = decoder.decode(part.value, { stream: true });
      output += text;
      if (first) {
        first = false;
        firstChunk?.(text);
      }
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
async function seedVerifiedBlog(postId: string) {
  const catalog = await ragCatalog({ source: "blog" });
  const blob = Buffer.from(new Float32Array([1, 0]).buffer);
  await db
    .insert(ragIndexConfigs)
    .values({ fingerprint: catalog.identity.fingerprint, dim: 2, updatedAt: 1 })
    .onConflictDoNothing();
  for (const target of catalog.targets.filter((row) => row.parentId === postId)) {
    const id = `verified-${target.id}`;
    await db
      .insert(postEmbeddings)
      .values({
        id,
        postId,
        slug: target.slug,
        type: target.type,
        modelName: target.model,
        dim: 2,
        contentHash: target.documentHash,
        chunkIndex: target.chunkIndex,
        vector: blob,
        createdAt: 1,
        updatedAt: 1,
      })
      .onConflictDoNothing();
    await db
      .insert(ragIndexTargets)
      .values({
        id: target.id,
        source: "blog",
        parentId: postId,
        status: "ready",
        vectorId: id,
        vectorDigest: projectionDigest(Array.from(blob)),
        dim: 2,
        updatedAt: 1,
      })
      .onConflictDoUpdate({
        target: ragIndexTargets.id,
        set: {
          status: "ready",
          vectorId: id,
          vectorDigest: projectionDigest(Array.from(blob)),
          dim: 2,
          updatedAt: 1,
        },
      });
  }
}
async function enable(mode: "rag" | "rewrite") {
  const resolved = await resolveSearchPolicy(mode);
  if (!resolved.fingerprint) throw new Error("test policy must be configured");
  expect(await recordSearchQuality(mode, resolved.fingerprint, true)).toBe(true);
}

describe.skipIf(process.platform !== "linux")("content modes with persistent Tantivy", () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(os.tmpdir(), "blog-search-modes-"));
    process.env.DB_PATH = path.join(directory, "content.sqlite");
    process.env.SEARCH_INDEX_PATH = path.join(directory, "index");
    const sqlite = new Database(process.env.DB_PATH);
    migrate(drizzle(sqlite), { migrationsFolder: path.resolve("drizzle") });
    sqlite.close();
    await initializeDB(true);
    await (await contentSearchIndex()).prepare();
  });
  beforeEach(async () => {
    clearSearchCache();
    await db.delete(postEmbeddings);
    await db.delete(ragIndexTargets);
    await db.delete(ragIndexConfigs);
    await db.delete(llmSettings);
    await db.delete(posts);
    await db.delete(searchSettings);
    await saveSearchPolicy(structuredClone(DEFAULT_SEARCH_POLICY));
    process.env.OPENAI_API_KEY = "synthetic-test-key";
    process.env.OPENAI_API_BASE_URL = "https://synthetic-search.example.test";
    process.env.CHAT_COMPLETION_MODEL = `synthetic-chat-${Date.now()}`;
    process.env.EMBEDDING_MODEL_NAME = "synthetic-embedding";
    process.env.LLM_SETTINGS_MASTER_KEY = "synthetic-search-master-key";
    process.env.LOCAL_CONTENT_BASE_PATH = path.join(directory, "local");
    globalThis.fetch = fakeFetch(async () => {
      throw new Error("Unexpected AI request");
    });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  afterAll(() => {
    for (const key of envNames)
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    rmSync(directory, { recursive: true, force: true });
  });

  test("protects exact names before result truncation and excludes private rows", async () => {
    await db
      .insert(posts)
      .values([
        fixture("real", "Arch Linux 中文Arch中文"),
        fixture("false", "archive search aarch64 ArchLinux arch_linux"),
        fixture("private", "Arch", { public: false }),
        fixture("draft", "Arch", { draft: true }),
      ]);
    const result = await executeContentModes({ q: "Arch", mode: "keyword", topK: 1 });
    expect(result.results.map((item) => item.slug)).toEqual(["real"]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  test("shares one native writer with a separately bundled SSR module", async () => {
    await db.insert(posts).values(fixture("bundled", "SQLite"));
    const entrypoint = path.join(directory, "search-ssr-entry.ts");
    writeFileSync(
      entrypoint,
      `export { contentSearchIndex } from ${JSON.stringify(path.resolve("src/server/services/content-search-index.ts"))};`
    );
    const build = await Bun.build({
      entrypoints: [entrypoint],
      target: "bun",
      outdir: path.join(directory, "ssr-bundle"),
    });
    expect(build.success).toBe(true);
    const bundled = await import(build.outputs[0].path);
    const original = await contentSearchIndex();
    const ssrIndex = await bundled.contentSearchIndex();
    expect(ssrIndex).toBe(original);
    expect(
      (await ssrIndex.search("SQLite", { limit: 20, publishedOnly: true })).map(
        (item: { row: { slug: string } }) => item.row.slug
      )
    ).toEqual(["bundled"]);
  });
  test("uses literal Node with definite aliases and keeps ambiguous graph nodes", async () => {
    await db
      .insert(posts)
      .values([
        fixture("graph", "Graph node"),
        fixture("runtime", "Node.js JavaScript"),
        fixture("alias", "NodeJS JavaScript"),
      ]);
    expect(
      (await executeContentModes({ q: "Node", mode: "keyword" })).results.map((x) => x.slug).sort()
    ).toEqual(["alias", "graph", "runtime"]);
    expect(
      (await executeContentModes({ q: "NodeJS", mode: "keyword" })).results
        .map((x) => x.slug)
        .sort()
    ).toEqual(["alias", "runtime"]);
  });
  test("normalizes queries while preserving full-width and accented document spelling", async () => {
    await db
      .insert(posts)
      .values([
        fixture("ascii", "Arch"),
        fixture("fullwidth", "Ａｒｃｈ"),
        fixture("accented", "İ"),
      ]);
    for (const q of ["Arch", "Ａｒｃｈ"]) {
      expect(
        (await executeContentModes({ q, mode: "keyword" })).results.map((item) => item.slug)
      ).toEqual(["ascii"]);
    }
    expect((await executeContentModes({ q: "i", mode: "keyword" })).results).toEqual([]);
  });
  test("rolls back both content and transactional outbox", async () => {
    const index = await contentSearchIndex();
    const before = (await index.status()).watermark;
    expect(() =>
      db.transaction((tx) => {
        tx.insert(posts).values(fixture("rollback", "SQLite")).run();
        throw new Error("rollback");
      })
    ).toThrow("rollback");
    expect((await index.status()).watermark).toBe(before);
    expect((await executeContentModes({ q: "SQLite", mode: "keyword" })).results).toEqual([]);
  });
  test("replays commits idempotently when SQLite checkpoint trails durable index", async () => {
    await db.insert(posts).values(fixture("durable", "SQLite"));
    const index = await contentSearchIndex();
    await index.synchronize();
    await db
      .update(searchIndexState)
      .set({ checkpoint: 0 })
      .where(eq(searchIndexState.id, "content"));
    await index.synchronize();
    expect(await index.check()).toMatchObject({ ok: true, duplicates: 0, expected: 1, indexed: 1 });
    await db.update(posts).set({ body: "PostgreSQL" }).where(eq(posts.id, "durable"));
    expect((await executeContentModes({ q: "SQLite", mode: "keyword" })).results).toEqual([]);
    await db.delete(posts);
    expect(await index.check()).toMatchObject({ ok: true, expected: 0, indexed: 0 });
  });
  test("atomically rebuilds a generation and detects missing projection state", async () => {
    const index = await contentSearchIndex();
    const old = (await index.status()).state?.generation;
    await db.insert(posts).values(fixture("backfill", "SQLite"));
    await index.prepare(true);
    expect((await index.status()).state?.generation).not.toBe(old);
    expect(await index.check()).toMatchObject({ ok: true });
    await db.delete(searchIndexState);
    await expect(executeContentModes({ q: "SQLite", mode: "keyword" })).rejects.toThrow(
      "prepare-required"
    );
    await index.prepare();
  });
  test("configured AI uses the existing provider before falling back", async () => {
    await db.insert(posts).values(fixture("literal", "SQLite"));
    await updateAdminLlmSettings({
      chat: {
        model: "persisted-chat-model",
        baseUrl: "https://persisted-search.example.test",
        apiKeyInput: "persisted-search-key",
      },
      embedding: {
        model: "persisted-embedding-model",
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
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_BASE_URL;
    delete process.env.CHAT_COMPLETION_MODEL;
    delete process.env.EMBEDDING_MODEL_NAME;
    const resolved = await resolveSearchPolicy("rag");
    expect(resolved.reason).toBeUndefined();
    expect(resolved.qualityStatus).toBe("not-run");
    expect(resolved.chat).toMatchObject({
      model: "persisted-chat-model",
      baseUrl: "https://persisted-search.example.test/v1",
      apiKey: "persisted-search-key",
    });
    expect(resolved.resolved?.embedding).toMatchObject({
      model: "persisted-embedding-model",
      baseUrl: "https://persisted-search.example.test/v1",
      apiKey: "persisted-search-key",
    });
    expect((await getAdminSearchSettings()).status.rag).toMatchObject({
      available: true,
      qualityStatus: "not-run",
    });
    globalThis.fetch = fakeFetch(async () => new Response("unavailable", { status: 503 }));
    const result = await executeContentModes({ q: "SQLite", mode: "rag" });
    expect(result).toMatchObject({
      requestedMode: "rag",
      effectiveMode: "keyword",
      reason: "unavailable",
    });
    expect((await executeContentModes({ q: "body:SQLite", mode: "rewrite" })).reason).toBe(
      "explicit-query"
    );
    expect(globalThis.fetch).toHaveBeenCalled();
    await db
      .insert(posts)
      .values([
        fixture("near-adjacent", "SQLite database"),
        fixture("near-separated", "SQLite has an unrelated database"),
      ]);
    const query = "NEAR(SQLite database, 3)";
    const expected = await searchContent({ q: query, topK: 10 });
    const near = await executeContentModes({ q: query, mode: "rag", topK: 10 });
    expect(near.effectiveMode).toBe("keyword");
    expect(near.reason).toBe("explicit-query");
    expect(near.results.map((item) => item.slug)).toEqual(expected.map((item) => item.slug));
  });
  for (const q of ["body:SQLite", "NEAR(SQLite database, 3)"]) {
    test(`RAG explicit fallback reports selected coverage for ${q}`, async () => {
      await db.insert(posts).values(fixture("fallback-coverage", "SQLite database"));
      const input = {
        q,
        mode: "rag" as const,
        source: "blog" as const,
        type: "post" as const,
        topK: 1,
      };
      const incomplete = await executeContentModes(input);
      expect(incomplete).toMatchObject({
        requestedMode: "rag",
        effectiveMode: "keyword",
        reason: "explicit-query",
        ragIncompleteSources: ["blog"],
      });
      expect(incomplete.results.map((row) => row.slug)).toEqual(["fallback-coverage"]);
      const response = await handlePublicApiRequest(
        new Request(
          `http://localhost/api/public/search?${new URLSearchParams({ q, mode: "rag", source: "blog", type: "post", topK: "1" })}`
        ),
        "/search"
      );
      expect(response?.headers.get("Search-RAG-Incomplete-Sources")).toBe("blog");
      await seedVerifiedBlog("fallback-coverage");
      expect((await executeContentModes(input)).ragIncompleteSources).toBeUndefined();
      expect(
        (await executeContentModes({ ...input, mode: "keyword" })).ragIncompleteSources
      ).toBeUndefined();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  }
  test("NEAR budget overflow is an error rather than a successful empty list", async () => {
    await expect(
      executeContentModes({
        q: `NEAR(alpha beta,3) ${Array.from({ length: 140 }, (_, i) => `term${i}`).join(" ")}`,
        mode: "keyword",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "query-budget-exceeded" });
  });
  test("legacy enhanced authorizes exact memo identity before reranking and on cache hits", async () => {
    const privateId = "Memos/private-enhanced.md";
    const file = path.join(process.env.LOCAL_CONTENT_BASE_PATH ?? "", privateId);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "---\npublic: false\n---\nprivate marker");
    const privateRow = fixture(privateId, "private marker", {
      slug: "shared-enhanced",
      type: "memo",
      tags: JSON.stringify(["剪藏"]),
      metadata: JSON.stringify({ authoredClipping: true }),
      excerpt: "private marker",
      title: "Private marker",
    });
    const publicRow = fixture("Memos/public-enhanced.md", "public marker", {
      slug: "shared-enhanced",
      type: "memo",
      excerpt: "public marker",
      title: "Public marker",
    });
    await db.insert(posts).values([privateRow, publicRow]);
    for (const row of [privateRow, publicRow])
      await db.insert(postEmbeddings).values({
        id: `${row.id}-vector`,
        postId: row.id,
        slug: row.slug,
        type: "memo",
        modelName: "synthetic-embedding",
        dim: 2,
        contentHash: "synthetic",
        vector: Buffer.from(new Float32Array([1, 0]).buffer),
        createdAt: 1,
        updatedAt: 1,
      });
    const rerankDocuments: string[][] = [];
    globalThis.fetch = fakeFetch(async (url, init) => {
      if (String(url).endsWith("/rerank")) {
        rerankDocuments.push(JSON.parse(String(init?.body)).documents);
        return Response.json({ results: [{ index: 0, relevance_score: 0.9 }] });
      }
      return Response.json({ data: [{ embedding: [1, 0] }] });
    });
    for (const options of [{ rerank: false }, { rerankerModel: "synthetic-reranker" }]) {
      const result = await enhanced({ q: "marker", publishedOnly: true, ...options });
      expect(result.map((row) => row.title)).toEqual(["Public marker"]);
      expect(JSON.stringify(result)).not.toContain("private marker");
      expect(Object.keys(result[0] ?? {})).not.toContain("id");
    }
    expect(rerankDocuments).toHaveLength(1);
    expect(rerankDocuments[0]).toEqual(["Public marker\n\npublic marker"]);
    // Force the private row to win semantic deduplication before authorization.
    await db.update(posts).set({ publishDate: 2 }).where(eq(posts.id, privateId));
    clearSearchCache();
    for (const options of [{ rerank: false }, { rerankerModel: "synthetic-reranker" }]) {
      expect(await enhanced({ q: "marker", publishedOnly: true, ...options })).toEqual([]);
    }
    expect(rerankDocuments).toHaveLength(1);
    // A public candidate withdrawn while the reranker is running cannot escape.
    await db.update(posts).set({ publishDate: 0 }).where(eq(posts.id, privateId));
    clearSearchCache();
    globalThis.fetch = fakeFetch(async (url) => {
      if (String(url).endsWith("/rerank")) {
        await db.update(posts).set({ public: false }).where(eq(posts.id, publicRow.id));
        return Response.json({ results: [{ index: 0, relevance_score: 0.9 }] });
      }
      return Response.json({ data: [{ embedding: [1, 0] }] });
    });
    expect(
      await enhanced({ q: "marker", publishedOnly: true, rerankerModel: "synthetic-reranker" })
    ).toEqual([]);
  });
  test("rewrite sends only query policy, never site content or embeddings", async () => {
    await db
      .insert(posts)
      .values([fixture("original", "嵌入式数据库"), fixture("supplement", "SQLite3 SQL engine")]);
    await enable("rewrite");
    const requests: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = fakeFetch(async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({
        choices: [
          { finish_reason: "stop", message: { content: JSON.stringify({ queries: ["SQLite3"] }) } },
        ],
      });
    });
    const result = await executeContentModes({ q: "嵌入式数据库", mode: "rewrite" });
    expect(result.effectiveMode).toBe("rewrite");
    expect(result.results.map((x) => x.slug).sort()).toEqual(["original", "supplement"]);
    expect(requests).toHaveLength(1);
    expect(requests[0].url.endsWith("/chat/completions")).toBe(true);
    expect(JSON.stringify(requests[0].body)).not.toContain("SQLite3 SQL engine");
    expect(JSON.stringify(requests[0].body)).not.toContain("candidates");
  });
  test("failed rewriting returns original query, without querying failed reformulation", async () => {
    await db
      .insert(posts)
      .values([fixture("original", "originalquery"), fixture("other", "otherquery")]);
    await enable("rewrite");
    globalThis.fetch = fakeFetch(async () => new Response("unavailable", { status: 503 }));
    const result = await executeContentModes({ q: "originalquery", mode: "rewrite" });
    expect(result).toMatchObject({ effectiveMode: "keyword", reason: "unavailable" });
    expect(result.results.map((x) => x.slug)).toEqual(["original"]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  test("RAG can reject Node graph supplements without deleting keyword matches", async () => {
    await db
      .insert(posts)
      .values([
        fixture("keyword", "NodeJS JavaScript runtime"),
        fixture("runtime", "Node JavaScript runtime"),
        fixture("graph", "Graph node is a vertex"),
      ]);
    await enable("rag");
    globalThis.fetch = fakeFetch(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const payload = JSON.parse(body.messages[1].content);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: payload.candidates.map((candidate: { id: string; content: string }) => ({
                  id: candidate.id,
                  relevant: candidate.id === "runtime",
                  rank: candidate.id === "runtime" ? 0 : 100,
                  evidence: candidate.content,
                })),
              }),
            },
          },
        ],
      });
    });
    const result = await executeContentModes({ q: "NodeJS", mode: "rag" });
    expect(result.effectiveMode).toBe("rag");
    expect(result.results.map((x) => x.slug)).toEqual(["runtime", "keyword"]);
  });
  test("RAG retrieves vectors and rejects invented result IDs with original-query fallback", async () => {
    await db
      .insert(posts)
      .values([fixture("exact", "SQLite"), fixture("concept", "SQLite3 engine")]);
    await db.insert(postEmbeddings).values({
      id: "concept-vector",
      postId: "concept",
      slug: "concept",
      type: "post",
      modelName: "synthetic-embedding",
      dim: 2,
      contentHash: hashEmbeddingInput(buildEmbeddingInput(fixture("concept", "SQLite3 engine"))),
      vector: Buffer.from(new Float32Array([1, 0]).buffer),
      createdAt: 1,
      updatedAt: 1,
    });
    await seedVerifiedBlog("concept");
    await enable("rag");
    const urls: string[] = [];
    globalThis.fetch = fakeFetch(async (url) => {
      urls.push(String(url));
      if (String(url).endsWith("/embeddings"))
        return Response.json({ data: [{ embedding: [1, 0] }] });
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"items":[{"id":"invented","relevant":true,"rank":0}]}' },
          },
        ],
      });
    });
    const result = await executeContentModes({ q: "SQLite", mode: "rag" });
    expect(result).toMatchObject({ effectiveMode: "keyword", reason: "invalid-output" });
    expect(result.results.map((x) => x.slug)).toEqual(["exact"]);
    expect(urls.some((url) => url.endsWith("/embeddings"))).toBe(true);
  });
  test("keeps the entire engine-selected keyword capacity despite model rejection", async () => {
    await db
      .insert(posts)
      .values(Array.from({ length: 5 }, (_, i) => fixture(`exact-${i}`, "SQLite")));
    await enable("rag");
    globalThis.fetch = fakeFetch(async (_url, init) => {
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: payload.candidates.map((x: { id: string }) => ({
                  id: x.id,
                  relevant: false,
                  rank: 100,
                })),
              }),
            },
          },
        ],
      });
    });
    const expected = (await executeContentModes({ q: "SQLite", mode: "keyword", topK: 3 })).results
      .map((x) => x.slug)
      .sort();
    expect(
      (await executeContentModes({ q: "SQLite", mode: "rag", topK: 3 })).results
        .map((x) => x.slug)
        .sort()
    ).toEqual(expected);
  });
  test("keeps RAG enabled when the candidate context exceeds the token count in UTF-8 bytes", async () => {
    await db
      .insert(posts)
      .values(Array.from({ length: 10 }, (_, i) => fixture(`long-${i}`, "发布".repeat(2048))));
    await enable("rag");
    let chatCalls = 0;
    globalThis.fetch = fakeFetch(async (_url, init) => {
      chatCalls += 1;
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: payload.candidates.map((candidate: { id: string; title: string }) => ({
                  id: candidate.id,
                  relevant: true,
                  rank: 0,
                  evidence: candidate.title,
                })),
              }),
            },
          },
        ],
      });
    });

    const result = await executeContentModes({ q: "发布", mode: "rag", topK: 10 });

    expect(result.effectiveMode).toBe("rag");
    expect(result.results).toHaveLength(10);
    expect(chatCalls).toBe(1);
  });
  test("only fresh embedding-input hashes supply RAG context, including late body evidence", async () => {
    const concept = fixture("concept", `${"Introduction. ".repeat(500)}SQLite3 embedded database`);
    await db.insert(posts).values([concept, fixture("stale", "Unrelated old content")]);
    for (const id of ["concept", "stale"])
      await db.insert(postEmbeddings).values({
        id: `${id}-vector`,
        postId: id,
        slug: id,
        type: "post",
        modelName: "synthetic-embedding",
        dim: 2,
        contentHash:
          id === "concept" ? hashEmbeddingInput(buildEmbeddingInput(concept)) : "stale-input-hash",
        vector: Buffer.from(new Float32Array([1, 0]).buffer),
        createdAt: 1,
        updatedAt: 1,
      });
    await seedVerifiedBlog("concept");
    await enable("rag");
    globalThis.fetch = fakeFetch(async (url, init) => {
      if (String(url).endsWith("/embeddings"))
        return Response.json({ data: [{ embedding: [1, 0] }] });
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      expect(payload.candidates.map((item: { id: string }) => item.id)).toEqual(["concept"]);
      expect(payload.candidates[0].content).toContain("SQLite3 embedded database");
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: [
                  { id: "concept", relevant: true, rank: 0, evidence: "SQLite3 embedded database" },
                ],
              }),
            },
          },
        ],
      });
    });
    const result = await executeContentModes({ q: "SQLite", mode: "rag" });
    expect(result.effectiveMode).toBe("rag");
    expect(result.results.map((item) => item.slug)).toEqual(["concept"]);
  });
  test("a relevance judgment without an original quotation falls back to original keywords", async () => {
    await db.insert(posts).values(fixture("exact", "SQLite"));
    await enable("rag");
    globalThis.fetch = fakeFetch(async () =>
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: [{ id: "exact", relevant: true, rank: 0, evidence: "Invented quotation" }],
              }),
            },
          },
        ],
      })
    );
    const result = await executeContentModes({ q: "SQLite", mode: "rag" });
    expect(result).toMatchObject({ effectiveMode: "keyword", reason: "invalid-output" });
    expect(result.results.map((item) => item.slug)).toEqual(["exact"]);
  });
  test("RAG ties use content time and identity rather than incomparable retrieval scores", async () => {
    const exact = fixture("exact", "SQLite", { title: "SQLite SQLite", publishDate: 1 });
    const concept = fixture("concept", "SQLite3 embedded database", { publishDate: 2 });
    await db.insert(posts).values([exact, concept]);
    await db.insert(postEmbeddings).values({
      id: "concept-vector",
      postId: concept.id,
      slug: concept.slug,
      type: "post",
      modelName: "synthetic-embedding",
      dim: 2,
      contentHash: hashEmbeddingInput(buildEmbeddingInput(concept)),
      vector: Buffer.from(new Float32Array([1, 0]).buffer),
      createdAt: 1,
      updatedAt: 1,
    });
    await seedVerifiedBlog("concept");
    await enable("rag");
    globalThis.fetch = fakeFetch(async (url, init) => {
      if (String(url).endsWith("/embeddings"))
        return Response.json({ data: [{ embedding: [1, 0] }] });
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: payload.candidates.map((item: { id: string; title: string }) => ({
                  id: item.id,
                  relevant: true,
                  rank: 0,
                  evidence: item.title,
                })),
              }),
            },
          },
        ],
      });
    });
    const result = await executeContentModes({ q: "SQLite", mode: "rag" });
    expect(result.effectiveMode).toBe("rag");
    expect(result.results.map((item) => item.slug)).toEqual(["concept", "exact"]);
  });
  test("quality validation rejects topic and passing-mention ties regardless of input order", async () => {
    globalThis.fetch = fakeFetch(async (url, init) => {
      const request = JSON.parse(String(init?.body));
      if (String(url).endsWith("/embeddings"))
        return Response.json({
          data: [{ embedding: request.input.startsWith("Plant") ? [0, 1] : [1, 0] }],
        });
      const payload = JSON.parse(request.messages[1].content);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: payload.candidates.map((item: { id: string; content: string }) => ({
                  id: item.id,
                  relevant: item.id !== "random",
                  rank: item.id === "random" ? 100 : 0,
                  ...(item.id !== "random" ? { evidence: item.content } : {}),
                })),
              }),
            },
          },
        ],
      });
    });
    const run = await startSearchValidation("rag");
    while (run.status === "running") await Bun.sleep(5);
    expect(run.status).toBe("failed");
    expect(run.completed).toBe(0);
    expect((await resolveSearchPolicy("rag")).reason).toBeUndefined();
    expect((await resolveSearchPolicy("rag")).qualityStatus).toBe("failed");
  });
  test("policy changes invalidate only the changed mode and reject stale quality grants", async () => {
    await enable("rag");
    await enable("rewrite");
    const old = await resolveSearchPolicy("rag");
    const policy = (await readSearchSettings()).policy;
    policy.rag.timeoutMs++;
    await saveSearchPolicy(policy);
    expect((await resolveSearchPolicy("rag")).reason).toBeUndefined();
    expect((await resolveSearchPolicy("rag")).qualityStatus).toBe("not-run");
    expect((await resolveSearchPolicy("rewrite")).reason).toBeUndefined();
    expect(await recordSearchQuality("rag", old.fingerprint ?? "", true)).toBe(false);
  });
  test.each([
    { name: "SQLite-only concept expansion", node: ["NodeJS"], sql: ["SQLite"], completed: 1 },
    {
      name: "generic JavaScript expansion",
      node: ["NodeJS", "JavaScript"],
      sql: ["SQLite3"],
      completed: 0,
    },
  ])("rewrite quality rejects $name using actual retrieval", async ({ node, sql, completed }) => {
    globalThis.fetch = fakeFetch(async (_url, init) => {
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      expect(Object.keys(payload)).toEqual(["query"]);
      const queries = payload.query === "NodeJS" ? node : sql;
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ queries }) } }],
      });
    });
    const run = await startSearchValidation("rewrite");
    while (run.status === "running") await Bun.sleep(5);
    expect(run.status).toBe("failed");
    expect(run.completed).toBe(completed);
    expect(run.reason).toBe("invalid-output");
    expect((await resolveSearchPolicy("rewrite")).reason).toBeUndefined();
    expect((await resolveSearchPolicy("rewrite")).qualityStatus).toBe("failed");
  });
  test("rewrite quality proves positive and negative retrieval without sending documents", async () => {
    const requests: string[] = [];
    globalThis.fetch = fakeFetch(async (url, init) => {
      expect(String(url).endsWith("/chat/completions")).toBe(true);
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      expect(Object.keys(payload)).toEqual(["query"]);
      requests.push(payload.query);
      const queries =
        payload.query === "NodeJS"
          ? ["NodeJS", "Node.js"]
          : payload.query === "嵌入式 SQL 数据库"
            ? [payload.query, "SQLite", "SQLite3"]
            : payload.query === "文章"
              ? ["文章"]
              : [];
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ queries }) } }],
      });
    });
    const source = process.env.DB_PATH;
    const index = process.env.SEARCH_INDEX_PATH;
    const run = await startSearchValidation("rewrite");
    while (run.status === "running") await Bun.sleep(5);
    expect(run.status).toBe("passed");
    expect(run.completed).toBe(4);
    expect(requests).toHaveLength(4);
    expect(process.env.DB_PATH).toBe(source);
    expect(process.env.SEARCH_INDEX_PATH).toBe(index);
    expect((await resolveSearchPolicy("rewrite")).reason).toBeUndefined();
  });
  test("coalesces concurrent validation requests for the same mode", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requestCount = 0;
    globalThis.fetch = fakeFetch(async (_url, init) => {
      requestCount++;
      await gate;
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      const queries =
        payload.query === "NodeJS"
          ? ["NodeJS", "Node.js"]
          : payload.query === "文章"
            ? ["文章"]
            : payload.query.includes("SQL")
              ? ["SQLite3"]
              : [];
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ queries }) } }],
      });
    });
    const firstPromise = startSearchValidation("rewrite");
    const secondPromise = startSearchValidation("rewrite");
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(second.id).toBe(first.id);
    release();
    for (let i = 0; i < 100 && first.status === "running"; i++) await Bun.sleep(10);
    expect(first.status).toBe("passed");
    expect(requestCount).toBe(4);
  });
  test("concurrent quality grants preserve both independent mode results", async () => {
    const rag = await resolveSearchPolicy("rag");
    const rewrite = await resolveSearchPolicy("rewrite");
    expect(
      await Promise.all([
        recordSearchQuality("rag", rag.fingerprint ?? "", true),
        recordSearchQuality("rewrite", rewrite.fingerprint ?? "", true),
      ])
    ).toEqual([true, true]);
    expect((await resolveSearchPolicy("rag")).reason).toBeUndefined();
    expect((await resolveSearchPolicy("rewrite")).reason).toBeUndefined();
  });
  test("a saved configuration change makes an in-flight validation stale", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = fakeFetch(async (_url, init) => {
      await gate;
      const q = JSON.parse(JSON.parse(String(init?.body)).messages[1].content).query;
      const queries =
        q === "NodeJS"
          ? ["Node.js"]
          : q === "文章"
            ? ["文章"]
            : q.includes("SQL")
              ? ["SQLite3"]
              : [];
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ queries }) } }],
      });
    });
    const run = await startSearchValidation("rewrite");
    const policy = (await readSearchSettings()).policy;
    policy.rewrite.maxQueries = 2;
    await saveSearchPolicy(policy);
    release();
    for (let i = 0; i < 100 && run.status === "running"; i++) await Bun.sleep(10);
    expect(getSearchValidationRun(run.id)?.status).toBe("stale");
    expect((await resolveSearchPolicy("rewrite")).reason).toBeUndefined();
    expect((await resolveSearchPolicy("rewrite")).qualityStatus).toBe("not-run");
  });
  test("filesystem clipping visibility is checked before AI and again before returning", async () => {
    const memoId = "Memos/search-clipping.md";
    const file = path.join(process.env.LOCAL_CONTENT_BASE_PATH ?? "", memoId);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "---\npublic: true\n---\nSQLite clipping");
    await db.insert(posts).values(
      fixture(memoId, "SQLite clipping", {
        slug: "search-clipping",
        type: "memo",
        metadata: JSON.stringify({ authoredClipping: true }),
      })
    );
    await enable("rag");
    globalThis.fetch = fakeFetch(async (_url, init) => {
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      writeFileSync(file, "---\npublic: false\n---\nSQLite clipping");
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: payload.candidates.map((item: { id: string; content: string }) => ({
                  id: item.id,
                  relevant: true,
                  rank: 0,
                  evidence: item.content,
                })),
              }),
            },
          },
        ],
      });
    });
    await expect(executeContentModes({ q: "SQLite", mode: "rag" })).rejects.toThrow(
      "search-content-changed"
    );
    expect((await executeContentModes({ q: "SQLite", mode: "keyword" })).results).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  test("NEAR compatibility honors canonical clipping visibility", async () => {
    const memoId = "Memos/private-near-search.md";
    const file = path.join(process.env.LOCAL_CONTENT_BASE_PATH ?? "", memoId);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "---\ntitle: Private clipping\npublic: false\n---\nprivate marker");
    await db.insert(posts).values([
      fixture(memoId, "private marker", {
        slug: "shared-near-search",
        type: "memo",
        tags: JSON.stringify(["剪藏"]),
        metadata: JSON.stringify({ authoredClipping: true }),
        title: "Stale public clipping title",
      }),
      fixture("Memos/public-near-search.md", "unrelated public content", {
        slug: "shared-near-search",
        type: "memo",
        title: "Public memo sharing the slug",
      }),
    ]);

    const result = await executeContentModes({
      q: "NEAR(private marker, 3)",
      mode: "keyword",
    });

    expect(result.results.some((item) => item.slug === "shared-near-search")).toBe(false);
  });
  test("failed generation creation leaves the previous durable generation selected", async () => {
    const index = await contentSearchIndex();
    const previous = (await index.status()).state?.generation;
    chmodSync(index.directory, 0o500);
    try {
      await expect(index.prepare(true)).rejects.toThrow();
      expect((await index.status()).state?.generation).toBe(previous);
    } finally {
      chmodSync(index.directory, 0o700);
    }
    await db.insert(posts).values(fixture("after-fault", "SQLite"));
    expect(
      (await executeContentModes({ q: "SQLite", mode: "keyword" })).results.map((x) => x.slug)
    ).toEqual(["after-fault"]);
    expect(await index.check()).toMatchObject({ ok: true });
  });
  test("a commit I/O failure cannot advance checkpoint and an explicit rebuild repairs it", async () => {
    const index = await contentSearchIndex();
    const state = (await index.status()).state;
    const active = path.join(index.directory, state?.generation ?? "");
    await db.insert(posts).values(fixture("commit-fault", "SQLite"));
    chmodSync(active, 0o500);
    try {
      await expect(index.synchronize()).rejects.toThrow("search-index-commit-failed");
      expect((await index.status()).state?.checkpoint).toBe(state?.checkpoint);
    } finally {
      chmodSync(active, 0o700);
    }
    await index.prepare(true);
    expect(
      (await executeContentModes({ q: "SQLite", mode: "keyword" })).results.map((x) => x.slug)
    ).toEqual(["commit-fault"]);
    expect(await index.check()).toMatchObject({ ok: true });
  });
  test("HTTP arrays expose actual execution metadata and tRPC returns the same envelope", async () => {
    await db.insert(posts).values(fixture("http", "SQLite"));
    const response = await handlePublicApiRequest(
      new Request("http://localhost/api/public/search?q=SQLite&mode=keyword"),
      "/search"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Search-Effective-Mode")).toBe("keyword");
    expect(response.headers.get("access-control-expose-headers")).toContain("Search-Reason");
    const caller = appRouter.createCaller({
      req: new Request("http://localhost"),
      resHeaders: new Headers(),
      isAdmin: false,
    });
    expect(await response.json()).toEqual(
      (await caller.search.content({ q: "SQLite", mode: "keyword" })).results
    );
    const invalid = await handlePublicApiRequest(
      new Request("http://localhost/api/public/search?q=SQLite&mode=unknown"),
      "/search"
    );
    expect(invalid.status).toBe(400);
    const status = await (await contentSearchIndex()).status();
    expect(status.watermark).toBeGreaterThan(0);
  });
  test("SSE sends progress before a slow RAG model and returns the AI result", async () => {
    await db.insert(posts).values(fixture("sse-rag", "Semantic retrieval fixture"));
    await seedVerifiedBlog("sse-rag");
    const policy = structuredClone(DEFAULT_SEARCH_POLICY);
    policy.rag.timeoutMs = 100;
    await saveSearchPolicy(policy);
    await enable("rag");

    let chatCalls = 0;
    let slowChat = false;
    globalThis.fetch = fakeFetch(async (url, init) => {
      if (String(url).endsWith("/embeddings")) {
        await waitWithAbort(120, init?.signal);
        return Response.json({ data: [{ embedding: [1, 0] }] });
      }
      chatCalls += 1;
      await waitWithAbort(slowChat ? 2_200 : 120, init?.signal);
      const request = JSON.parse(String(init?.body));
      const payload = JSON.parse(request.messages[1].content);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: payload.candidates.map((candidate: { id: string; title: string }) => ({
                  id: candidate.id,
                  relevant: true,
                  rank: 0,
                  evidence: candidate.title,
                })),
              }),
            },
          },
        ],
      });
    });

    const jsonFallback = await executeContentModes(
      { q: "semantic retrieval", mode: "rag", source: "blog", type: "post", topK: 10 },
      { transport: "json" }
    );
    expect(jsonFallback).toMatchObject({ effectiveMode: "keyword", reason: "timeout" });
    slowChat = true;

    const response = await handlePublicApiRequest(
      new Request(
        "http://localhost/api/public/search/stream?q=semantic%20retrieval&mode=rag&source=blog&type=post&topK=10"
      ),
      "/search/stream"
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    let firstChunk = "";
    const body = await readSseText(response, (text) => {
      firstChunk = text;
    });
    expect(firstChunk).toContain("event: started");
    expect(firstChunk).not.toContain("event: result");
    expect(body).toContain(": heartbeat\n\n");
    expect(body).toContain("event: result");
    const resultEvent = body.split("\n\n").find((event) => event.startsWith("event: result"));
    expect(resultEvent).toBeDefined();
    if (!resultEvent) throw new Error("missing result event");
    const result = JSON.parse(resultEvent.split("\ndata: ")[1] ?? "{}");
    expect(result).toMatchObject({ effectiveMode: "rag" });
    expect(result.results.map((item: { slug: string }) => item.slug)).toEqual(["sse-rag"]);
    expect(chatCalls).toBe(1);
  });
  test("aborting a public SSE request cancels in-flight provider work", async () => {
    await db.insert(posts).values(fixture("sse-abort", "Semantic cancellation fixture"));
    await seedVerifiedBlog("sse-abort");

    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    let markProviderAborted!: () => void;
    const providerAborted = new Promise<void>((resolve) => {
      markProviderAborted = resolve;
    });
    globalThis.fetch = fakeFetch(async (url, init) => {
      if (!String(url).endsWith("/embeddings")) {
        return Response.json({ choices: [] });
      }
      markProviderStarted();
      await new Promise<never>((_, reject) => {
        const signal = init?.signal;
        const onAbort = () => {
          markProviderAborted();
          reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });
      });
    });

    const requestController = new AbortController();
    const response = await handlePublicApiRequest(
      new Request(
        "http://localhost/api/public/search/stream?q=semantic%20cancellation&mode=rag&source=blog&type=post&topK=10",
        { signal: requestController.signal }
      ),
      "/search/stream"
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("missing SSE body");
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("event: started");
    await providerStarted;

    requestController.abort();
    await providerAborted;
    const decoder = new TextDecoder();
    let afterAbort = "";
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      afterAbort += decoder.decode(part.value, { stream: true });
    }
    expect(afterAbort).not.toContain("event: result");
    reader.releaseLock();
  });
  test("MCP uses the common executor, enforces capacity and denies unpublished access", async () => {
    await db
      .insert(posts)
      .values([
        fixture("mcp-public", "SQLite"),
        fixture("mcp-private", "SQLite", { public: false }),
      ]);
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-03-26",
    };
    const init = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "search-contract", version: "1" },
          },
        }),
      })
    );
    const session = init.headers.get("mcp-session-id") ?? "";
    expect(session).not.toBe("");
    await init.text();
    async function call(name: string, args: unknown) {
      const response = await handleMcpHttpRequest(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: { ...headers, "mcp-session-id": session },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        })
      );
      const raw = await response.text();
      const data =
        raw
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6) ?? raw;
      return JSON.parse(data);
    }
    try {
      const fresh = await call("search_content", { q: "SQLite", mode: "keyword" });
      expect(JSON.parse(fresh.result.content[0].text)).toMatchObject({
        requestedMode: "keyword",
        effectiveMode: "keyword",
        results: [{ slug: "mcp-public" }],
      });
      const legacy = await call("search_enhanced", { q: "SQLite", rerank: false });
      expect(JSON.parse(legacy.result.content[0].text)).toMatchObject([
        { slug: "mcp-public", type: "post" },
      ]);
      const privateCall = await call("search_content", {
        q: "SQLite",
        mode: "keyword",
        publishedOnly: false,
      });
      expect(privateCall.result.isError).toBe(true);
      const capacity = await call("search_content", { q: "SQLite", mode: "keyword", topK: 51 });
      expect(Boolean(capacity.error || capacity.result?.isError)).toBe(true);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      await handleMcpHttpRequest(
        new Request("http://localhost/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": session, "mcp-protocol-version": "2025-03-26" },
        })
      );
    }
  });
  test("RAG joins a same-edition Playbook semantic candidate with untrusted evidence", async () => {
    const bundle = makePublicBundle("v3.0.0", "100");
    process.env.PLAYBOOK_CACHE_DIR = path.join(directory, "playbook-cache");
    await getRuntimePlaybookStore().adopt(bundle.edition);
    await db.delete(searchSemanticEmbeddings);
    const embedding = [1, 0];
    const resolved = await resolveSearchPolicy("rag");
    expect(resolved.resolved?.embedding.model).toBe("synthetic-embedding");
    expect(resolved.fingerprint).toBeTruthy();
    expect(await recordSearchQuality("rag", resolved.fingerprint ?? "", true)).toBe(true);
    const embeddingConfig = resolved.resolved?.embedding;
    if (!embeddingConfig) throw new Error("synthetic embedding config is unavailable");
    const modelInputs: Array<{ url: string; payload: unknown }> = [];
    globalThis.fetch = fakeFetch(async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      modelInputs.push({ url, payload: body });
      if (url.endsWith("/embeddings")) {
        const text = String(body.input ?? "");
        return Response.json({
          data: [
            {
              embedding:
                text.includes("semantic-only") || text.includes("Safe Release")
                  ? embedding
                  : [0, 1],
            },
          ],
        });
      }
      const payload = JSON.parse(body.messages[1].content) as {
        candidates: Array<{ id: string; content: string }>;
      };
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: payload.candidates.map((candidate, rank) => ({
                  id: candidate.id,
                  relevant: true,
                  rank,
                  evidence: candidate.content.slice(0, 32),
                })),
              }),
            },
          },
        ],
      });
    });
    const projection = await preparePlaybookSemanticProjection(bundle.edition, embeddingConfig);
    expect(projection.failed).toBe(0);
    expect(projection.prepared).toBeGreaterThan(0);
    const result = await executeContentModes({
      q: "semantic-only",
      mode: "rag",
      source: "all",
      type: "policy",
      topK: 3,
    });
    expect(result.effectiveMode).toBe("rag");
    expect(result.ragIncompleteSources).toBeUndefined();
    expect(result.results.some((item) => item.source === "playbook")).toBe(true);
    const chatPayload = modelInputs.find((entry) => entry.url.endsWith("/chat/completions"))
      ?.payload as {
      messages?: Array<{ content?: string }>;
    };
    const candidateContent = chatPayload.messages?.[1]?.content ?? "";
    expect(candidateContent).toContain("<untrusted-playbook-evidence");
    expect(candidateContent).toContain(bundle.edition.edition.editionDigest);
    expect(candidateContent).toContain(bundle.edition.edition.source.releaseId);
    expect(candidateContent).toContain(bundle.edition.edition.source.tag);
    expect(candidateContent).not.toContain("private");
    expect(result.results.every((item) => item.source === "playbook")).toBe(true);
  });

  test("HTTP, tRPC, and MCP ignore legacy Playbook selectors and use current", async () => {
    const previous = makePublicBundle("v2.9.9", "99");
    const bundle = makePublicBundle("v3.0.0", "100");
    await getRuntimePlaybookStore().adopt(previous.edition);
    await getRuntimePlaybookStore().adopt(bundle.edition);
    const legacyIdentity = new URLSearchParams({
      edition: "not-a-digest",
      sourceReleaseId: "not-a-release",
      sourceTag: "not-a-tag",
    });

    const http = await handlePublicApiRequest(
      new Request(
        `http://localhost/api/public/search?q=verify&mode=keyword&source=playbook&type=policy&${legacyIdentity}`
      ),
      "/search"
    );
    expect(http.status).toBe(200);
    expect(http.headers.get("Search-Playbook-Edition")).toBe(bundle.edition.edition.editionDigest);
    expect(http.headers.get("Search-Playbook-Source-Release-Id")).toBe("100");
    expect((await http.json()) as Array<{ source: string }>).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "playbook" })])
    );

    const trpc = await appRouter
      .createCaller({
        req: new Request("http://localhost"),
        resHeaders: new Headers(),
        isAdmin: false,
      })
      .search.content({
        q: "verify",
        mode: "keyword",
        source: "playbook",
        type: "policy",
        edition: "0".repeat(64),
        sourceReleaseId: previous.edition.edition.source.releaseId,
        sourceTag: previous.edition.edition.source.tag,
      });
    expect(trpc.playbook?.sourceTag).toBe("v3.0.0");
    expect(trpc.results.every((item) => item.source === "playbook")).toBe(true);

    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-03-26",
    };
    const init = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "playbook-contract", version: "1" },
          },
        }),
      })
    );
    const session = init.headers.get("mcp-session-id") ?? "";
    await init.text();
    try {
      const response = await handleMcpHttpRequest(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: { ...headers, "mcp-session-id": session },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "search_content",
              arguments: {
                q: "verify",
                mode: "keyword",
                source: "playbook",
                type: "policy",
                edition: "malformed",
                sourceReleaseId: "-1",
                sourceTag: "old",
              },
            },
          }),
        })
      );
      const raw = await response.text();
      const payload = JSON.parse(
        raw
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6) ?? raw
      );
      const result = JSON.parse(payload.result.content[0].text) as {
        playbook?: { sourceTag: string };
        results: Array<{ source: string }>;
      };
      expect(result.playbook?.sourceTag).toBe("v3.0.0");
      expect(result.results.every((item) => item.source === "playbook")).toBe(true);

      const unknownParameterResponse = await handleMcpHttpRequest(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: { ...headers, "mcp-session-id": session },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "search_content",
              arguments: {
                q: "verify",
                mode: "keyword",
                bogus: true,
              },
            },
          }),
        })
      );
      const unknownParameterRaw = await unknownParameterResponse.text();
      const unknownParameterPayload = JSON.parse(
        unknownParameterRaw
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6) ?? unknownParameterRaw
      );
      expect(unknownParameterPayload.error?.code).toBe(-32602);
    } finally {
      await handleMcpHttpRequest(
        new Request("http://localhost/mcp", {
          method: "DELETE",
          headers: { "mcp-session-id": session, "mcp-protocol-version": "2025-03-26" },
        })
      );
    }
  });
});
