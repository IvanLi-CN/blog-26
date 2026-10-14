// This fixture intercepts every model request; it never contacts a provider.
import { Database } from "bun:sqlite";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
      if ((phase === "interrupt-write" || phase === "cancel-write") && embeddingCalls === 2)
        return await new Promise<Response>(() => {
          /* Deliberate in-flight request at process termination. */
        });
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
const dbPath = process.env.DB_PATH;
if (!dbPath) throw new Error("DB_PATH required");
const sqlite = new Database(dbPath);
if (phase === "upgrade") {
  const prior = join(dirname(dbPath), "pre-0015");
  mkdirSync(join(prior, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 15);
  writeFileSync(join(prior, "meta/_journal.json"), JSON.stringify(journal));
  for (const entry of journal.entries)
    copyFileSync(`drizzle/${entry.tag}.sql`, join(prior, `${entry.tag}.sql`));
  migrate(drizzle(sqlite), { migrationsFolder: prior });
  sqlite.run(
    "INSERT INTO post_embeddings(id,post_id,slug,type,model_name,dim,content_hash,chunk_index,vector,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [
      "legacy",
      "legacy-parent",
      "legacy",
      "post",
      "old-model",
      2,
      "old-hash",
      -1,
      Buffer.from(new Float32Array([1, 0]).buffer),
      1,
      1,
    ]
  );
  const { getRuntimePlaybookStore } = await import("../../src/lib/playbook/cache");
  const { makePublicBundle } = await import("./playbook-fixture");
  await getRuntimePlaybookStore().adopt(makePublicBundle("v2.9.9", "299").edition);
}
migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
if (phase === "upgrade") {
  const legacy = sqlite.query("SELECT * FROM post_embeddings WHERE id='legacy'").get() as {
    model_name: string;
    vector: Uint8Array;
  };
  if (legacy.model_name !== "old-model" || legacy.vector.length !== 8)
    throw new Error("Upgrade lost legacy vector");
}
sqlite.close();
const databaseModule = await import("../../src/lib/db");
await databaseModule.initializeDB(true);
const db = databaseModule.db;
const { getRuntimePlaybookStore } = await import("../../src/lib/playbook/cache");
const { posts } = await import("../../src/lib/schema");
const { ragCoverage, runRagIndex } = await import("../../src/server/services/rag-index");
const { getContentTask } = await import("../../src/server/services/content-tasks");
if (phase === "upgrade") {
  await getRuntimePlaybookStore().load();
  if (getRuntimePlaybookStore().current?.edition.source.tag !== "v2.9.9")
    throw new Error("Upgrade lost snapshot");
  console.log(
    JSON.stringify({ phase, mock: true, legacyVectorPreserved: true, snapshotPreserved: true })
  );
  process.exit(0);
}
const restartReceipt = join(dirname(dbPath), "interrupted.json");
if (phase === "interrupt-write" || phase === "cancel-write") {
  const { makePublicBundle } = await import("./playbook-fixture");
  await getRuntimePlaybookStore().adopt(makePublicBundle("v3.0.1", "301").edition);
  const { taskId } = await runRagIndex({ source: "playbook" }, "repair");
  for (let i = 0; i < 1000; i++) {
    const task = await getContentTask(taskId);
    if (task && task.processed > 0 && embeddingCalls >= 2) {
      if (phase === "cancel-write") {
        const { cancelContentTask } = await import("../../src/server/services/content-tasks");
        await cancelContentTask(taskId);
      }
      writeFileSync(
        restartReceipt,
        JSON.stringify({
          taskId,
          processed: task.processed,
          target: task.target,
          total: task.total,
        })
      );
      console.log(
        JSON.stringify({ phase, mock: true, taskId, processed: task.processed, total: task.total })
      );
      process.exit(0); // Deliberately terminate with the next Mock request still in flight.
    }
    await Bun.sleep(10);
  }
  throw new Error("Interruption point not reached");
}
if (phase === "recover" || phase === "cancel-read") {
  const receipt = JSON.parse(readFileSync(restartReceipt, "utf8"));
  const prior = await getContentTask(receipt.taskId);
  if (!prior || prior.target !== receipt.target || prior.processed !== receipt.processed)
    throw new Error("Recovery changed persisted identity/progress");
  // Make the interrupted edition previous: recovery must keep its full identity.
  await getRuntimePlaybookStore().load();
  const { makePublicBundle } = await import("./playbook-fixture");
  await getRuntimePlaybookStore().adopt(makePublicBundle("v3.0.2", "302").edition);
  const { cancelContentTask } = await import("../../src/server/services/content-tasks");
  if (phase === "cancel-read") {
    const stop = await (
      await import("../../src/server/services/content-sync-runtime")
    ).startContentSyncRuntime();
    stop();
    if ((await getContentTask(receipt.taskId))?.status !== "cancelled")
      throw new Error("Cancelled task resumed");
  } else {
    const stop = await (
      await import("../../src/server/services/content-sync-runtime")
    ).startContentSyncRuntime();
    stop();
    for (let i = 0; i < 1000; i++) {
      const task = await getContentTask(receipt.taskId);
      if (task?.finishedAt !== null && task) {
        if (
          task.status !== "success" ||
          task.processed !== receipt.total ||
          task.target !== receipt.target
        )
          throw new Error("Recovered task lost target/progress");
        break;
      }
      if (i === 999) throw new Error("Recovery timeout");
      await Bun.sleep(10);
    }
    const coverage = await ragCoverage({ source: "playbook", edition: "previous" });
    if (coverage.status.contents.indexed !== coverage.status.contents.total)
      throw new Error("Retained projection incomplete");
  }
  // Cancel any unrelated startup task before process exit.
  const { listContentTasks } = await import("../../src/server/services/content-tasks");
  for (const task of (await listContentTasks()).items)
    if (task.finishedAt === null) await cancelContentTask(task.id);
  console.log(
    JSON.stringify({
      phase,
      mock: true,
      taskId: receipt.taskId,
      retained: true,
      cancelled: phase === "cancel-read",
    })
  );
  process.exit(0);
}
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
