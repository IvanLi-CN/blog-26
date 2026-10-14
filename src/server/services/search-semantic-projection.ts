import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { cosineSimilarity } from "@/lib/ai/embeddings";
import { db } from "@/lib/db";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import type { PlaybookEdition } from "@/lib/playbook/types";
import { contentSyncLogs, searchSemanticEmbeddings } from "@/lib/schema";
import { getResolvedLlmConfig, type ResolvedTierConfig } from "./llm-settings";
import {
  listPlaybookCandidates,
  listPlaybookSearchChunks,
  type PlaybookSearchCandidate,
  type PlaybookSearchType,
} from "./playbook-search";
import { embedSearchQuery } from "./search-model";

export type SemanticProjectionStatus = {
  source: "playbook" | "blog";
  edition?: string;
  model: string;
  total: number;
  ready: number;
  pending: number;
  failed: number;
  lastError?: string;
};

export async function getPlaybookContentSyncStatus() {
  const store = getRuntimePlaybookStore();
  await store.load();
  const model = await getResolvedLlmConfig()
    .then((config) => config.embedding.model ?? "")
    .catch(() => "");
  const editions = [store.current, store.previous].filter(Boolean) as PlaybookEdition[];
  const previous = store.previous;
  const state = store.current;
  const semantic = await getPlaybookSemanticStatus(state, model);
  const lexicalCount = state ? listPlaybookCandidates(state).length : 0;
  const history = await db
    .select()
    .from(contentSyncLogs)
    .where(eq(contentSyncLogs.sourceName, "playbook"))
    .orderBy(desc(contentSyncLogs.createdAt))
    .limit(10);
  const parseLogData = (value: string | null) => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };
  return {
    name: "playbook",
    type: "playbook",
    adopted: Boolean(state),
    current: state
      ? {
          edition: state.edition.editionDigest,
          sourceReleaseId: state.edition.source.releaseId,
          sourceTag: state.edition.source.tag,
          generatedAt: state.edition.generatedAt,
        }
      : null,
    previous: previous
      ? {
          edition: previous.edition.editionDigest,
          sourceReleaseId: previous.edition.source.releaseId,
          sourceTag: previous.edition.source.tag,
          generatedAt: previous.edition.generatedAt,
        }
      : null,
    lexical: { status: state ? "ready" : "unavailable", count: lexicalCount },
    semantic: { ...semantic, model: model || "未配置" },
    history: history.map((entry) => ({
      id: entry.id,
      status: entry.status,
      operation: entry.operation,
      message: entry.message,
      data: parseLogData(entry.data),
      createdAt: entry.createdAt,
    })),
    editions: editions.map((edition) => ({
      edition: edition.edition.editionDigest,
      sourceReleaseId: edition.edition.source.releaseId,
      sourceTag: edition.edition.source.tag,
      generatedAt: edition.edition.generatedAt,
    })),
  };
}

export function semanticProjectionId(input: {
  source: "blog" | "playbook";
  parentId: string;
  edition?: string;
  sourceReleaseId?: string;
  sourceTag?: string;
  model: string;
  chunkIndex: number;
}) {
  return [
    input.source,
    input.parentId,
    input.edition ?? "current",
    input.sourceReleaseId ?? "release",
    input.sourceTag ?? "tag",
    input.model,
    input.chunkIndex,
  ].join(":");
}

export async function getPlaybookSemanticStatus(
  edition: PlaybookEdition | undefined,
  model: string
): Promise<SemanticProjectionStatus> {
  const conditions = [
    eq(searchSemanticEmbeddings.source, "playbook"),
    eq(searchSemanticEmbeddings.modelName, model),
  ];
  if (edition)
    conditions.push(
      eq(searchSemanticEmbeddings.editionDigest, edition.edition.editionDigest),
      eq(searchSemanticEmbeddings.sourceReleaseId, edition.edition.source.releaseId),
      eq(searchSemanticEmbeddings.sourceTag, edition.edition.source.tag)
    );
  const rows = await db
    .select({
      status: searchSemanticEmbeddings.status,
      errorMessage: searchSemanticEmbeddings.errorMessage,
    })
    .from(searchSemanticEmbeddings)
    .where(and(...conditions));
  return {
    source: "playbook",
    ...(edition ? { edition: edition.edition.editionDigest } : {}),
    model,
    total: rows.length,
    ready: rows.filter((row) => row.status === "ready").length,
    pending: rows.filter((row) => row.status === "pending").length,
    failed: rows.filter((row) => row.status === "failed").length,
    lastError: rows.find((row) => row.errorMessage)?.errorMessage ?? undefined,
  };
}

export async function discardPlaybookSemanticProjection(edition: PlaybookEdition, model: string) {
  await db
    .delete(searchSemanticEmbeddings)
    .where(
      and(
        eq(searchSemanticEmbeddings.source, "playbook"),
        eq(searchSemanticEmbeddings.editionDigest, edition.edition.editionDigest),
        eq(searchSemanticEmbeddings.sourceReleaseId, edition.edition.source.releaseId),
        eq(searchSemanticEmbeddings.sourceTag, edition.edition.source.tag),
        eq(searchSemanticEmbeddings.modelName, model)
      )
    );
}

