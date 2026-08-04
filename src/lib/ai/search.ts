import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getResolvedLlmConfig } from "@/server/services/llm-settings";
import { db } from "../db";
import { postEmbeddings, posts } from "../schema";
import { searchContent } from "../search/content-search";
import { parseSearchQuery } from "../search/query";
import { cosineSimilarity, createEmbedding } from "./embeddings";
import { rerank as rerankApi } from "./rerank";
import { getCachedSearchExecution, type SearchCacheLoadResult } from "./search-cache";
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

async function keywordFallback(input: SemanticSearchInput): Promise<SearchResult[]> {
  return searchContent(input);
}

type SemanticExecution = {
  results: SearchResult[];
  source: "semantic" | "fts";
};

const MAX_SEMANTIC_VECTOR_ROWS = 10_000;

async function computeSemantic(input: SemanticSearchInput): Promise<SemanticExecution> {
  const fallback = async (): Promise<SemanticExecution> => ({
    results: await keywordFallback(input),
    source: "fts",
  });

  // Advanced syntax must be enforced by the controlled FTS compiler. Semantic
  // embeddings cannot preserve field, boolean, phrase, prefix, or literal-retry semantics.
  if (parseSearchQuery(input.q).mode !== "simple") return fallback();

  let resolved: Awaited<ReturnType<typeof getResolvedLlmConfig>>;
  try {
    resolved = await getResolvedLlmConfig();
  } catch {
    return fallback();
  }
  const model = input.model || resolved.embedding.model || "BAAI/bge-m3";
  const targetTypes =
    input.type && input.type !== "all" ? [input.type] : (["post", "memo"] as const);
  const vectorConditions = [
    eq(postEmbeddings.modelName, model),
    inArray(postEmbeddings.type, targetTypes),
    eq(posts.type, postEmbeddings.type),
    isNotNull(postEmbeddings.vector),
  ];
  if (input.publishedOnly !== false) {
    vectorConditions.push(eq(posts.draft, false), eq(posts.public, true));
  }

  try {
    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(postEmbeddings)
      .innerJoin(posts, eq(postEmbeddings.slug, posts.slug))
      .where(and(...vectorConditions));
    const vectorRowCount = countRows[0]?.count ?? 0;
    if (vectorRowCount === 0 || vectorRowCount > MAX_SEMANTIC_VECTOR_ROWS) {
      return fallback();
    }
  } catch {
    return fallback();
  }

  let qv: number[];
  try {
    const { vector } = await createEmbedding(input.q, model);
    qv = vector;
  } catch {
    return fallback();
  }

  let eb: Array<{ slug: string; vector: Buffer | null }>;
  try {
    eb = (await db
      .select({ slug: postEmbeddings.slug, vector: postEmbeddings.vector })
      .from(postEmbeddings)
      .innerJoin(posts, eq(postEmbeddings.slug, posts.slug))
      .where(and(...vectorConditions))) as Array<{
      slug: string;
      vector: Buffer | null;
    }>;
  } catch {
    return fallback();
  }

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
  if (slugs.length === 0) return fallback();
  const postConditions = [inArray(posts.slug, slugs), inArray(posts.type, targetTypes)];
  if (input.publishedOnly !== false) {
    postConditions.push(eq(posts.draft, false), eq(posts.public, true));
  }
  const postsRows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      body: posts.body,
      draft: posts.draft,
      public: posts.public,
      type: posts.type,
      publishDate: posts.publishDate,
    })
    .from(posts)
    .where(and(...postConditions));
  if (postsRows.length === 0) return fallback();

  const rankedResults = postsRows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    snippet: buildSearchSnippet(input.q, p),
    type: p.type === "post" || p.type === "memo" ? p.type : undefined,
    cosine: scoreBySlug.get(p.slug) ?? 0,
    publishDate: p.publishDate,
  }));

  rankedResults.sort((a, b) => {
    const cosineDiff = (b.cosine ?? 0) - (a.cosine ?? 0);
    if (cosineDiff !== 0) return cosineDiff;
    const publishDateDiff = b.publishDate - a.publishDate;
    if (publishDateDiff !== 0) return publishDateDiff;
    return b.id.localeCompare(a.id);
  });

  const results: SearchResult[] = rankedResults
    .slice(0, input.topK ?? 50)
    .map(({ id: _id, publishDate: _publishDate, ...result }) => result);
  return { results, source: "semantic" };
}

async function getSemanticExecution(input: SemanticSearchInput): Promise<SemanticExecution> {
  const execution = await getCachedSearchExecution("semantic", input, async () => {
    const execution = await computeSemantic(input);
    return {
      results: execution.results,
      source: execution.source,
      cacheable: execution.source === "semantic",
    };
  });
  return {
    results: execution.results,
    source: execution.source === "fts" ? "fts" : "semantic",
  };
}

export async function semantic(input: SemanticSearchInput): Promise<SearchResult[]> {
  return (await getSemanticExecution(input)).results;
}

async function computeEnhanced(
  input: SemanticSearchInput & { rerankTopK?: number; rerank?: boolean }
): Promise<SearchCacheLoadResult> {
  const semanticExecution = await getSemanticExecution(input);
  const base = semanticExecution.results;
  if (semanticExecution.source === "fts") {
    return { results: base, source: "fts", cacheable: false };
  }

  let resolved: Awaited<ReturnType<typeof getResolvedLlmConfig>>;
  try {
    resolved = await getResolvedLlmConfig();
  } catch {
    return { results: base, source: "semantic", cacheable: false };
  }

  const shouldRerank = input.rerank !== false && Boolean(resolved.rerank.model);
  if (!shouldRerank) return { results: base, source: "semantic", cacheable: true };

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

    return {
      results: base
        .map((r, i) => {
          const rr = items.find((it) => it.index === i)?.score ?? 0;
          const final = (alpha * ((r.cosine ?? 0) + 1)) / 2 + beta * norm(rr);
          return { ...r, rerank: rr, final };
        })
        .sort((a, b) => (b.final ?? 0) - (a.final ?? 0)),
      source: "enhanced",
      cacheable: true,
    };
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: unknown }).code
        : "unknown";
    console.warn("[search] reranker unavailable; using semantic results", { code });
    return { results: base, source: "semantic", cacheable: false };
  }
}

export async function enhanced(
  input: SemanticSearchInput & { rerankTopK?: number; rerank?: boolean }
) {
  return (await getCachedSearchExecution("enhanced", input, () => computeEnhanced(input))).results;
}
