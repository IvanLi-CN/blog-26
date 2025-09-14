import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { db } from "../db";
import { postEmbeddings, posts } from "../schema";
import { cosineSimilarity, createEmbedding } from "./embeddings";
import { rerank as rerankApi } from "./rerank";

export type SemanticSearchInput = {
  q: string;
  topK?: number;
  type?: "all" | "post" | "memo";
  publishedOnly?: boolean;
  model?: string;
};

export type SearchResult = {
  slug: string;
  title?: string | null;
  excerpt?: string | null;
  type?: "post" | "memo"; // 用于前端路由跳转
  cosine?: number;
  rerank?: number;
  final?: number;
};

async function keywordFallback(input: SemanticSearchInput): Promise<SearchResult[]> {
  const q = input.q.trim();
  if (!q) return [];

  const conditions = [] as any[];

  // 发布状态过滤（除非显式传 publishedOnly=false）
  if (input.publishedOnly !== false) {
    conditions.push(eq(posts.draft, false));
    conditions.push(eq(posts.public, true));
  }

  // 类型过滤
  if (input.type && input.type !== "all") {
    conditions.push(eq(posts.type, input.type));
  } else {
    // 仅在搜索时纳入主要类型
    conditions.push(inArray(posts.type, ["post", "memo"] as unknown as string[]));
  }

  // 关键字匹配（title/ excerpt/ body）
  const pattern = `%${q}%`;
  const matchCond = or(
    like(posts.title, pattern),
    like(posts.excerpt, pattern),
    like(posts.body, pattern)
  );

  const rows = await db
    .select({ slug: posts.slug, title: posts.title, excerpt: posts.excerpt, type: posts.type })
    .from(posts)
    .where(and(matchCond, ...(conditions as any)))
    .orderBy(desc(posts.publishDate))
    .limit(input.topK ?? 50);

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    type: r.type as any,
  }));
}

export async function semantic(input: SemanticSearchInput): Promise<SearchResult[]> {
  const model = input.model || process.env.EMBEDDING_MODEL_NAME || "BAAI/bge-m3";

  // 若当前模型尚无向量索引，降级为关键字搜索
  try {
    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(postEmbeddings)
      .where(eq(postEmbeddings.modelName, model));
    const hasIndex = (countRows[0]?.count ?? 0) > 0;
    if (!hasIndex) {
      return keywordFallback(input);
    }
  } catch {
    // 统计失败时，不阻断主流程
  }

  // 生成查询向量；失败时也回退到关键字搜索
  let qv: number[];
  try {
    const { vector } = await createEmbedding(input.q, model);
    qv = vector;
  } catch {
    return keywordFallback(input);
  }
  const _targetTypes = input.type && input.type !== "all" ? [input.type] : ["post", "memo"];

  const eb = await db
    .select({ slug: postEmbeddings.slug, vector: postEmbeddings.vector })
    .from(postEmbeddings)
    .where(eq(postEmbeddings.modelName, model));

  // 计算每个 slug 的最大 cosine
  const scoreBySlug = new Map<string, number>();
  for (const row of eb) {
    if (!row.vector) continue;
    const buf = row.vector as unknown as Buffer;
    const f32 = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
    const vec = Array.from(f32);
    const s = cosineSimilarity(qv, vec);
    const prev = scoreBySlug.get(row.slug) ?? -Infinity;
    if (s > prev) scoreBySlug.set(row.slug, s);
  }

  // 过滤文章状态
  const slugs = Array.from(scoreBySlug.keys());
  if (slugs.length === 0) return [];
  const postsRows = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      draft: posts.draft,
      public: posts.public,
      type: posts.type,
    })
    .from(posts)
    .where(inArray(posts.slug, slugs));

  const results: SearchResult[] = postsRows
    .filter((p) => (input.publishedOnly !== false ? !p.draft && p.public : true))
    .filter((p) => (input.type && input.type !== "all" ? p.type === input.type : true))
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      type: p.type as any,
      cosine: scoreBySlug.get(p.slug) ?? 0,
    }));

  results.sort((a, b) => (b.cosine ?? 0) - (a.cosine ?? 0));
  return results.slice(0, input.topK ?? 50);
}

export async function enhanced(
  input: SemanticSearchInput & { rerankTopK?: number; rerank?: boolean }
) {
  const base = await semantic(input);
  const shouldRerank = input.rerank !== false && !!(process.env.RERANKER_MODEL_NAME || input.model);
  if (!shouldRerank) return base;

  const docs = base
    .slice(0, input.rerankTopK ?? 20)
    .map((r) => `${r.title || r.slug}\n\n${r.excerpt || ""}`);
  try {
    const items = await rerankApi(input.q, docs, {
      model: process.env.RERANKER_MODEL_NAME || undefined,
      topN: docs.length,
    });
    const maxR = Math.max(...items.map((i) => i.score));
    const minR = Math.min(...items.map((i) => i.score));
    const norm = (x: number) => (maxR === minR ? 0 : (x - minR) / (maxR - minR));

    const alpha = 0.3;
    const beta = Number(process.env.RERANKER_WEIGHT || 0.7);

    return base
      .map((r, i) => {
        const rr = items.find((it) => it.index === i)?.score ?? 0;
        const final = (alpha * ((r.cosine ?? 0) + 1)) / 2 + beta * norm(rr);
        return { ...r, rerank: rr, final };
      })
      .sort((a, b) => (b.final ?? 0) - (a.final ?? 0));
  } catch (err: unknown) {
    const hasCode = (e: unknown, code: string): e is { code: string } => {
      return (
        typeof e === "object" &&
        e !== null &&
        "code" in (e as Record<string, unknown>) &&
        (e as Record<string, unknown>).code === code
      );
    };
    if (hasCode(err, "RERANKER_UNAVAILABLE")) {
      throw err; // 由上层返回明确错误
    }
    throw err;
  }
}
