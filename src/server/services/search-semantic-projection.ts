import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { cosineSimilarity } from "@/lib/ai/embeddings";
import { db } from "@/lib/db";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import type { PlaybookEdition } from "@/lib/playbook/types";
import { contentSyncLogs, searchSemanticEmbeddings } from "@/lib/schema";
import { getResolvedLlmConfig, type ResolvedTierConfig } from "./llm-settings";
import {
  listPlaybookCandidates,
  type PlaybookSearchCandidate,
  type PlaybookSearchType,
} from "./playbook-search";
import { ragCoverage, runRagIndex } from "./rag-index";
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
  const coverage = await ragCoverage({ source: "playbook" });
  const semantic = {
    source: "playbook" as const,
    edition: state?.edition.editionDigest,
    model,
    total: coverage.status.chunks.total,
    ready: coverage.status.chunks.indexed,
    pending: coverage.status.chunks.unindexed + coverage.status.chunks.outdated,
    failed: coverage.status.chunks.failed,
    lastError: coverage.status.details.find((row) => row.error)?.error ?? undefined,
  };
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
  const { taskId } = await runRagIndex(
    { source: "playbook", playbook: edition, type: options.type ?? "all", config },
    "repair",
    "compatibility"
  );
  const { getContentTask, cancelContentTask } = await import("./content-tasks");
  while (true) {
    if (options.signal?.aborted) {
      await cancelContentTask(taskId);
      throw options.signal.reason;
    }
    const task = await getContentTask(taskId);
    if (task?.finishedAt !== null && task)
      return {
        prepared: task.processed - task.failed,
        total: task.total,
        failed: task.failed,
        edition: edition.edition.editionDigest,
        model: config.model,
      };
    await Bun.sleep(20);
  }
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
  const { eligibleVectorIds } = await ragCoverage({
    source: "playbook",
    type,
    playbook: edition,
    config,
  });
  if (!eligibleVectorIds.size) return [];
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
    if (
      !eligibleVectorIds.has(row.id) ||
      !(row.vector instanceof Uint8Array) ||
      row.dim !== vector.length
    )
      continue;
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
