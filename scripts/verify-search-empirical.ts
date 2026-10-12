import { Database } from "bun:sqlite";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

// This command sends only the fixed synthetic samples below and the product quality suite.
// It never opens the caller's content database or copies site content into model requests.
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "rag-timeout-ms": { type: "string", default: "10000" },
    "rag-output-tokens": { type: "string", default: "2048" },
    "rewrite-timeout-ms": { type: "string", default: "5000" },
    "rewrite-output-tokens": { type: "string", default: "1024" },
    "capture-judgments": { type: "boolean", default: false },
  },
});
const directory = await mkdtemp(join(tmpdir(), "blog-search-empirical-"));
process.env.DB_PATH = join(directory, "content.sqlite");
process.env.SEARCH_INDEX_PATH = join(directory, "index");
process.env.LOCAL_CONTENT_BASE_PATH = join(directory, "local");
await mkdir(process.env.LOCAL_CONTENT_BASE_PATH);
const sqlite = new Database(process.env.DB_PATH);
migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
sqlite.close();
const databaseModule = await import("../src/lib/db");
const { posts, postEmbeddings } = await import("../src/lib/schema");
const { buildEmbeddingInput, hashEmbeddingInput } = await import("../src/lib/ai/embeddings");
const { getResolvedLlmConfig } = await import("../src/server/services/llm-settings");
const { embedSearchQuery } = await import("../src/server/services/search-model");
const { startSearchValidation } = await import("../src/server/services/search-validation");
const { contentSearchIndex } = await import("../src/server/services/content-search-index");
const { executeContentModes } = await import("../src/server/services/content-search");
const { saveSearchPolicy } = await import("../src/server/services/search-policy");
const { DEFAULT_SEARCH_POLICY } = await import("../src/lib/search/settings");
await databaseModule.initializeDB(true);
const db = databaseModule.db;
const policy = structuredClone(DEFAULT_SEARCH_POLICY);
policy.rag.timeoutMs = Number(values["rag-timeout-ms"]);
policy.rag.maxOutputTokens = Number(values["rag-output-tokens"]);
policy.rewrite.timeoutMs = Number(values["rewrite-timeout-ms"]);
policy.rewrite.maxOutputTokens = Number(values["rewrite-output-tokens"]);
await saveSearchPolicy(policy);
console.log(JSON.stringify({ isolatedArtifacts: directory, policy }));
const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const model = JSON.parse(String(init?.body ?? "{}")).model;
    try {
      const response = await originalFetch(input, init);
      if (
        values["capture-judgments"] &&
        String(input).endsWith("/chat/completions") &&
        response.ok
      ) {
        const body = await response.clone().json();
        console.log(
          JSON.stringify({
            syntheticModelOutput: body.choices?.[0]?.message?.content,
            finishReason: body.choices?.[0]?.finish_reason,
            usage: body.usage,
          })
        );
      }
      console.log(
        JSON.stringify({
          endpoint: new URL(String(input)).pathname,
          model,
          status: response.status,
          ms: Math.round(performance.now() - started),
        })
      );
      return response;
    } catch (error) {
      console.log(
        JSON.stringify({
          endpoint: new URL(String(input)).pathname,
          model,
          status: error instanceof Error ? error.name : "network-error",
        })
      );
      throw error;
    }
  },
  { preconnect: originalFetch.preconnect }
);
for (const mode of ["rag", "rewrite"] as const) {
  const run = await startSearchValidation(mode);
  while (run.status === "running") await Bun.sleep(100);
  console.log(JSON.stringify({ validation: run }));
  assert.equal(run.status, "passed", `${mode} fixed quality samples`);
  assert.equal(run.completed, 4);
}
const rows = [
  ["keyword", "SQLite mention in a reading list."],
  [
    "sqlite3",
    "SQLite3 is the embedded SQL database. Covers database transactions and SQL queries.",
  ],
  ["runtime", "Node JavaScript runtime for server applications and npm packages."],
  ["graph", "Graph node is a vertex in a mathematical network."],
  ["article", "这篇文章介绍写作与段落组织。"],
  ["garden", "Plant tomatoes in a garden in spring."],
] as const;
const config = await getResolvedLlmConfig();
assert.ok(config.embedding.model, "configured embedding model");
for (const [id, body] of rows) {
  const row = {
    id,
    slug: id,
    title: id,
    body,
    type: "post",
    public: true,
    draft: false,
    publishDate: 1,
    updateDate: 1,
    contentHash: `source-${id}`,
    dataSource: "local",
  };
  await db.insert(posts).values(row);
  const input = buildEmbeddingInput(row);
  const vector = await embedSearchQuery(config.embedding, input);
  await db.insert(postEmbeddings).values({
    id: `${id}-embedding`,
    postId: id,
    slug: id,
    type: "post",
    contentHash: hashEmbeddingInput(input),
    modelName: config.embedding.model,
    dim: vector.length,
    vector: Buffer.from(new Float32Array(vector).buffer),
    createdAt: 1,
    updatedAt: 1,
  });
}
await (await contentSearchIndex()).prepare();
for (const mode of ["rag", "rewrite"] as const) {
  for (const q of ["SQLite", "Node.js", "文章", "长颈鹿骑宇宙自行车", "嵌入式 SQL 数据库"]) {
    const result = await executeContentModes({ q, mode });
    const ids = result.results.map((item) => item.slug);
    console.log(
      JSON.stringify({
        execution: {
          q,
          requestedMode: mode,
          effectiveMode: result.effectiveMode,
          reason: result.reason,
          ids,
        },
      })
    );
    assert.equal(result.effectiveMode, mode, "the selected AI chain actually executed");
    if (q === "SQLite") {
      assert.ok(ids.includes("keyword"), "original keyword set is preserved");
      if (mode === "rag") assert.equal(ids[0], "sqlite3");
    }
    if (q === "Node.js") {
      assert.ok(!ids.includes("graph"));
      if (mode === "rag") assert.ok(ids.includes("runtime"));
    }
    if (q === "文章") assert.ok(ids.includes("article"));
    if (q === "长颈鹿骑宇宙自行车") assert.deepEqual(ids, []);
    if (q === "嵌入式 SQL 数据库") assert.ok(ids.includes("sqlite3"), "useful concept discovery");
  }
}
console.log("PASS fixed model quality and both actual search chains");
