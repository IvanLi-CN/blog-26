import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { buildEmbeddingInput, cosineSimilarity, hashEmbeddingInput } from "@/lib/ai/embeddings";
import { db } from "@/lib/db";
import { postEmbeddings, posts } from "@/lib/schema";
import { searchContent } from "@/lib/search/content-search";
import { ContentSearchError, planNativeQuery } from "@/lib/search/native-query";
import { type SearchReason, searchModeSchema } from "@/lib/search/settings";
import {
  authorizeContent,
  contentResult,
  contentSearchIndex,
  contentVersion,
  type IndexedContent,
  readSearchRows,
} from "./content-search-index";
import type { ResolvedTierConfig } from "./llm-settings";
import {
  embedSearchQuery,
  judgeSearchCandidates,
  rewriteSearchQuery,
  type SearchJudgement,
  SearchModelError,
  type SearchRewrite,
} from "./search-model";
import { resolveSearchPolicy } from "./search-policy";
import { reciprocalRanks, searchContext } from "./search-ranking";
import { planSearchRewrites } from "./search-rewrite";

export const contentSearchInputSchema = z
  .object({
    q: z.string().max(8192),
    mode: searchModeSchema.default("keyword"),
    topK: z.number().int().min(1).max(100).default(20),
    type: z.enum(["all", "post", "memo"]).default("all"),
  })
  .strict();