/** Prepare stable edition-bound chunks without making adoption depend on embeddings. */
export async function preparePlaybookSemanticProjection(
  edition: PlaybookEdition,
  config: ResolvedTierConfig,
  options: { type?: "all" | PlaybookSearchType; signal?: AbortSignal } = {}
) {
  const model = config.model;
  if (!model) throw new Error("Embedding model is not configured");
  const chunks = listPlaybookSearchChunks(edition, options);
  const now = Date.now();
  let prepared = 0;
  let failed = 0;
  for (const chunk of chunks) {
    if (options.signal?.aborted)
      throw new DOMException("Projection preparation cancelled", "AbortError");
    const existing = await db
      .select({
        id: searchSemanticEmbeddings.id,
        contentHash: searchSemanticEmbeddings.contentHash,
        status: searchSemanticEmbeddings.status,
      })
      .from(searchSemanticEmbeddings)
      .where(
        and(
          eq(searchSemanticEmbeddings.source, "playbook"),
          eq(searchSemanticEmbeddings.parentId, chunk.parentId),
          eq(searchSemanticEmbeddings.editionDigest, edition.edition.editionDigest),
          eq(searchSemanticEmbeddings.sourceReleaseId, edition.edition.source.releaseId),
          eq(searchSemanticEmbeddings.sourceTag, edition.edition.source.tag),
          eq(searchSemanticEmbeddings.modelName, model),
          eq(searchSemanticEmbeddings.chunkIndex, chunk.chunkIndex)
        )
      )
      .limit(1);
    const id = semanticProjectionId({
      source: "playbook",
      parentId: chunk.parentId,
      edition: edition.edition.editionDigest,
      sourceReleaseId: edition.edition.source.releaseId,
      sourceTag: edition.edition.source.tag,
      model,
      chunkIndex: chunk.chunkIndex,
    });
    if (existing[0]?.contentHash === chunk.contentHash && existing[0].status === "ready") {
      prepared++;
      continue;
    }
    const rowId = existing[0]?.id ?? id;
    if (existing.length && existing[0]?.id) {
      await db
        .update(searchSemanticEmbeddings)
        .set({
          contentId: chunk.id,
          type: chunk.type,
          slug: chunk.slug,
          location: chunk.location?.resourcePath ?? chunk.location?.id ?? chunk.route,
          contentHash: chunk.contentHash,
          dim: 0,
          vector: null,
          updatedAt: now,
          status: "pending",
          errorMessage: null,
        })
        .where(eq(searchSemanticEmbeddings.id, existing[0].id));
    } else {
      await db.insert(searchSemanticEmbeddings).values({
        id,
        source: "playbook",
        contentId: chunk.id,
        parentId: chunk.parentId,
        type: chunk.type,
        slug: chunk.slug,
        editionDigest: edition.edition.editionDigest,
        sourceReleaseId: edition.edition.source.releaseId,
        sourceTag: edition.edition.source.tag,
        location: chunk.location?.resourcePath ?? chunk.location?.id ?? chunk.route,
        chunkIndex: chunk.chunkIndex,
        modelName: model,
        dim: 0,
        contentHash: chunk.contentHash,
        vector: null,
        status: "pending",
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    try {
      const vector = await embedSearchQuery(
        config,
        `${chunk.title}\n${chunk.excerpt ?? ""}\n${chunk.body}`,
        10000,
        { signal: options.signal }
      );
      await db
        .update(searchSemanticEmbeddings)
        .set({
          dim: vector.length,
          vector: Buffer.from(new Float32Array(vector).buffer),
          status: "ready",
          errorMessage: null,
          updatedAt: Date.now(),
        })
        .where(eq(searchSemanticEmbeddings.id, rowId));
    } catch (error) {
      if (options.signal?.aborted) throw error;
      failed++;
      await db
        .update(searchSemanticEmbeddings)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
          updatedAt: Date.now(),
        })
        .where(eq(searchSemanticEmbeddings.id, rowId));
    }
    prepared++;
  }
  return { prepared, total: chunks.length, failed, edition: edition.edition.editionDigest, model };
}

export async function semanticPlaybookCandidates(
  query: string,
  config: ResolvedTierConfig,
  edition: PlaybookEdition,
  limit: number,
  type: "all" | PlaybookSearchType = "all"
): Promise<PlaybookSearchCandidate[]> {
  const model = config.model;
  if (!model) return [];
  const rows = await db
    .select()
    .from(searchSemanticEmbeddings)
    .where(
      and(
        eq(searchSemanticEmbeddings.source, "playbook"),
        eq(searchSemanticEmbeddings.editionDigest, edition.edition.editionDigest),
        eq(searchSemanticEmbeddings.sourceReleaseId, edition.edition.source.releaseId),
        eq(searchSemanticEmbeddings.sourceTag, edition.edition.source.tag),
        eq(searchSemanticEmbeddings.modelName, model),
        eq(searchSemanticEmbeddings.status, "ready"),
        isNotNull(searchSemanticEmbeddings.vector),
        ...(type === "all" ? [] : [inArray(searchSemanticEmbeddings.type, [type])])
      )
    )
    .orderBy(asc(searchSemanticEmbeddings.id))
    .limit(10_000);
  if (!rows.length) return [];
  const vector = await embedSearchQuery(config, query);
  const scoreByParent = new Map<string, number>();
  for (const row of rows) {
    if (!(row.vector instanceof Uint8Array) || row.dim !== vector.length) continue;
    const bytes = Buffer.from(row.vector);
    if (bytes.length !== row.dim * 4) continue;
    const stored = Array.from({ length: row.dim }, (_, index) => bytes.readFloatLE(index * 4));
    if (!stored.every(Number.isFinite)) continue;
    const score = cosineSimilarity(vector, stored);
    if (Number.isFinite(score) && score > (scoreByParent.get(row.parentId) ?? -Infinity))
      scoreByParent.set(row.parentId, score);
  }
  const parents = new Map(
    listPlaybookCandidates(edition, { type }).map((candidate) => [candidate.id, candidate])
  );
  return [...scoreByParent]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .flatMap(([id, score]) => {
      const candidate = parents.get(id);
      return candidate ? [{ ...candidate, score }] : [];
    });
}
