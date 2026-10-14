import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { buildEmbeddingInput, cosineSimilarity, hashEmbeddingInput } from "@/lib/ai/embeddings";
import type { SearchResult } from "@/lib/ai/search";
import { db } from "@/lib/db";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import type { PlaybookEdition } from "@/lib/playbook/types";
import { postEmbeddings, posts } from "@/lib/schema";
import { isClippingSearchMemo, searchContent } from "@/lib/search/content-search";
import { ContentSearchError, planNativeQuery } from "@/lib/search/native-query";
import { parseSearchQuery } from "@/lib/search/query";
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
  type PlaybookSearchCandidate,
  type PlaybookSearchType,
  playbookCandidateContext,
  playbookCandidateKey,
  playbookSearchResult,
  searchPlaybookCandidates,
} from "./playbook-search";
import { ragCoverage } from "./rag-index";
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
import { semanticPlaybookCandidates } from "./search-semantic-projection";

export const contentSearchInputObjectSchema = z
  .object({
    q: z.string().max(8192),
    mode: searchModeSchema.default("keyword"),
    topK: z.number().int().min(1).max(100).default(20),
    source: z.enum(["all", "blog", "playbook"]).default("all"),
    type: z
      .enum(["all", "post", "memo", "clipping", "topic", "experience", "policy"])
      .default("all"),
    edition: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    sourceReleaseId: z
      .string()
      .regex(/^[1-9]\d*$/u)
      .optional(),
    sourceTag: z
      .string()
      .regex(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u)
      .optional(),
  })
  .strict();