export type ContentSearchInput = z.infer<typeof contentSearchInputSchema>;
export type ContentSearchEnvelope = {
  results: ReturnType<typeof contentResult>[];
  requestedMode: ContentSearchInput["mode"];
  effectiveMode: ContentSearchInput["mode"];
  reason?: SearchReason;
};
type CacheEntry<T> = { value: T; until: number };
const rewriteCache = new Map<string, CacheEntry<SearchRewrite>>();
const judgementCache = new Map<string, CacheEntry<SearchJudgement>>();
function cacheGet<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const row = cache.get(key);
  if (!row || row.until < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return structuredClone(row.value);
}
function cacheSet<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  if (cache.size >= 128) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value: structuredClone(value), until: Date.now() + 300000 });
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function vectorCandidates(
  query: string,
  embeddingConfig: ResolvedTierConfig,
  limit: number,
  publishedOnly: boolean,
  type: ContentSearchInput["type"]
): Promise<IndexedContent[]> {
  const targetTypes = type === "all" ? ["post", "memo"] : [type];
  const conditions = [
    eq(postEmbeddings.modelName, embeddingConfig.model ?? ""),
    inArray(posts.type, targetTypes),
    eq(posts.type, postEmbeddings.type),
    isNotNull(postEmbeddings.vector),
  ];
  if (publishedOnly) conditions.push(eq(posts.draft, false), eq(posts.public, true));
  const count = await db
    .select({
      count: sql<number>`count(*)`,
      bytes: sql<number>`COALESCE(sum(length(${postEmbeddings.vector})),0)`,
    })
    .from(postEmbeddings)
    .innerJoin(posts, eq(posts.id, postEmbeddings.postId))
    .where(and(...conditions))
    .get();
  if ((count?.count ?? 0) > 10000 || (count?.bytes ?? 0) > 64 * 1024 * 1024)
    throw new SearchModelError("budget-exceeded");
  if (!count?.count) return [];
  const vector = await embedSearchQuery(embeddingConfig, query);
  const scores = new Map<string, number>();
  const hashes = new Map<string, string>();
  let after = "";
  let scanned = 0;
  let scannedBytes = 0;
  while (true) {
    const rows = await db
      .select({
        id: postEmbeddings.id,
        postId: posts.id,
        embeddingHash: postEmbeddings.contentHash,
        vector: postEmbeddings.vector,
        dim: postEmbeddings.dim,
      })
      .from(postEmbeddings)
      .innerJoin(posts, eq(posts.id, postEmbeddings.postId))
      .where(and(...conditions, gt(postEmbeddings.id, after)))
      .orderBy(asc(postEmbeddings.id))
      .limit(200);
    if (!rows.length) break;
    for (const row of rows) {
      scanned++;
      scannedBytes += row.vector instanceof Uint8Array ? row.vector.byteLength : 0;
      if (scanned > 10000 || scannedBytes > 64 * 1024 * 1024)
        throw new SearchModelError("budget-exceeded");
      if (!(row.vector instanceof Uint8Array)) continue;
      const bytes = Buffer.from(row.vector);
      if (bytes.length !== vector.length * 4 || row.dim !== vector.length) continue;
      const stored = Array.from({ length: vector.length }, (_, i) => bytes.readFloatLE(i * 4));
      if (!stored.every(Number.isFinite)) continue;
      const score = cosineSimilarity(vector, stored);
      if (Number.isFinite(score) && score > (scores.get(row.postId) ?? -Infinity)) {
        scores.set(row.postId, score);
        hashes.set(row.postId, row.embeddingHash);
      }
    }
    after = rows.at(-1)?.id ?? after;
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const result: IndexedContent[] = [];
  for (let offset = 0; offset < ranked.length && result.length < limit; offset += 100) {
    const page = ranked.slice(offset, offset + 100);
    const rows = await readSearchRows(page.map(([id]) => id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const [id, score] of page) {
      const row = byId.get(id);
      if (
        row &&
        hashes.get(id) === hashEmbeddingInput(buildEmbeddingInput(row)) &&
        (await authorizeContent(row, publishedOnly))
      )
        result.push({ row, version: contentVersion(row), score });
      if (result.length === limit) break;
    }
  }
  return result;
}
async function current(candidates: IndexedContent[], publishedOnly: boolean) {
  if (!candidates.length) return candidates;
  const rows = await readSearchRows(candidates.map((x) => x.row.id));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const candidate of candidates) {
    const row = byId.get(candidate.row.id);
    if (
      !row ||
      candidate.version !== contentVersion(row) ||
      !(await authorizeContent(row, publishedOnly))
    )
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-content-changed");
  }
  return candidates;
}
function mergeProtected(
  keyword: IndexedContent[],
  supplements: IndexedContent[],
  limit: number,
  order: (a: IndexedContent, b: IndexedContent) => number
) {
  const protectedIds = new Set(keyword.map((x) => x.row.id));
  const protectedRoutes = new Set(keyword.map((x) => `${x.row.type}:${x.row.slug}`));
  const candidates = [...keyword];
  for (const candidate of supplements) {
    const key = `${candidate.row.type}:${candidate.row.slug}`;
    if (protectedIds.has(candidate.row.id) || protectedRoutes.has(key)) continue;
    protectedRoutes.add(key);
    candidates.push(candidate);
  }
  if (keyword.length >= limit) return keyword.slice(0, limit);

  // Use one relevance order for literal and AI candidates. Literal results
  // remain protected: when the limit is reached, an AI candidate gives its
  // slot back to any omitted literal result.
  const ranked = candidates.sort(order);
  const selected = ranked.slice(0, limit);
  const selectedIds = new Set(selected.map((x) => x.row.id));
  for (const literal of keyword) {
    if (selectedIds.has(literal.row.id)) continue;
    const replaceIndex = selected.findIndex((candidate) => !protectedIds.has(candidate.row.id));
    if (replaceIndex < 0) break;
    selectedIds.delete(selected[replaceIndex]?.row.id ?? "");
    selected[replaceIndex] = literal;
    selectedIds.add(literal.row.id);
  }
  return selected.sort(order);
}

export async function executeContentModes(
  raw: unknown,
  context: { publishedOnly?: boolean; embeddingModel?: string; candidateLimit?: number } = {}
): Promise<ContentSearchEnvelope> {
  const input = contentSearchInputSchema.parse(raw);
  if (!input.q.trim()) {
    return {
      results: [],
      requestedMode: input.mode,
      effectiveMode: "keyword",
      reason: "empty-query",
    };
  }
  const publishedOnly = context.publishedOnly !== false;
  // Preserve the legacy SQLite query contract for callers that still use NEAR.
  // Tantivy remains the default engine for the new simple-query surface.
  if (/(?:^|[\s(:])NEAR\s*\(/iu.test(input.q.replace(/"(?:\\.|[^"\\])*"/gu, ""))) {
    const legacy = await searchContent({
      q: input.q,
      topK: input.topK,
      type: input.type,
      publishedOnly,
    });
    return {
      results: legacy.map((item) => ({ ...item, searchOrigin: "keyword" as const })),
      requestedMode: input.mode,
      effectiveMode: "keyword",
      reason: "explicit-query",
    };
  }
  const plan = planNativeQuery(input.q);
  const index = await contentSearchIndex();
  const keyword = await index.search(input.q, {
    limit: input.topK,
    type: input.type,
    publishedOnly,
  });
  const keywordResult = async (reason?: SearchReason): Promise<ContentSearchEnvelope> => ({
    results: (await current(keyword, publishedOnly)).map((x) =>
      contentResult(x, input.q, "keyword")
    ),
    requestedMode: input.mode,
    effectiveMode: "keyword",
    ...(reason ? { reason } : {}),
  });
  if (plan.mode !== "simple") return keywordResult("explicit-query");
  if (input.mode === "keyword") return keywordResult();
  const resolved = await resolveSearchPolicy(input.mode);
  if (resolved.reason) return keywordResult(resolved.reason);
  if (!resolved.chat || !resolved.fingerprint || !resolved.resolved)
    return keywordResult("unconfigured");
  if (context.embeddingModel && context.embeddingModel !== resolved.resolved.embedding.model)
    return keywordResult("unvalidated");
  try {
    let result: IndexedContent[];
    const snippetQueries = new Map<string, string>();
    if (input.mode === "rewrite") {
      const policy = resolved.policy;
      const key = digest({ query: plan.query, fingerprint: resolved.fingerprint });
      let output = cacheGet(rewriteCache, key);
      if (!output) {
        output = await rewriteSearchQuery(resolved.chat, policy, plan.query);
      }
      const maxQueries = "maxQueries" in policy ? policy.maxQueries : 3;
      const supplements: IndexedContent[] = [];
      const lists = [keyword];
      for (const { query } of planSearchRewrites(plan.query, output.queries, maxQueries)) {
        const matches = await index.search(query, {
          limit: input.topK,
          type: input.type,
          publishedOnly,
          aliases: false,
        });
        lists.push(matches);
        for (const item of matches) {
          snippetQueries.set(item.row.id, query);
          supplements.push(item);
        }
      }
      cacheSet(rewriteCache, key, output);
      const ranks = reciprocalRanks(lists, (item) => item.row.id);
      result = mergeProtected(
        keyword,
        supplements,
        input.topK,
        (a, b) =>
          (ranks.get(b.row.id) ?? 0) - (ranks.get(a.row.id) ?? 0) ||
          a.row.id.localeCompare(b.row.id)
      );
    } else {
      const policy = resolved.policy;
      const candidateLimit =
        context.candidateLimit ?? ("candidateLimit" in policy ? policy.candidateLimit : 20);
      const contentCodePoints = "contentCodePoints" in policy ? policy.contentCodePoints : 2048;
      const vectors =
        keyword.length >= input.topK
          ? []
          : await vectorCandidates(
              plan.query,
              resolved.resolved.embedding,
              candidateLimit,
              publishedOnly,
              input.type
            );
      const candidates = [...keyword];
      const seen = new Set(keyword.map((x) => x.row.id));
      for (const item of vectors)
        if (!seen.has(item.row.id)) {
          seen.add(item.row.id);
          candidates.push(item);
        }
      const contextual: IndexedContent[] = [];
      // Runtime-only Node is a contextual supplement. Retrieval broadening is RAG-only.
      if (/^(?:nodejs|node\.js)$/iu.test(plan.query) && keyword.length < input.topK) {
        for (const item of await index.search("Node", {
          limit: candidateLimit,
          type: input.type,
          publishedOnly,
          aliases: false,
        })) {
          if (!seen.has(item.row.id)) {
            seen.add(item.row.id);
            candidates.push(item);
          }
          contextual.push(item);
        }
      }
      const candidateRanks = reciprocalRanks([keyword, vectors, contextual], (item) => item.row.id);
      const windows = candidates
        .sort(
          (a, b) =>
            (candidateRanks.get(b.row.id) ?? 0) - (candidateRanks.get(a.row.id) ?? 0) ||
            a.row.id.localeCompare(b.row.id)
        )
        .slice(0, candidateLimit);
      await current(windows, publishedOnly);
      const payload = windows.map((x) => ({
        id: x.row.id,
        title: x.row.title,
        content: searchContext(plan.query, x.row, contentCodePoints),
      }));
      const key = digest({
        query: plan.query,
        fingerprint: resolved.fingerprint,
        windows: windows.map((x) => [x.row.id, x.version]),
        payload,
      });
      let output = cacheGet(judgementCache, key);
      if (!output) {
        output = await judgeSearchCandidates(resolved.chat, policy, plan.query, payload);
      }
      const supplied = new Set(windows.map((x) => x.row.id));
      if (
        output.items.length !== windows.length ||
        new Set(output.items.map((x) => x.id)).size !== supplied.size ||
        output.items.some((x) => !supplied.has(x.id))
      )
        throw new SearchModelError("invalid-output");
      cacheSet(judgementCache, key, output);
      const judgments = new Map(output.items.map((x) => [x.id, x]));
      const supplements = windows.filter((x) => judgments.get(x.row.id)?.relevant);
      result = mergeProtected(
        keyword,
        supplements,
        input.topK,
        (a, b) =>
          (judgments.get(a.row.id)?.rank ?? 101) - (judgments.get(b.row.id)?.rank ?? 101) ||
          (b.row.publishDate ?? 0) - (a.row.publishDate ?? 0) ||
          a.row.id.localeCompare(b.row.id)
      );
    }
    if ((await resolveSearchPolicy(input.mode)).fingerprint !== resolved.fingerprint)
      return keywordResult("unvalidated");
    await current(result, publishedOnly);
    const keywordIds = new Set(keyword.map((x) => x.row.id));
    return {
      results: result.map((x) =>
        contentResult(
          x,
          snippetQueries.get(x.row.id) ?? input.q,
          keywordIds.has(x.row.id) ? "keyword" : "ai"
        )
      ),
      requestedMode: input.mode,
      effectiveMode: input.mode,
    };
  } catch (error) {
    if (error instanceof ContentSearchError) throw error;
    return keywordResult(error instanceof SearchModelError ? error.reason : "unavailable");
  }
}
