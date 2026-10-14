import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { embeddingChunks, projectionDigest, validEmbedding } from "@/lib/ai/embedding-target";
import { buildEmbeddingInput, hashEmbeddingInput, withEmbeddingSlot } from "@/lib/ai/embeddings";
import { db } from "@/lib/db";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import type { PlaybookEdition } from "@/lib/playbook/types";
import {
  contentTasks,
  postEmbeddings,
  posts,
  ragIndexConfigs,
  ragIndexManifests,
  ragIndexTargets,
  searchOutbox,
  searchSemanticEmbeddings,
} from "@/lib/schema";
import { isClippingSearchMemo } from "@/lib/search/content-search";
import { authorizeContent, contentVersion, readSearchRows } from "./content-search-index";
import {
  beginContentTask,
  finishContentTask,
  taskControllers,
  updateContentTask,
} from "./content-tasks";
import { getResolvedLlmConfig, type ResolvedTierConfig } from "./llm-settings";
import { listPlaybookSearchChunks, type PlaybookSearchType } from "./playbook-search";
import { embedSearchQuery, SearchModelError } from "./search-model";

export type RagSource = "all" | "blog" | "playbook";
export type CoverageState = "indexed" | "unindexed" | "outdated" | "failed";
export type RagScope = {
  source?: RagSource;
  type?: string;
  edition?: "current" | "previous";
  publishedOnly?: boolean;
  playbook?: PlaybookEdition | null;
  config?: ResolvedTierConfig;
};
export type RagTarget = {
  id: string;
  source: "blog" | "playbook";
  parentId: string;
  type: string;
  slug: string;
  chunkIndex: number;
  input: string;
  contentHash: string;
  documentHash: string;
  version: string;
  edition?: PlaybookEdition;
  fingerprint: string;
  model: string;
  location?: string;
};
const pbTypes = ["topic", "experience", "policy"];
function embeddingIdentity(config: ResolvedTierConfig) {
  const configuredDim = process.env.EMBEDDING_DIMENSION
    ? Number(process.env.EMBEDDING_DIMENSION)
    : null;
  if (configuredDim !== null && (!Number.isInteger(configuredDim) || configuredDim <= 0))
    throw new Error("Invalid embedding dimension");
  const policy = {
    version: 1,
    chunking: process.env.EMBED_CHUNKING_ENABLED !== "false",
    size: Number(process.env.EMBED_CHUNK_SIZE || 1400),
    overlap: Number(process.env.EMBED_CHUNK_OVERLAP || 200),
  };
  return {
    fingerprint: projectionDigest({
      provider: config.baseUrl,
      model: config.model,
      configuredDim,
      policy,
    }),
    configuredDim,
    policy,
  };
}
export async function ragCatalog(scope: RagScope = {}) {
  const config = scope.config ?? (await getResolvedLlmConfig()).embedding;
  const { fingerprint, configuredDim, policy } = embeddingIdentity(config);
  const source = scope.source ?? "all",
    type = scope.type ?? "all";
  const store = getRuntimePlaybookStore();
  await store.load();
  const edition =
    scope.playbook !== undefined
      ? scope.playbook
      : scope.edition === "previous"
        ? store.previous
        : store.current;
  const targets: RagTarget[] = [];
  const missingSources: string[] = [];
  const wantsBlog = source !== "playbook" && ["all", "post", "memo", "clipping"].includes(type);
  const wantsPlaybook = source !== "blog" && ["all", ...pbTypes].includes(type);
  const watermark =
    (
      await db
        .select({ seq: sql<number>`coalesce(max(${searchOutbox.seq}),0)` })
        .from(searchOutbox)
        .get()
    )?.seq ?? 0;
  if (wantsBlog) {
    const rows = await db
      .select()
      .from(posts)
      .where(
        inArray(
          posts.type,
          type === "post"
            ? ["post"]
            : type === "memo" || type === "clipping"
              ? ["memo"]
              : ["post", "memo"]
        )
      );
    for (const row of rows) {
      if (
        !(await authorizeContent(row, scope.publishedOnly !== false)) ||
        (type === "clipping" && !isClippingSearchMemo(row.type, row.tags))
      )
        continue;
      const input = buildEmbeddingInput(row),
        documentHash = hashEmbeddingInput(input);
      for (const chunk of embeddingChunks(input)) {
        const contentHash = hashEmbeddingInput(chunk.text);
        const id = projectionDigest({
          source: "blog",
          parent: row.id,
          index: chunk.index,
          documentHash,
          contentHash,
          fingerprint,
        });
        targets.push({
          id,
          source: "blog",
          parentId: row.id,
          type: row.type,
          slug: row.slug,
          chunkIndex: chunk.index,
          input: chunk.text,
          contentHash,
          documentHash,
          version: contentVersion(row),
          fingerprint,
          model: config.model ?? "",
        });
      }
    }
  }
  const playbookIndexes = new Map<string, number>();
  if (wantsPlaybook) {
    if (!edition) missingSources.push("playbook");
    else
      for (const chunk of listPlaybookSearchChunks(edition, {
        type: type === "all" ? "all" : (type as PlaybookSearchType),
      })) {
        const fullInput = `${chunk.title}\n${chunk.excerpt ?? ""}\n${chunk.body}`;
        for (const piece of embeddingChunks(fullInput)) {
          const input = piece.text,
            contentHash = hashEmbeddingInput(input),
            chunkIndex = playbookIndexes.get(chunk.parentId) ?? 0;
          playbookIndexes.set(chunk.parentId, chunkIndex + 1);
          const id = projectionDigest({
            source: "playbook",
            parent: chunk.parentId,
            index: chunkIndex,
            hash: contentHash,
            edition: {
              edition: edition.edition.editionDigest,
              sourceReleaseId: edition.edition.source.releaseId,
              sourceTag: edition.edition.source.tag,
            },
            fingerprint,
          });
          targets.push({
            id,
            source: "playbook",
            parentId: chunk.parentId,
            type: chunk.type,
            slug: chunk.slug,
            chunkIndex,
            input,
            contentHash,
            documentHash: contentHash,
            version: projectionDigest({
              edition: edition.edition.editionDigest,
              sourceReleaseId: edition.edition.source.releaseId,
              sourceTag: edition.edition.source.tag,
            }),
            edition,
            fingerprint,
            model: config.model ?? "",
            location: chunk.location?.resourcePath ?? chunk.location?.id ?? chunk.route,
          });
        }
      }
  }
  const identity = {
    source,
    type,
    access: scope.publishedOnly === false ? "authorized" : "public",
    blogWatermark: watermark,
    playbook:
      wantsPlaybook && edition
        ? {
            edition: edition.edition.editionDigest,
            sourceReleaseId: edition.edition.source.releaseId,
            sourceTag: edition.edition.source.tag,
          }
        : null,
    fingerprint,
    model: config.model,
    configuredDim,
    policy,
  };
  return {
    targets,
    identity,
    config,
    missingSources,
    available: Boolean(config.model && config.baseUrl && config.apiKeyAvailable),
  };
}
const emptyCounts = () => ({
  total: 0,
  indexed: 0,
  unindexed: 0,
  outdated: 0,
  failed: 0,
  coverage: null as number | null,
});
export function summarizeCoverage(entries: { parentId: string; state: CoverageState }[]) {
  const chunks = emptyCounts(),
    contents = emptyCounts(),
    parents = new Map<string, CoverageState[]>();
  for (const row of entries) {
    chunks.total++;
    chunks[row.state]++;
    parents.set(row.parentId, [...(parents.get(row.parentId) ?? []), row.state]);
  }
  for (const states of parents.values()) {
    contents.total++;
    const state = states.every((s) => s === "indexed")
      ? "indexed"
      : states.includes("failed")
        ? "failed"
        : states.includes("outdated")
          ? "outdated"
          : "unindexed";
    contents[state]++;
  }
  for (const counts of [contents, chunks])
    counts.coverage = counts.total ? counts.indexed / counts.total : null;
  return { contents, chunks };
}
export async function ragCoverage(scope: RagScope = {}) {
  const catalog = await ragCatalog(scope);
  const { records, blogRows, pbRows, bound } = db.transaction((tx) => {
    const batches = (values: string[]) =>
      Array.from({ length: Math.ceil(values.length / 500) }, (_, i) =>
        values.slice(i * 500, (i + 1) * 500)
      );
    const parentIds = (source: "blog" | "playbook") => [
      ...new Set(
        catalog.targets
          .filter((target) => target.source === source)
          .map((target) => target.parentId)
      ),
    ];
    return {
      records: batches(catalog.targets.map((target) => target.id)).flatMap((ids) =>
        tx.select().from(ragIndexTargets).where(inArray(ragIndexTargets.id, ids)).all()
      ),
      blogRows: batches(parentIds("blog")).flatMap((ids) =>
        tx.select().from(postEmbeddings).where(inArray(postEmbeddings.postId, ids)).all()
      ),
      pbRows: batches(parentIds("playbook")).flatMap((ids) =>
        tx
          .select()
          .from(searchSemanticEmbeddings)
          .where(
            and(
              eq(searchSemanticEmbeddings.source, "playbook"),
              inArray(searchSemanticEmbeddings.parentId, ids)
            )
          )
          .all()
      ),
      bound:
        tx
          .select()
          .from(ragIndexConfigs)
          .where(eq(ragIndexConfigs.fingerprint, catalog.identity.fingerprint))
          .get()?.dim ?? catalog.identity.configuredDim,
    };
  });
  const provenance = new Map(records.map((r) => [r.id, r]));
  const vectors = new Map([...blogRows, ...pbRows].map((r) => [r.id, r]));
  const eligibleVectorIds = new Set<string>();
  const details = catalog.targets.map((target) => {
    const record = provenance.get(target.id),
      vector = record?.vectorId ? vectors.get(record.vectorId) : undefined;
    const sameIdentity =
      vector &&
      (target.source === "blog"
        ? "postId" in vector && vector.postId === target.parentId
        : "parentId" in vector &&
          vector.parentId === target.parentId &&
          vector.editionDigest === target.edition?.edition.editionDigest &&
          vector.sourceReleaseId === target.edition?.edition.source.releaseId &&
          vector.sourceTag === target.edition?.edition.source.tag &&
          vector.status === "ready");
    const valid = Boolean(
      catalog.available &&
        bound &&
        sameIdentity &&
        vector?.chunkIndex === target.chunkIndex &&
        vector?.type === target.type &&
        record?.status === "ready" &&
        vector &&
        vector.contentHash === target.documentHash &&
        vector.modelName === target.model &&
        vector.vector instanceof Uint8Array &&
        validEmbedding(vector.vector, vector.dim, bound) &&
        record.dim === vector.dim &&
        record.vectorDigest ===
          projectionDigest(Array.from(vector.vector instanceof Uint8Array ? vector.vector : []))
    );
    let state: CoverageState;
    if (record?.status === "failed") state = "failed";
    else if (valid) {
      state = "indexed";
      if (vector) eligibleVectorIds.add(vector.id);
    } else {
      const historical =
        target.source === "blog"
          ? blogRows.some((row) => row.postId === target.parentId)
          : pbRows.some((row) => row.parentId === target.parentId);
      state = historical ? "outdated" : "unindexed";
    }
    return {
      id: target.id,
      parentId: target.parentId,
      source: target.source,
      type: target.type,
      slug: target.slug,
      chunkIndex: target.chunkIndex,
      state,
      error: record?.error ?? null,
      indexedAt: valid ? (vector?.updatedAt ?? null) : null,
    };
  });
  const bySource = (["blog", "playbook"] as const).map((source) => ({
    source,
    ...summarizeCoverage(details.filter((row) => row.source === source)),
    available: catalog.available && !catalog.missingSources.includes(source),
  }));
  const incompleteSources = bySource
    .filter((row) => row.contents.total > row.contents.indexed)
    .map((row) => row.source);
  for (const source of catalog.missingSources)
    if (!incompleteSources.includes(source as "playbook"))
      incompleteSources.push(source as "playbook");
  const counts = summarizeCoverage(details);
  return {
    catalog,
    eligibleVectorIds,
    status: {
      ...counts,
      identity: catalog.identity,
      available: catalog.available,
      reason: !catalog.available
        ? "embedding-unconfigured"
        : catalog.missingSources.length
          ? "snapshot-unavailable"
          : null,
      missingSources: catalog.missingSources,
      bySource,
      details,
      lastIndexedAt: details.reduce<number | null>(
        (n, row) => (row.indexedAt ? Math.max(n ?? 0, row.indexedAt) : n),
        null
      ),
      incompleteSources,
    },
  };
}
export async function ensureRagManifest(scope: RagScope = {}) {
  const catalog = await ragCatalog(scope);
  const id = projectionDigest({
    identity: catalog.identity,
    targets: catalog.targets.map((x) => x.id),
  });
  db.transaction((tx) => {
    tx.insert(ragIndexManifests)
      .values({
        id,
        source: scope.source ?? "all",
        identity: JSON.stringify(catalog.identity),
        targets: JSON.stringify(catalog.targets.map(({ input, edition, ...t }) => t)),
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
    for (const target of catalog.targets)
      tx.insert(ragIndexTargets)
        .values({
          id: target.id,
          source: target.source,
          parentId: target.parentId,
          status: "pending",
          updatedAt: Date.now(),
        })
        .onConflictDoNothing()
        .run();
  });
  return { ...catalog, manifestId: id };
}
async function targetStillCurrent(target: RagTarget, scope: RagScope) {
  const config = (await getResolvedLlmConfig()).embedding;
  if (embeddingIdentity(config).fingerprint !== target.fingerprint) return false;
  if (target.source === "playbook") {
    const identity = target.edition?.edition;
    return Boolean(
      identity &&
        getRuntimePlaybookStore().getEdition(
          identity.editionDigest,
          identity.source.releaseId,
          identity.source.tag
        )
    );
  }
  const row = (await readSearchRows([target.parentId]))[0];
  return Boolean(
    row &&
      (await authorizeContent(row, scope.publishedOnly !== false)) &&
      hashEmbeddingInput(buildEmbeddingInput(row)) === target.documentHash
  );
}
async function prepareEmbedding(
  config: ResolvedTierConfig,
  input: string,
  signal: AbortSignal | undefined,
  stillCurrent: () => Promise<boolean>
) {
  return withEmbeddingSlot(async () => {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw signal.reason;
      if (!(await stillCurrent())) throw new Error("Embedding target changed");
      try {
        return await embedSearchQuery(config, input, 10000, { signal });
      } catch (error) {
        if (
          signal?.aborted ||
          attempt >= 5 ||
          !(error instanceof SearchModelError) ||
          !["timeout", "unavailable"].includes(error.reason)
        )
          throw error;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => {
              signal?.removeEventListener("abort", abort);
              resolve();
            },
            Math.min(3000, 100 * 2 ** attempt)
          );
          const abort = () => {
            clearTimeout(timer);
            reject(signal?.reason);
          };
          signal?.addEventListener("abort", abort, { once: true });
        });
      }
    }
  });
}
export async function runRagIndex(
  scope: RagScope,
  mode: "repair" | "rebuild",
  origin = "manual",
  resumeId?: string
) {
  if (scope.source === "all" || !scope.source) throw new Error("Run one RAG source per task");
  const catalog = await ensureRagManifest(scope);
  if (!catalog.available) throw new Error("Embedding provider is not configured");
  if (catalog.missingSources.length) throw new Error("Playbook snapshot unavailable");
  const targetKey = projectionDigest({
    source: scope.source,
    type: scope.type ?? "all",
    targets: catalog.targets.map((target) => target.id),
    fingerprint: catalog.identity.fingerprint,
    playbook: catalog.identity.playbook,
  });
  const requestKey = projectionDigest({ targetKey, mode });
  const { task, reused } = await beginContentTask({
    kind: "rag",
    source: scope.source === "blog" ? "local" : "playbook",
    requestKey,
    origin,
    target: JSON.stringify({
      source: scope.source,
      mode,
      edition: scope.edition ?? "current",
      identity: catalog.identity,
      manifestId: catalog.manifestId,
      targetKey,
      type: scope.type ?? "all",
    }),
    resumeId,
  });
  if (reused) return { taskId: task.id, reused: true };
  await updateContentTask(task.id, { total: catalog.targets.length });
  const controller = taskControllers.get(task.id);
  void (async () => {
    const coverage = await ragCoverage(scope);
    let processed = 0,
      failed = 0,
      dim = catalog.identity.configuredDim;
    const bound = (
      await db
        .select()
        .from(ragIndexConfigs)
        .where(eq(ragIndexConfigs.fingerprint, catalog.identity.fingerprint))
        .get()
    )?.dim;
    dim ??= bound ?? null;
    await updateContentTask(task.id, { phase: "embedding", total: catalog.targets.length });
    for (const target of catalog.targets) {
      if (controller?.signal.aborted) throw controller.signal.reason;
      if (
        mode === "repair" &&
        coverage.status.details.find((x) => x.id === target.id)?.state === "indexed"
      ) {
        processed++;
        await updateContentTask(task.id, { processed });
        continue;
      }
      try {
        db.transaction((tx) => {
          const owner = tx.select().from(contentTasks).where(eq(contentTasks.id, task.id)).get();
          if (owner?.status !== "running" || owner.cancelRequested)
            throw new DOMException("Task no longer owns target", "AbortError");
          tx.update(ragIndexTargets)
            .set({ taskId: task.id, status: "pending", error: null, updatedAt: Date.now() })
            .where(eq(ragIndexTargets.id, target.id))
            .run();
        });
        const vector = await prepareEmbedding(
          catalog.config,
          target.input,
          controller?.signal,
          () => targetStillCurrent(target, scope)
        );
        const blob = Buffer.from(new Float32Array(vector).buffer);
        if (!validEmbedding(blob, vector.length, dim))
          throw new Error("Embedding vector dimension or values invalid");
        dim ??= vector.length;
        if (controller?.signal.aborted || !(await targetStillCurrent(target, scope)))
          throw new DOMException("Target superseded", "AbortError");
        db.transaction((tx) => {
          const owner = tx.select().from(contentTasks).where(eq(contentTasks.id, task.id)).get();
          const claim = tx
            .select()
            .from(ragIndexTargets)
            .where(eq(ragIndexTargets.id, target.id))
            .get();
          if (owner?.status !== "running" || owner.cancelRequested || claim?.taskId !== task.id)
            throw new DOMException("Task no longer owns target", "AbortError");
          tx.insert(ragIndexConfigs)
            .values({ fingerprint: target.fingerprint, dim: vector.length, updatedAt: Date.now() })
            .onConflictDoNothing()
            .run();
          const binding = tx
            .select()
            .from(ragIndexConfigs)
            .where(eq(ragIndexConfigs.fingerprint, target.fingerprint))
            .get();
          if (binding?.dim !== vector.length) throw new Error("Embedding dimension changed");
          let vectorId: string;
          if (target.source === "blog") {
            const values = {
              postId: target.parentId,
              slug: target.slug,
              type: target.type,
              modelName: target.model,
              dim: vector.length,
              contentHash: target.documentHash,
              chunkIndex: target.chunkIndex,
              vector: blob,
              errorMessage: null,
              updatedAt: Date.now(),
            };
            tx.insert(postEmbeddings)
              .values({ id: randomUUID(), createdAt: Date.now(), ...values })
              .onConflictDoUpdate({
                target: [
                  postEmbeddings.postId,
                  postEmbeddings.modelName,
                  postEmbeddings.chunkIndex,
                ],
                set: values,
              })
              .run();
            const persisted = tx
              .select()
              .from(postEmbeddings)
              .where(
                and(
                  eq(postEmbeddings.postId, target.parentId),
                  eq(postEmbeddings.modelName, target.model),
                  eq(postEmbeddings.chunkIndex, target.chunkIndex)
                )
              )
              .get();
            if (!persisted) throw new Error("Vector persistence failed");
            vectorId = persisted.id;
          } else {
            const edition = target.edition?.edition;
            if (!edition) throw new Error("Edition required");
            const values = {
              source: "playbook" as const,
              contentId: target.id,
              parentId: target.parentId,
              type: target.type,
              slug: target.slug,
              editionDigest: edition.editionDigest,
              sourceReleaseId: edition.source.releaseId,
              sourceTag: edition.source.tag,
              location: target.location ?? String(target.chunkIndex),
              chunkIndex: target.chunkIndex,
              modelName: target.model,
              dim: vector.length,
              contentHash: target.documentHash,
              vector: blob,
              status: "ready" as const,
              errorMessage: null,
              updatedAt: Date.now(),
            };
            const row = tx
              .select()
              .from(searchSemanticEmbeddings)
              .where(
                and(
                  eq(searchSemanticEmbeddings.parentId, target.parentId),
                  eq(searchSemanticEmbeddings.modelName, target.model),
                  eq(searchSemanticEmbeddings.chunkIndex, target.chunkIndex),
                  eq(searchSemanticEmbeddings.editionDigest, edition.editionDigest),
                  eq(searchSemanticEmbeddings.sourceReleaseId, edition.source.releaseId),
                  eq(searchSemanticEmbeddings.sourceTag, edition.source.tag)
                )
              )
              .get();
            vectorId = row?.id ?? randomUUID();
            if (row)
              tx.update(searchSemanticEmbeddings)
                .set(values)
                .where(eq(searchSemanticEmbeddings.id, row.id))
                .run();
            else
              tx.insert(searchSemanticEmbeddings)
                .values({ id: vectorId, createdAt: Date.now(), ...values })
                .run();
          }
          tx.update(ragIndexTargets)
            .set({
              status: "ready",
              taskId: task.id,
              vectorId,
              vectorDigest: projectionDigest(Array.from(blob)),
              dim: vector.length,
              error: null,
              updatedAt: Date.now(),
            })
            .where(eq(ragIndexTargets.id, target.id))
            .run();
        });
      } catch (error) {
        if (
          controller?.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        )
          throw error;
        failed++;
        await db
          .update(ragIndexTargets)
          .set({
            status: "failed",
            taskId: task.id,
            error: "Embedding preparation failed",
            updatedAt: Date.now(),
          })
          .where(and(eq(ragIndexTargets.id, target.id), eq(ragIndexTargets.taskId, task.id)));
      }
      processed++;
      await updateContentTask(task.id, { processed, failed });
    }
    finishContentTask(
      task.id,
      failed ? "failed" : "success",
      failed ? "Some embedding targets failed" : undefined
    );
  })().catch((error) =>
    finishContentTask(
      task.id,
      controller?.signal.aborted ? "cancelled" : "failed",
      error instanceof DOMException && error.name === "AbortError"
        ? "Target interrupted"
        : "Index preparation interrupted"
    )
  );
  return { taskId: task.id, reused: false };
}
export async function triggerRagIndex(
  source: RagSource,
  mode: "repair" | "rebuild",
  origin = "manual"
) {
  const sources =
    source === "all" ? (["blog", "playbook"] as const) : ([source] as ("blog" | "playbook")[]);
  const results = [];
  for (const item of sources) {
    try {
      if (origin === "automatic" || origin === "content-sync") {
        const catalog = await ensureRagManifest({ source: item });
        const targetKey = projectionDigest({
          source: item,
          type: "all",
          targets: catalog.targets.map((target) => target.id),
          fingerprint: catalog.identity.fingerprint,
          playbook: catalog.identity.playbook,
        });
        const previous = db
          .select()
          .from(contentTasks)
          .where(
            and(
              eq(contentTasks.kind, "rag"),
              eq(contentTasks.source, item === "blog" ? "local" : "playbook")
            )
          )
          .all()
          .filter((task) => {
            try {
              return JSON.parse(task.target).targetKey === targetKey;
            } catch {
              return false;
            }
          })
          .sort((a, b) => b.startedAt - a.startedAt)[0];
        if (previous && ["cancelled", "failed"].includes(previous.status)) {
          results.push({ source: item, skipped: previous.status });
          continue;
        }
      }
      results.push({ source: item, ...(await runRagIndex({ source: item }, mode, origin)) });
    } catch (error) {
      results.push({
        source: item,
        error:
          error instanceof Error && error.message.startsWith("Task conflict:")
            ? error.message
            : "Index task unavailable",
      });
    }
  }
  return { taskIds: results.flatMap((row) => ("taskId" in row ? [row.taskId] : [])), results };
}
