import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { cosineSimilarity } from "@/lib/ai/embeddings";
import type { AiUsageContext } from "@/lib/ai-usage";
import { db } from "@/lib/db";
import { contentSyncLogs, searchSemanticEmbeddings } from "@/lib/schema";
import { getResolvedLlmConfig, type ResolvedTierConfig } from "./llm-settings";
import {
  listPlaybookCandidates,
  type PlaybookSearchCandidate,
  type PlaybookSearchEdition,
  type PlaybookSearchType,
  playbookContentIdentity,
  playbookEditionIdentity,
} from "./playbook-search";
import { getPlaybookSnapshotStore } from "./playbook-snapshot-store";
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
  const model = await getResolvedLlmConfig()
    .then((config) => config.embedding.model ?? "")
    .catch(() => "");
  const snapshotStore = getPlaybookSnapshotStore();
  const editions = [snapshotStore.getCurrent(), snapshotStore.getPrevious()].filter(
    (edition): edition is NonNullable<typeof edition> => Boolean(edition)
  );
  const previous = snapshotStore.getPrevious();
  const state = snapshotStore.getCurrent();
  const coverage = await ragCoverage({ source: "playbook" });
  const semantic = {
    source: "playbook" as const,
    edition: state?.contentHash,
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
          edition: state.contentHash,
          sourceReleaseId: state.sourceRevision.commit,
          sourceTag: state.sourceRevision.ref,
          generatedAt: state.search.generated_at,
        }
      : null,
    previous: previous
      ? {
          edition: previous.contentHash,
          sourceReleaseId: previous.sourceRevision.commit,
          sourceTag: previous.sourceRevision.ref,
          generatedAt: previous.search.generated_at,
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
      edition: edition.contentHash,
      sourceReleaseId: edition.sourceRevision.commit,
      sourceTag: edition.sourceRevision.ref,
      generatedAt: edition.search.generated_at,
    })),
  };
}

export function semanticProjectionId(input: {
  source: "blog" | "playbook";
  parentId: string;
  edition?: string;
  contentHash?: string;
  sourceReleaseId?: string;
  sourceTag?: string;
  model: string;
  chunkIndex: number;
}) {
  return [
    input.source,
    input.parentId,
    input.contentHash ??
      [
        input.edition ?? "current",
        input.sourceReleaseId ?? "release",
        input.sourceTag ?? "tag",
      ].join(":"),
    input.model,
    input.chunkIndex,
  ].join(":");
}

export async function getPlaybookSemanticStatus(
  edition: PlaybookSearchEdition | undefined,
  model: string
): Promise<SemanticProjectionStatus> {
  const conditions = [
    eq(searchSemanticEmbeddings.source, "playbook"),
    eq(searchSemanticEmbeddings.modelName, model),
  ];
  if (edition) {
    conditions.push(eq(searchSemanticEmbeddings.editionDigest, playbookContentIdentity(edition)));
  }
  const rows = await db
    .select({
      status: searchSemanticEmbeddings.status,
      errorMessage: searchSemanticEmbeddings.errorMessage,
    })
    .from(searchSemanticEmbeddings)
    .where(and(...conditions));
  return {
    source: "playbook",
    ...(edition ? { edition: playbookEditionIdentity(edition).edition } : {}),
    model,
    total: rows.length,
    ready: rows.filter((row) => row.status === "ready").length,
    pending: rows.filter((row) => row.status === "pending").length,
    failed: rows.filter((row) => row.status === "failed").length,
    lastError: rows.find((row) => row.errorMessage)?.errorMessage ?? undefined,
  };
}

export async function discardPlaybookSemanticProjection(
  edition: PlaybookSearchEdition,
  model: string
) {
  await db
    .delete(searchSemanticEmbeddings)
    .where(
      and(
        eq(searchSemanticEmbeddings.source, "playbook"),
        eq(searchSemanticEmbeddings.editionDigest, playbookContentIdentity(edition)),
        eq(searchSemanticEmbeddings.modelName, model)
      )
    );
}

/** Prepare stable edition-bound chunks without making adoption depend on embeddings. */
export async function preparePlaybookSemanticProjection(
  edition: PlaybookSearchEdition,
  config: ResolvedTierConfig,
  options: { type?: "all" | PlaybookSearchType; signal?: AbortSignal } = {}
) {
  if (options.signal?.aborted) throw options.signal.reason;
  const result = await runRagIndex(
    { source: "playbook", playbook: edition, type: options.type ?? "all", config },
    "repair",
    "compatibility"
  );
  return {
    taskId: result.taskId,
    queued: true,
    reused: result.reused,
    prepared: 0,
    total: 0,
    failed: 0,
    edition: playbookEditionIdentity(edition).edition,
    model: config.model,
  };
}

export async function semanticPlaybookCandidates(
  query: string,
  config: ResolvedTierConfig,
  edition: PlaybookSearchEdition,
  limit: number,
  type: "all" | PlaybookSearchType = "all",
  options: { timeoutMs?: number; signal?: AbortSignal; metering?: AiUsageContext } = {}
): Promise<PlaybookSearchCandidate[]> {
  if (options.signal?.aborted)
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
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
        eq(searchSemanticEmbeddings.editionDigest, playbookContentIdentity(edition)),
        eq(searchSemanticEmbeddings.modelName, model),
        eq(searchSemanticEmbeddings.status, "ready"),
        isNotNull(searchSemanticEmbeddings.vector),
        ...(type === "all" ? [] : [inArray(searchSemanticEmbeddings.type, [type])])
      )
    )
    .orderBy(asc(searchSemanticEmbeddings.id))
    .limit(10_000);
  if (!rows.length) return [];
  const metering = options.metering
    ? {
        ...options.metering,
        idempotencyKey: `${
          options.metering.idempotencyKey ??
          options.metering.logicalRequestId ??
          `${options.metering.feature}:${randomUUID()}`
        }:semantic-playbook`,
      }
    : undefined;
  const vector = await embedSearchQuery(
    config,
    query,
    options.timeoutMs,
    options.signal || options.metering ? { signal: options.signal, metering } : undefined
  );
  const scoreByParent = new Map<string, number>();
  for (const row of rows) {
    if (options.signal?.aborted)
      throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
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