export const contentSearchInputSchema = contentSearchInputObjectSchema.refine(
  (value) =>
    (value.edition === undefined &&
      value.sourceReleaseId === undefined &&
      value.sourceTag === undefined) ||
    (value.edition !== undefined &&
      value.sourceReleaseId !== undefined &&
      value.sourceTag !== undefined),
  { message: "edition, sourceReleaseId and sourceTag must be provided together" }
);
export type ContentSearchInput = z.infer<typeof contentSearchInputSchema>;
export type ContentSearchEnvelope = {
  results: Array<ReturnType<typeof contentResult> | ReturnType<typeof playbookSearchResult>>;
  requestedMode: ContentSearchInput["mode"];
  effectiveMode: ContentSearchInput["mode"];
  reason?: SearchReason;
  playbook?: { edition: string; sourceReleaseId: string; sourceTag: string };
  incompleteSources?: string[];
  ragIncompleteSources?: string[];
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
  type: "all" | "post" | "memo" | "clipping"
): Promise<IndexedContent[]> {
  const { eligibleVectorIds } = await ragCoverage({
    source: "blog",
    type,
    publishedOnly,
    config: embeddingConfig,
  });
  if (!eligibleVectorIds.size) return [];
  const targetTypes = type === "all" ? ["post", "memo"] : [type === "clipping" ? "memo" : type];
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
      if (!eligibleVectorIds.has(row.id) || !(row.vector instanceof Uint8Array)) continue;
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

type UnifiedCandidate = IndexedContent | PlaybookSearchCandidate;
function isPlaybookCandidate(candidate: UnifiedCandidate): candidate is PlaybookSearchCandidate {
  return "source" in candidate && candidate.source === "playbook";
}
function unifiedId(candidate: UnifiedCandidate) {
  return isPlaybookCandidate(candidate) ? playbookCandidateKey(candidate) : candidate.row.id;
}
function unifiedRoute(candidate: UnifiedCandidate) {
  return isPlaybookCandidate(candidate)
    ? `${candidate.type}:${candidate.slug}`
    : `${candidate.row.type}:${candidate.row.slug}`;
}
function unifiedVersion(candidate: UnifiedCandidate) {
  return isPlaybookCandidate(candidate) ? candidate.version : candidate.version;
}
function unifiedTitle(candidate: UnifiedCandidate) {
  return isPlaybookCandidate(candidate) ? candidate.title : candidate.row.title;
}
function unifiedPublishDate(candidate: UnifiedCandidate) {
  return isPlaybookCandidate(candidate) ? 0 : candidate.row.publishDate;
}
async function currentUnified(
  candidates: UnifiedCandidate[],
  publishedOnly: boolean,
  edition?: PlaybookEdition
) {
  const blog = candidates.filter(
    (candidate): candidate is IndexedContent => !isPlaybookCandidate(candidate)
  );
  if (blog.length) await current(blog, publishedOnly);
  for (const candidate of candidates) {
    if (!isPlaybookCandidate(candidate)) continue;
    if (
      !edition ||
      candidate.edition.edition !== edition.edition.editionDigest ||
      candidate.edition.sourceReleaseId !== edition.edition.source.releaseId ||
      candidate.edition.sourceTag !== edition.edition.source.tag
    )
      throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-playbook-changed");
  }
  return candidates;
}
function mergeProtected(
  keyword: UnifiedCandidate[],
  supplements: UnifiedCandidate[],
  limit: number,
  order: (a: UnifiedCandidate, b: UnifiedCandidate) => number
) {
  const protectedIds = new Set(keyword.map(unifiedId));
  const protectedRoutes = new Set(keyword.map(unifiedRoute));
  const candidates = [...keyword];
  for (const candidate of supplements) {
    const key = unifiedRoute(candidate);
    if (protectedIds.has(unifiedId(candidate)) || protectedRoutes.has(key)) continue;
    protectedRoutes.add(key);
    candidates.push(candidate);
  }
  if (keyword.length >= limit) return keyword.slice(0, limit);

  // Use one relevance order for literal and AI candidates. Literal results
  // remain protected: when the limit is reached, an AI candidate gives its
  // slot back to any omitted literal result.
  const ranked = candidates.sort(order);
  const selected = ranked.slice(0, limit);
  const selectedIds = new Set(selected.map(unifiedId));
  for (const literal of keyword) {
    if (selectedIds.has(unifiedId(literal))) continue;
    const replaceIndex = selected.findIndex((candidate) => !protectedIds.has(unifiedId(candidate)));
    if (replaceIndex < 0) break;
    selectedIds.delete(selected[replaceIndex] ? unifiedId(selected[replaceIndex]) : "");
    selected[replaceIndex] = literal;
    selectedIds.add(unifiedId(literal));
  }
  return selected.sort(order);
}

function wantsBlog(type: ContentSearchInput["type"]) {
  return type === "all" || type === "post" || type === "memo" || type === "clipping";
}
function wantsPlaybook(type: ContentSearchInput["type"]) {
  return type === "all" || type === "topic" || type === "experience" || type === "policy";
}
function blogType(type: ContentSearchInput["type"]): "all" | "post" | "memo" {
  return type === "post" ? "post" : type === "memo" || type === "clipping" ? "memo" : "all";
}
function playbookType(type: ContentSearchInput["type"]): "all" | PlaybookSearchType {
  return type === "topic" || type === "experience" || type === "policy" ? type : "all";
}

async function resolvePlaybookEdition(input: ContentSearchInput) {
  if (!wantsPlaybook(input.type) || input.source === "blog") return undefined;
  const store = getRuntimePlaybookStore();
  await store.load();
  const selected =
    input.edition && input.sourceReleaseId && input.sourceTag
      ? store.getEdition(input.edition, input.sourceReleaseId, input.sourceTag)
      : store.current;
  if (selected) return selected;
  if (input.edition) throw new ContentSearchError("CONFLICT", "search-playbook-edition-unknown");
  if (input.source === "playbook") {
    throw new ContentSearchError("SERVICE_UNAVAILABLE", "search-playbook-edition-unavailable");
  }
  return undefined;
}

function playbookMetadata(edition?: PlaybookEdition) {
  return edition
    ? {
        edition: edition.edition.editionDigest,
        sourceReleaseId: edition.edition.source.releaseId,
        sourceTag: edition.edition.source.tag,
      }
    : undefined;
}

async function keywordCandidates(
  input: ContentSearchInput,
  query: string,
  publishedOnly: boolean,
  edition?: PlaybookEdition,
  limit = Math.min(1000, Math.max(100, input.topK * 5))
) {
  const blog: IndexedContent[] = [];
  const playbook: PlaybookSearchCandidate[] = [];
  if (input.source !== "playbook" && wantsBlog(input.type)) {
    const index = await contentSearchIndex();
    const rows = await index.search(query, {
      limit,
      type: blogType(input.type),
      publishedOnly,
    });
    blog.push(
      ...rows.filter(
        (candidate) =>
          input.type !== "clipping" || isClippingSearchMemo(candidate.row.type, candidate.row.tags)
      )
    );
  }
  if (input.source !== "blog" && wantsPlaybook(input.type) && edition)
    playbook.push(
      ...searchPlaybookCandidates(edition, query, { limit, type: playbookType(input.type) })
    );
  return { blog, playbook };
}

function mergeKeywordCandidates(
  blog: IndexedContent[],
  playbook: PlaybookSearchCandidate[],
  limit: number
): UnifiedCandidate[] {
  const lists: UnifiedCandidate[][] = [blog, playbook];
  if (!blog.length) return playbook.slice(0, limit);
  if (!playbook.length) return blog.slice(0, limit);
  const ranks = reciprocalRanks(lists, unifiedId);
  const candidates = [...blog, ...playbook];
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      const id = unifiedId(candidate);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort(
      (a, b) =>
        (ranks.get(unifiedId(b)) ?? 0) - (ranks.get(unifiedId(a)) ?? 0) ||
        unifiedId(a).localeCompare(unifiedId(b))
    )
    .slice(0, limit);
}

function resultForCandidate(candidate: UnifiedCandidate, query: string, origin: "keyword" | "ai") {
  return isPlaybookCandidate(candidate)
    ? playbookSearchResult(candidate, query, origin)
    : contentResult(candidate, query, origin);
}

type NearCandidate = SearchResult | PlaybookSearchCandidate;
function isPlaybookNearCandidate(candidate: NearCandidate): candidate is PlaybookSearchCandidate {
  return "source" in candidate && candidate.source === "playbook";
}
function nearCandidateKey(candidate: NearCandidate) {
  return isPlaybookNearCandidate(candidate)
    ? playbookCandidateKey(candidate)
    : `blog:${candidate.type ?? "post"}:${candidate.slug}`;
}

async function keywordNearEnvelope(
  input: ContentSearchInput,
  publishedOnly: boolean,
  edition: PlaybookEdition | undefined,
  metadata: ContentSearchEnvelope["playbook"],
  incompleteSources: string[]
): Promise<ContentSearchEnvelope> {
  const limit = Math.min(1000, Math.max(100, input.topK * 5));
  const blog =
    input.source !== "playbook" && wantsBlog(input.type)
      ? await searchContent({
          q: input.q,
          topK: limit,
          type: blogType(input.type),
          publishedOnly,
        })
      : [];
  const filteredBlog =
    input.type === "clipping"
      ? blog.filter((item) => item.type === "memo" && item.isClipping)
      : blog;
  const visibleBlog =
    publishedOnly && filteredBlog.length
      ? await (async () => {
          const memoIds = [
            ...new Set(
              filteredBlog
                .filter((item) => item.type === "memo")
                .map((item) => item.id)
                .filter((id): id is string => Boolean(id))
            ),
          ];
          if (!memoIds.length) return filteredBlog;
          const rows = await db
            .select()
            .from(posts)
            .where(and(eq(posts.type, "memo"), inArray(posts.id, memoIds)));
          const visible = new Map(
            await Promise.all(
              rows.map(async (row) => [row.id, await authorizeContent(row, true)] as const)
            )
          );
          return filteredBlog.filter(
            (item) => item.type !== "memo" || visible.get(item.id ?? "") === true
          );
        })()
      : filteredBlog;
  const playbook =
    input.source !== "blog" && wantsPlaybook(input.type) && edition
      ? searchPlaybookCandidates(edition, input.q, {
          limit,
          type: playbookType(input.type),
        })
      : [];
  const lists: NearCandidate[][] = [visibleBlog, playbook];
  const ranks = reciprocalRanks(lists, nearCandidateKey);
  const seen = new Set<string>();
  const merged = [...visibleBlog, ...playbook]
    .filter((candidate) => {
      const key = nearCandidateKey(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        (ranks.get(nearCandidateKey(b)) ?? 0) - (ranks.get(nearCandidateKey(a)) ?? 0) ||
        nearCandidateKey(a).localeCompare(nearCandidateKey(b))
    )
    .slice(0, input.topK);
  return {
    results: merged.map((candidate) =>
      isPlaybookNearCandidate(candidate)
        ? playbookSearchResult(candidate, input.q, "keyword")
        : { ...candidate, searchOrigin: "keyword" as const }
    ),
    requestedMode: input.mode,
    effectiveMode: "keyword",
    reason: "explicit-query",
    ...(metadata ? { playbook: metadata } : {}),
    ...(incompleteSources.length ? { incompleteSources } : {}),
  };
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
  const edition = await resolvePlaybookEdition(input);
  const incompleteSources =
    input.source !== "playbook" && wantsPlaybook(input.type) && !edition ? ["playbook"] : [];
  const metadata = edition ? { playbook: playbookMetadata(edition) } : {};
  const keywordState = async (query = input.q) => {
    const state = await keywordCandidates(input, query, publishedOnly, edition);
    const merged = mergeKeywordCandidates(state.blog, state.playbook, input.topK * 5);
    await currentUnified(merged, publishedOnly, edition);
    return { ...state, merged };
  };
  let ragIncompleteSources: string[] = [];
  let coverageIdentity: unknown;
  const keywordEnvelope = async (reason?: SearchReason): Promise<ContentSearchEnvelope> => {
    const state = await keywordState();
    return {
      results: state.merged
        .slice(0, input.topK)
        .map((candidate) => resultForCandidate(candidate, input.q, "keyword")),
      requestedMode: input.mode,
      effectiveMode: "keyword",
      ...(reason ? { reason } : {}),
      ...(metadata.playbook ? { playbook: metadata.playbook } : {}),
      ...(incompleteSources.length ? { incompleteSources } : {}),
      ...(ragIncompleteSources.length ? { ragIncompleteSources } : {}),
    };
  };
  // Preserve the legacy SQLite query contract for callers that still use NEAR.
  // Tantivy remains the default engine for the new simple-query surface.
  if (
    /(?:^|[\s(:])NEAR\s*\(/iu.test(input.q.normalize("NFKC").replace(/"(?:\\.|[^"\\])*"/gu, ""))
  ) {
    if (parseSearchQuery(input.q).limitExceeded)
      throw new ContentSearchError("BAD_REQUEST", "query-budget-exceeded");
    return keywordNearEnvelope(input, publishedOnly, edition, metadata.playbook, incompleteSources);
  }
  const plan = planNativeQuery(input.q);
  if (plan.mode !== "simple") return keywordEnvelope("explicit-query");
  if (input.mode === "keyword") return keywordEnvelope();
  const resolved = await resolveSearchPolicy(input.mode);
  if (input.mode === "rag") {
    const coverage = await ragCoverage({
      source: input.source,
      type: input.type,
      publishedOnly,
      playbook: edition ?? null,
      config: resolved.resolved?.embedding,
    });
    ragIncompleteSources = coverage.status.incompleteSources;
    coverageIdentity = {
      identity: coverage.status.identity,
      targets: coverage.status.details.map((row) => [row.id, row.state, row.indexedAt]),
    };
  }
  if (resolved.reason) return keywordEnvelope(resolved.reason);
  if (!resolved.chat || !resolved.fingerprint || !resolved.resolved)
    return keywordEnvelope("unconfigured");
  if (context.embeddingModel && context.embeddingModel !== resolved.resolved.embedding.model)
    return keywordEnvelope("unvalidated");
  try {
    const keyword = await keywordState();
    const literal = keyword.merged;
    let result: UnifiedCandidate[];
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
      const lists: UnifiedCandidate[][] = [literal];
      for (const { query } of planSearchRewrites(plan.query, output.queries, maxQueries)) {
        if (input.source === "playbook" || !wantsBlog(input.type)) continue;
        const matches = await keywordCandidates(
          { ...input, source: "blog" },
          query,
          publishedOnly,
          undefined,
          Math.min(1000, Math.max(100, input.topK * 5))
        );
        lists.push(matches.blog);
        for (const item of matches.blog) {
          snippetQueries.set(item.row.id, query);
          supplements.push(item);
        }
      }
      cacheSet(rewriteCache, key, output);
      const ranks = reciprocalRanks(lists, unifiedId);
      result = mergeProtected(
        literal,
        supplements,
        input.topK,
        (a, b) =>
          (ranks.get(unifiedId(b)) ?? 0) - (ranks.get(unifiedId(a)) ?? 0) ||
          unifiedId(a).localeCompare(unifiedId(b))
      );
    } else {
      const policy = resolved.policy;
      const candidateLimit =
        context.candidateLimit ?? ("candidateLimit" in policy ? policy.candidateLimit : 20);
      const contentCodePoints = "contentCodePoints" in policy ? policy.contentCodePoints : 2048;
      const blogInputType = blogType(input.type);
      const vectors =
        literal.length >= input.topK || input.source === "playbook" || !wantsBlog(input.type)
          ? []
          : await vectorCandidates(
              plan.query,
              resolved.resolved.embedding,
              candidateLimit,
              publishedOnly,
              input.type === "clipping" ? "clipping" : blogInputType
            );
      const playbookVectors =
        edition &&
        input.source !== "blog" &&
        wantsPlaybook(input.type) &&
        literal.length < input.topK
          ? await semanticPlaybookCandidates(
              plan.query,
              resolved.resolved.embedding,
              edition,
              candidateLimit,
              playbookType(input.type)
            )
          : [];
      const candidates: UnifiedCandidate[] = [...literal];
      const seen = new Set(literal.map(unifiedId));
      for (const item of vectors)
        if (!seen.has(unifiedId(item))) {
          seen.add(unifiedId(item));
          candidates.push(item);
        }
      for (const item of playbookVectors)
        if (!seen.has(unifiedId(item))) {
          seen.add(unifiedId(item));
          candidates.push(item);
        }
      const contextual: IndexedContent[] = [];
      // Runtime-only Node is a contextual supplement. Retrieval broadening is RAG-only.
      if (
        /^(?:nodejs|node\.js)$/iu.test(plan.query) &&
        literal.length < input.topK &&
        wantsBlog(input.type)
      ) {
        const contextualMatches = await keywordCandidates(
          { ...input, source: "blog" },
          "Node",
          publishedOnly,
          undefined,
          candidateLimit
        );
        for (const item of contextualMatches.blog) {
          if (!seen.has(unifiedId(item))) {
            seen.add(unifiedId(item));
            candidates.push(item);
          }
          contextual.push(item);
        }
      }
      const candidateRanks = reciprocalRanks(
        [literal, vectors, playbookVectors, contextual],
        unifiedId
      );
      const windows = candidates
        .sort(
          (a, b) =>
            (candidateRanks.get(unifiedId(b)) ?? 0) - (candidateRanks.get(unifiedId(a)) ?? 0) ||
            unifiedId(a).localeCompare(unifiedId(b))
        )
        .slice(0, candidateLimit);
      await currentUnified(windows, publishedOnly, edition);
      const payload = windows.map((x) => ({
        id: unifiedId(x),
        title: unifiedTitle(x),
        content: isPlaybookCandidate(x)
          ? playbookCandidateContext(x, plan.query, contentCodePoints).content
          : searchContext(plan.query, x.row, contentCodePoints),
        ...(isPlaybookCandidate(x)
          ? playbookCandidateContext(x, plan.query, contentCodePoints)
          : {
              source: "blog",
              type: x.row.type,
              path: `${x.row.type}/${x.row.slug}`,
              location: "content",
            }),
      }));
      const key = digest({
        query: plan.query,
        fingerprint: resolved.fingerprint,
        coverageIdentity,
        windows: windows.map((x) => [unifiedId(x), unifiedVersion(x)]),
        payload,
      });
      let output = cacheGet(judgementCache, key);
      if (!output) {
        output = await judgeSearchCandidates(resolved.chat, policy, plan.query, payload);
      }
      const supplied = new Set(windows.map(unifiedId));
      if (
        output.items.length !== windows.length ||
        new Set(output.items.map((x) => x.id)).size !== supplied.size ||
        output.items.some((x) => !supplied.has(x.id))
      )
        throw new SearchModelError("invalid-output");
      cacheSet(judgementCache, key, output);
      const judgments = new Map(output.items.map((x) => [x.id, x]));
      const supplements = windows.filter((x) => judgments.get(unifiedId(x))?.relevant);
      const judged = [...supplements].sort(
        (a, b) =>
          (judgments.get(unifiedId(a))?.rank ?? 101) - (judgments.get(unifiedId(b))?.rank ?? 101)
      );
      const judgedRanks = reciprocalRanks([judged], unifiedId);
      result = mergeProtected(
        literal,
        supplements,
        input.topK,
        (a, b) =>
          (judgedRanks.get(unifiedId(b)) ?? 0) * 2 - (judgedRanks.get(unifiedId(a)) ?? 0) * 2 ||
          (candidateRanks.get(unifiedId(b)) ?? 0) - (candidateRanks.get(unifiedId(a)) ?? 0) ||
          unifiedPublishDate(b) - unifiedPublishDate(a) ||
          unifiedId(a).localeCompare(unifiedId(b))
      );
    }
    if ((await resolveSearchPolicy(input.mode)).fingerprint !== resolved.fingerprint)
      return keywordEnvelope("unvalidated");
    await currentUnified(result, publishedOnly, edition);
    const keywordIds = new Set(literal.map(unifiedId));
    return {
      results: result.map((x) =>
        resultForCandidate(
          x,
          isPlaybookCandidate(x) ? input.q : (snippetQueries.get(x.row.id) ?? input.q),
          keywordIds.has(unifiedId(x)) ? "keyword" : "ai"
        )
      ),
      requestedMode: input.mode,
      effectiveMode: input.mode,
      ...(metadata.playbook ? { playbook: metadata.playbook } : {}),
      ...(incompleteSources.length ? { incompleteSources } : {}),
      ...(ragIncompleteSources.length ? { ragIncompleteSources } : {}),
    };
  } catch (error) {
    if (error instanceof ContentSearchError) throw error;
    return keywordEnvelope(error instanceof SearchModelError ? error.reason : "unavailable");
  }
}
