// This fixture intercepts every model request; it never contacts a provider.
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const phase = process.argv[2];
const originalFetch = globalThis.fetch;
let embeddingCalls = 0;
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://synthetic-restart.example.test/"))
      throw new Error("External request blocked");
    if (url.endsWith("/embeddings")) {
      if (phase === "read" && JSON.parse(String(init?.body)).input !== "semantic-only")
        throw new Error("Read unexpectedly attempted projection generation");
      embeddingCalls++;
      return Response.json({ data: [{ embedding: [1, 0] }] });
    }
    if (url.endsWith("/chat/completions")) {
      const body = JSON.parse(String(init?.body));
      const payload = JSON.parse(body.messages[1].content);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                items: payload.candidates.map(
                  (candidate: { id: string; content: string }, rank: number) => ({
                    id: candidate.id,
                    relevant: true,
                    rank,
                    evidence: candidate.content.slice(0, 32),
                  })
                ),
              }),
            },
          },
        ],
      });
    }
    throw new Error("Unexpected Mock request");
  },
  { preconnect: originalFetch.preconnect }
);
const sqlite = new Database(process.env.DB_PATH);
migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
sqlite.close();
const databaseModule = await import("../../src/lib/db");
await databaseModule.initializeDB(true);
const db = databaseModule.db;
const { getRuntimePlaybookStore } = await import("../../src/lib/playbook/cache");
const { posts } = await import("../../src/lib/schema");
const { ragCoverage, runRagIndex } = await import("../../src/server/services/rag-index");
const { getContentTask } = await import("../../src/server/services/content-tasks");
if (phase === "write") {
  const { makePublicBundle } = await import("./playbook-fixture");
  await getRuntimePlaybookStore().adopt(makePublicBundle("v3.3.0", "300").edition);
  await db.insert(posts).values({
    id: "synthetic-blog",
    slug: "synthetic-blog",
    title: "Synthetic",
    body: "Fixed isolated evidence",
    contentHash: "synthetic-restart",
    type: "post",
    public: true,
    draft: false,
    publishDate: 1,
    dataSource: "local",
  });
  for (const source of ["blog", "playbook"] as const) {
    const { taskId } = await runRagIndex({ source }, "repair");
    for (let i = 0; i < 1000; i++) {
      const task = await getContentTask(taskId);
      if (task?.finishedAt !== null && task) {
        if (task.status !== "success") throw new Error("Mock projection failed");
        break;
      }
      if (i === 999) throw new Error("Mock task timeout");
      await Bun.sleep(10);
    }
  }
} else {
  const { contentSearchIndex } = await import("../../src/server/services/content-search-index");
  await (await contentSearchIndex()).prepare();
  const { resolveSearchPolicy, recordSearchQuality } = await import(
    "../../src/server/services/search-policy"
  );
  const resolved = await resolveSearchPolicy("rag");
  if (!resolved.fingerprint || !(await recordSearchQuality("rag", resolved.fingerprint, true)))
    throw new Error("Mock policy unavailable");
  const { executeContentModes } = await import("../../src/server/services/content-search");
  const result = await executeContentModes({
    q: "semantic-only",
    mode: "rag",
    source: "all",
    topK: 10,
  });
  if (
    result.effectiveMode !== "rag" ||
    result.ragIncompleteSources?.length ||
    !result.results.some((item) => item.source === "playbook") ||
    !result.results.some((item) => item.slug === "synthetic-blog" && item.source !== "playbook")
  )
    throw new Error(`Modern RAG did not consume both persisted sources: ${JSON.stringify(result)}`);
}
const coverage = await ragCoverage({ source: "all" });
if (
  coverage.status.contents.total !== coverage.status.contents.indexed ||
  coverage.status.contents.total < 4
)
  throw new Error("Persisted coverage is incomplete");
console.log(
  JSON.stringify({
    phase,
    mock: true,
    embeddingCalls,
    contents: coverage.status.contents,
    identity: coverage.status.identity,
  })
);
