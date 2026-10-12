import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type IndexUpdate, NativeIndex } from "@/lib/search/native-index";
import { planNativeQuery } from "@/lib/search/native-query";
import { SearchModelError } from "./search-model";
import { planSearchRewrites } from "./search-rewrite";

// Fixed synthetic documents are local probe inputs; none are sent to the rewrite model.
const documents = [
  ["runtime", "Node.js runtime", "Run server applications with the Node.js JavaScript runtime."],
  ["graph", "Graph node", "A graph node is a vertex in a mathematical network."],
  ["cluster", "Cluster node", "A cluster node is a physical orchestration machine."],
  ["javascript", "JavaScript syntax", "JavaScript variables and browser DOM events."],
  ["sqlite3", "SQLite3 handbook", "SQLite3 transactions, persistence and SQL queries."],
  ["sqlite-mention", "Reading list", "A list of unrelated tools, including SQLite."],
  ["article", "写作", "这篇文章介绍如何写文章并整理段落。"],
  ["split", "无关记录", "文隔开章只是几个不连续的字符。"],
  ["garden", "Gardening", "Plant tomatoes in a garden in spring."],
] as const;
export const rewriteQualityCases = [
  { query: "NodeJS", relevant: ["runtime"], irrelevant: ["graph", "cluster", "javascript"] },
  { query: "嵌入式 SQL 数据库", relevant: ["sqlite3"], irrelevant: ["garden", "graph"] },
  { query: "文章", relevant: ["article"], irrelevant: ["split"] },
  {
    query: "长颈鹿骑宇宙自行车",
    relevant: [],
    irrelevant: documents.map(([id]) => id),
    empty: true,
  },
];

/** An isolated real-engine probe, with no source DB, global environment or production index changes. */
export async function createRewriteQualityProbe() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "blog-rewrite-quality-"));
  try {
    const index = await NativeIndex.open(directory);
    const updates: IndexUpdate[] = documents.map(([id, title, body]) => ({
      id,
      version: "synthetic-retrieval-v3",
      slug: id,
      title,
      body,
      type: "post",
      published: true,
    }));
    await index.apply(updates);
    return {
      async check(sample: (typeof rewriteQualityCases)[number], queries: string[], max: number) {
        const rewrites = planSearchRewrites(sample.query, queries, max);
        if (sample.empty && queries.length) throw new SearchModelError("invalid-output");
        const original = planNativeQuery(sample.query).ast;
        if (!original) throw new SearchModelError("invalid-output");
        const found = new Set<string>();
        for (const ast of [original, ...rewrites.map((item) => item.ast)]) {
          const hits = await index.search(ast, { limit: documents.length });
          for (const hit of hits) found.add(hit.id);
        }
        if (
          sample.relevant.some((id) => !found.has(id)) ||
          sample.irrelevant.some((id) => found.has(id))
        )
          throw new SearchModelError("invalid-output");
      },
      dispose: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
