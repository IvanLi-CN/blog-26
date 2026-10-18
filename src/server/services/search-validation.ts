import { randomUUID } from "node:crypto";
import { cosineSimilarity } from "@/lib/ai/embeddings";
import type { AiSearchMode, SearchValidationRun } from "@/lib/search/settings";
import {
  embedSearchQuery,
  judgeSearchCandidates,
  rewriteSearchQuery,
  SearchModelError,
} from "./search-model";
import { recordSearchQuality, resolveSearchPolicy } from "./search-policy";
import { createRewriteQualityProbe, rewriteQualityCases } from "./search-rewrite-quality";

const runs = new Map<string, SearchValidationRun>();
const admissions = new Map<AiSearchMode, Promise<SearchValidationRun>>();
const ragCases = [
  {
    query: "SQLite",
    candidates: [
      {
        id: "sqlite3",
        title: "SQLite3 handbook",
        content:
          "SQLite3 is the current embedded SQL database. Covers SQL queries, transactions, and database persistence.",
      },
      {
        id: "sqlite-mention",
        title: "Reading list",
        content: "A list of unrelated tools, including SQLite.",
      },
      { id: "random", title: "Gardening", content: "Plant tomatoes in spring." },
    ],
    relevant: ["sqlite3"],
    irrelevant: ["random"],
    first: "sqlite3",
  },
  {
    query: "Node.js",
    candidates: [
      {
        id: "runtime",
        title: "Node runtime",
        content: "Use the Node JavaScript runtime to run server applications and npm packages.",
      },
      {
        id: "graph",
        title: "Graph node",
        content: "A graph node is a vertex in a mathematical network.",
      },
      {
        id: "cluster",
        title: "Cluster nodes",
        content: "A cluster node is a physical machine running orchestration agents.",
      },
    ],
    relevant: ["runtime"],
    irrelevant: ["graph", "cluster"],
    first: "runtime",
  },
  {
    query: "文章",
    candidates: [
      { id: "article", title: "写作", content: "这篇文章介绍如何写文章并整理段落。" },
      { id: "split", title: "无关记录", content: "文隔开章只是几个不连续的字符。" },
    ],
    relevant: ["article"],
    irrelevant: ["split"],
    first: "article",
  },
  {
    query: "长颈鹿骑宇宙自行车",
    candidates: [
      { id: "sql", title: "SQLite", content: "An embedded SQL database." },
      { id: "node", title: "NodeJS", content: "JavaScript server runtime." },
    ],
    relevant: [],
    irrelevant: ["sql", "node"],
    first: undefined,
  },
];
export function getSearchValidationRun(id: string) {
  return runs.get(id);
}
export async function startSearchValidation(mode: AiSearchMode) {
  const admitted = admissions.get(mode);
  if (admitted) return admitted;
  const admission = (async () => {
    const resolved = await resolveSearchPolicy(mode);
    const fingerprint = resolved.fingerprint ?? "unconfigured";
    const active = [...runs.values()].find((run) => run.status === "running" && run.mode === mode);
    if (active) return active;
    const run: SearchValidationRun = {
      id: randomUUID(),
      mode,
      fingerprint,
      status: "running",
      completed: 0,
      total: 4,
      startedAt: Date.now(),
    };
    if (runs.size >= 32) {
      const terminal = [...runs.values()].find((x) => x.status !== "running");
      if (terminal) runs.delete(terminal.id);
    }
    runs.set(run.id, run);
    void (async () => {
      try {
        if (
          !resolved.chat ||
          !resolved.fingerprint ||
          (resolved.reason && resolved.reason !== "unvalidated")
        )
          throw new SearchModelError(resolved.reason ?? "unconfigured");
        if (mode === "rag") {
          if (!resolved.resolved) throw new SearchModelError("unconfigured");
          const vectorQuery = await embedSearchQuery(
            resolved.resolved.embedding,
            "嵌入式 SQL 数据库 SQLite"
          );
          const related = await embedSearchQuery(
            resolved.resolved.embedding,
            "SQLite3 is an embedded SQL database supporting transactions."
          );
          const unrelated = await embedSearchQuery(
            resolved.resolved.embedding,
            "Plant tomatoes in a garden in spring."
          );
          if (cosineSimilarity(vectorQuery, related) <= cosineSimilarity(vectorQuery, unrelated))
            throw new SearchModelError("invalid-output");
          for (const sample of ragCases) {
            const output = await judgeSearchCandidates(
              resolved.chat,
              resolved.policy,
              sample.query,
              sample.candidates
            );
            const byId = new Map(output.items.map((x) => [x.id, x]));
            const supplied = new Set(sample.candidates.map((x) => x.id));
            if (
              output.items.length !== sample.candidates.length ||
              byId.size !== sample.candidates.length ||
              output.items.some((item) => !supplied.has(item.id)) ||
              sample.relevant.some((id) => !byId.get(id)?.relevant) ||
              sample.irrelevant.some((id) => byId.get(id)?.relevant !== false)
            )
              throw new SearchModelError("invalid-output");
            if (
              sample.first &&
              output.items.some(
                (item) =>
                  item.id !== sample.first &&
                  item.rank <= (byId.get(sample.first ?? "")?.rank ?? 101)
              )
            )
              throw new SearchModelError("invalid-output");
            run.completed++;
          }
        } else {
          const probe = await createRewriteQualityProbe();
          try {
            for (const sample of rewriteQualityCases) {
              const output = await rewriteSearchQuery(resolved.chat, resolved.policy, sample.query);
              const max = "maxQueries" in resolved.policy ? resolved.policy.maxQueries : 3;
              await probe.check(sample, output.queries, max);
              run.completed++;
            }
          } finally {
            await probe.dispose();
          }
        }
        run.status = (await recordSearchQuality(mode, fingerprint, true)) ? "passed" : "stale";
      } catch (error) {
        run.reason = error instanceof SearchModelError ? error.reason : "unavailable";
        run.status =
          fingerprint === "unconfigured"
            ? "failed"
            : (await recordSearchQuality(mode, fingerprint, false).catch(() => false))
              ? "failed"
              : "stale";
      } finally {
        run.finishedAt = Date.now();
      }
    })();
    return run;
  })();
  admissions.set(mode, admission);
  try {
    return await admission;
  } finally {
    if (admissions.get(mode) === admission) admissions.delete(mode);
  }
}
