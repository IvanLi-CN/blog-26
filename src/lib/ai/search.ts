import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getResolvedLlmConfig } from "@/server/services/llm-settings";
import { db } from "../db";
import { postEmbeddings, posts } from "../schema";
import { cosineSimilarity, createEmbedding } from "./embeddings";
import { rerank as rerankApi } from "./rerank";
import { getCachedSearchResults } from "./search-cache";
import { buildSearchSnippet } from "./search-snippet";

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
  snippet?: string | null;
  type?: "post" | "memo"; // 用于前端路由跳转
  cosine?: number;
  rerank?: number;
  final?: number;
};

type KeywordSearchCandidate = {
  slug?: string | null;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  tags?: string | null;
};

function normalizeSearchText(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

function splitSearchTerms(query: string) {
  const terms = normalizeSearchText(query)
    .split(/[\s/._:;,"'()[\]{}<>|-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  return Array.from(new Set(terms));
}

function wordsForSearch(value: string) {
  return Array.from(value.normalize("NFKC").matchAll(/[A-Za-z0-9+#.]+|[\p{Script=Han}]+/gu)).map(
    (match) => match[0]
  );
}

function isFalsePositivePrefix(term: string, word: string) {
  if (term !== "arch") return false;
  return /^(aarch64|archive|archives|archived|search|searched|searching)$/i.test(word);
}

function countTermMatches(value: string, term: string) {
  if (!value || !term) return 0;
  let count = 0;
  for (const word of wordsForSearch(value)) {
    const normalizedWord = normalizeSearchText(word);
    if (normalizedWord === term) {
      count += 1;
      continue;
    }
    if (
      /^[a-z0-9+#.]+$/i.test(term) &&
      normalizedWord.startsWith(term) &&
      normalizedWord.length <= term.length + 16 &&
      !isFalsePositivePrefix(term, normalizedWord)
    ) {
      count += 0.72;
    }
  }
  return count;
}

function countPhraseMatches(value: string, query: string) {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedValue || normalizedQuery.length < 2) return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = normalizedValue.indexOf(normalizedQuery, cursor);
    if (index === -1) return count;
    count += 1;
    cursor = index + normalizedQuery.length;
  }
}

function scoreTextField(value: string, query: string, terms: string[], phraseWeight: number) {
  const isSingleAsciiTerm = terms.length === 1 && /^[a-z0-9+#.]+$/i.test(terms[0] ?? "");
  const phraseScore = isSingleAsciiTerm
    ? 0
    : Math.min(4, countPhraseMatches(value, query)) * phraseWeight;
  const termScore = terms.reduce(
    (score, term) => score + Math.min(8, countTermMatches(value, term)),
    0
  );
  return { phraseScore, termScore };
}

export function scoreKeywordSearchCandidate(query: string, candidate: KeywordSearchCandidate) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return 0;
  const terms = splitSearchTerms(trimmedQuery);
  if (terms.length === 0) return 0;

  const title = candidate.title ?? "";
  const slug = candidate.slug ?? "";
  const excerpt = candidate.excerpt ?? "";
  const body = candidate.body ?? "";
  const tags = candidate.tags ?? "";

  const titleScore = scoreTextField(title, trimmedQuery, terms, 120);
  const excerptScore = scoreTextField(excerpt, trimmedQuery, terms, 42);
  const bodyScore = scoreTextField(body, trimmedQuery, terms, 14);
  const tagScore = scoreTextField(tags, trimmedQuery, terms, 36);
  const slugScore = scoreTextField(slug.replace(/-/g, " "), trimmedQuery, terms, 24);

  const normalizedTitle = normalizeSearchText(title.trim());
  const normalizedQuery = normalizeSearchText(trimmedQuery);
  const titleBonus =
    normalizedTitle === normalizedQuery
      ? 160
      : normalizedTitle.startsWith(normalizedQuery)
        ? 48
        : 0;

  return (
    titleBonus +
    titleScore.phraseScore +
    titleScore.termScore * 34 +
    excerptScore.phraseScore +
    excerptScore.termScore * 14 +
    bodyScore.phraseScore +
    bodyScore.termScore * 3 +
    tagScore.phraseScore +
    tagScore.termScore * 18 +
    slugScore.phraseScore +
    slugScore.termScore * 8
  );
}

function normalizeKeywordScore(score: number) {
  if (score <= 0) return undefined;
  return Math.max(0.12, Math.min(0.98, score / 220));
}

async function keywordFallback(input: SemanticSearchInput): Promise<SearchResult[]> {
  const q = input.q.trim();
  if (!q) return [];

  // Build dynamic condition without using `any` casts

  // 关键字匹配（title/ excerpt/ body）
  const pattern = `%${q}%`;
  const matchCond = or(
    like(posts.title, pattern),
    like(posts.excerpt, pattern),
    like(posts.body, pattern)
  );

  // 发布状态过滤（除非显式传 publishedOnly=false）
  let condition = matchCond;
  if (input.publishedOnly !== false) {
    condition = and(condition, eq(posts.draft, false), eq(posts.public, true));
  }

  // 类型过滤
  if (input.type && input.type !== "all") {
    condition = and(condition, eq(posts.type, input.type));
  } else {
    // 仅在搜索时纳入主要类型
    condition = and(condition, inArray(posts.type, ["post", "memo"]));
  }

  const rows = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      body: posts.body,
      tags: posts.tags,
      type: posts.type,
      publishDate: posts.publishDate,
    })
    .from(posts)
    .where(condition)
    .orderBy(desc(posts.publishDate))
    .limit(Math.max(input.topK ?? 50, 200));

  return rows
    .map((r) => {
      const score = scoreKeywordSearchCandidate(q, r);
      return {
        slug: r.slug,
        title: r.title,
        excerpt: r.excerpt,
        snippet: buildSearchSnippet(q, r),
        type: r.type === "post" || r.type === "memo" ? r.type : undefined,
        final: normalizeKeywordScore(score),
        lexicalScore: score,
        publishDate: r.publishDate ? String(r.publishDate) : "",
      };
    })
    .filter((r) => r.lexicalScore > 0)
    .sort((a, b) => {
      const scoreDiff = b.lexicalScore - a.lexicalScore;
      if (scoreDiff !== 0) return scoreDiff;
      return b.publishDate.localeCompare(a.publishDate);
    })
    .slice(0, input.topK ?? 50)
    .map(({ lexicalScore: _lexicalScore, publishDate: _publishDate, ...result }) => result);
}

async function computeSemantic(input: SemanticSearchInput): Promise<SearchResult[]> {
  const resolved = await getResolvedLlmConfig();
  const model = input.model || resolved.embedding.model || "BAAI/bge-m3";

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
      body: posts.body,
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
      snippet: buildSearchSnippet(input.q, p),
      type: p.type === "post" || p.type === "memo" ? p.type : undefined,
      cosine: scoreBySlug.get(p.slug) ?? 0,
    }));

  results.sort((a, b) => (b.cosine ?? 0) - (a.cosine ?? 0));
  return results.slice(0, input.topK ?? 50);
}

export async function semantic(input: SemanticSearchInput): Promise<SearchResult[]> {
  return getCachedSearchResults("semantic", input, () => computeSemantic(input));
}

async function computeEnhanced(
  input: SemanticSearchInput & { rerankTopK?: number; rerank?: boolean }
) {
  const resolved = await getResolvedLlmConfig();
  const base = await semantic(input);
  const shouldRerank = input.rerank !== false && Boolean(resolved.rerank.model);
  if (!shouldRerank) return base;

  const docs = base
    .slice(0, input.rerankTopK ?? 20)
    .map((r) => `${r.title || r.slug}\n\n${r.excerpt || ""}`);
  try {
    const items = await rerankApi(input.q, docs, {
      model: resolved.rerank.model || undefined,
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

export async function enhanced(
  input: SemanticSearchInput & { rerankTopK?: number; rerank?: boolean }
) {
  return getCachedSearchResults("enhanced", input, () => computeEnhanced(input));
}
