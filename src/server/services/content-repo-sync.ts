import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getLocalPath, isLocalContentEnabled } from "@/config/paths";
import { clearSearchCache } from "@/lib/ai/search-cache";
import { buildCanonicalDocument, type ContentRecord } from "@/lib/content-repo/canonical";
import {
  CONTENT_REPO_MAX_BATCH_CONTENTS,
  CONTENT_REPO_MAX_MEMO_FILE_BYTES,
  CONTENT_REPO_MAX_POST_FILE_BYTES,
  type ContentRepoConfig,
  ContentRepoConfigError,
  readContentRepoConfig,
} from "@/lib/content-repo/config";
import {
  parseRemoteDocument,
  serializeCanonicalDocument,
  toDocumentUpdate,
} from "@/lib/content-repo/document";
import {
  ContentRepoError,
  type ContentRepoTransport,
  createContentRepoTransport,
} from "@/lib/content-repo/github";
import {
  type MergeRegionView,
  mergeBody,
  mergeFrontmatter,
  mergeRegions,
} from "@/lib/content-repo/merge";
import {
  buildCommitMessage,
  type ContentRepoBaseline,
  type ContentRepoEntry,
  type ContentRepoMediaFile,
  type PushItem,
  type PushPlan,
  type PushPlanObserver,
  planPush,
} from "@/lib/content-repo/push";
import {
  type ContentSyncCounts,
  type ContentSyncStateItem,
  computeSyncStates,
  summarizeSyncStates,
} from "@/lib/content-repo/state";
import { db } from "@/lib/db";
import { inferPublicMediaMimeType } from "@/lib/public-media";
import {
  contentRepoBaselines,
  contentTaskItems,
  contentTasks,
  memoClippings,
  posts,
} from "@/lib/schema";
import {
  beginContentTask,
  type ContentTask,
  type ContentTaskOperation,
  finishContentTask,
  getContentTask,
  initializeContentTaskItems,
  listContentTaskItems,
  refreshContentTaskCounters,
  taskControllers,
  updateContentTask,
} from "./content-tasks";
import { recordMediaIdentity, verifyMediaIdentity } from "./media-identity";

const FILE_LIMITS = {
  post: CONTENT_REPO_MAX_POST_FILE_BYTES,
  memo: CONTENT_REPO_MAX_MEMO_FILE_BYTES,
} as const;

export interface ContentRepoPushInput {
  ids?: string[];
  all?: boolean;
}

export interface ContentRepoStatus {
  configured: boolean;
  repository: string | null;
  ref: string | null;
  baselines: number;
  message?: string;
}

export type ContentRepoStartStatus = "started" | "busy" | "unconfigured" | "failed";

export interface ContentRepoStartResult {
  status: ContentRepoStartStatus;
  taskId?: string;
  operation: ContentTaskOperation;
  message?: string;
}

function toStartResult(
  outcome: { status: string; taskId?: string; message?: string },
  operation: ContentTaskOperation
): ContentRepoStartResult {
  const status: ContentRepoStartStatus =
    outcome.status === "busy"
      ? "busy"
      : outcome.status === "unconfigured"
        ? "unconfigured"
        : outcome.status === "failed"
          ? "failed"
          : "started";
  return { status, taskId: outcome.taskId, operation, message: outcome.message };
}

function toContentRecord(row: typeof posts.$inferSelect): ContentRecord {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    draft: row.draft,
    public: row.public,
    category: row.category,
    tags: row.tags,
    author: row.author,
    image: row.image,
    publishDate: row.publishDate,
    updateDate: row.updateDate,
    filePath: row.filePath,
    metadata: row.metadata,
  };
}

/** Canonical memos carry the clipping reference; posts never do. */
function clippingFrontmatterFor(contentId: string) {
  const clipping = db.select().from(memoClippings).where(eq(memoClippings.memoId, contentId)).get();
  return clipping?.targetUrl
    ? { targetUrl: clipping.targetUrl, capturedAt: new Date(clipping.updatedAt).toISOString() }
    : null;
}

/** Resolve a library row from a repository path using the stored baseline first. */
function findRowForRepoPath(path: string) {
  const baseline = db
    .select()
    .from(contentRepoBaselines)
    .where(eq(contentRepoBaselines.path, path))
    .get();
  if (baseline?.contentId) {
    const row = db.select().from(posts).where(eq(posts.id, baseline.contentId)).get();
    if (row) return row;
  }
  return (
    db.select().from(posts).where(eq(posts.filePath, path)).get() ??
    db.select().from(posts).where(eq(posts.id, path)).get()
  );
}

export async function loadContentRepoEntries(
  ids?: string[],
  options: {
    tolerateMissingMedia?: boolean;
    enforceBatchLimit?: boolean;
    recordIdentity?: boolean;
  } = {}
): Promise<{ entries: ContentRepoEntry[]; missingMedia: Map<string, string[]> }> {
  const where = ids?.length ? inArray(posts.id, ids) : inArray(posts.type, ["post", "memo"]);
  const rows = db
    .select()
    .from(posts)
    .where(where)
    .all()
    .filter((row) => row.type === "post" || row.type === "memo");
  if (options.enforceBatchLimit && rows.length > CONTENT_REPO_MAX_BATCH_CONTENTS)
    throw new ContentRepoError(
      "invalid",
      `A push batch is limited to ${CONTENT_REPO_MAX_BATCH_CONTENTS} contents`
    );

  const entries: ContentRepoEntry[] = [];
  const missingMedia = new Map<string, string[]>();
  for (const row of rows) {
    const record = toContentRecord(row);
    const kind = record.type === "memo" ? "memo" : "post";
    const document = buildCanonicalDocument(record, {
      clipping: kind === "memo" ? clippingFrontmatterFor(record.id) : null,
    });
    const media: ContentRepoMediaFile[] = [];
    const missing: string[] = [];
    for (const path of document.media) {
      if (!isLocalContentEnabled())
        throw new ContentRepoError("failed", "Media storage is not configured");
      let bytes: Uint8Array;
      try {
        bytes = await readFile(getLocalPath(path));
      } catch (error) {
        if (options.tolerateMissingMedia) {
          missing.push(path);
          continue;
        }
        throw new ContentRepoError("failed", `Attachment is unavailable: ${path}`, {
          cause: error,
        });
      }
      if (bytes.byteLength > FILE_LIMITS[kind])
        throw new ContentRepoError("invalid", `Attachment exceeds the size limit: ${path}`);
      const identity = verifyMediaIdentity(path, bytes);
      if (identity.status === "mismatch")
        throw new ContentRepoError(
          "invalid",
          `Attachment changed outside the content library: ${path}`
        );
      if (identity.status === "record" && options.recordIdentity !== false)
        recordMediaIdentity(path, bytes);
      media.push({ path, bytes, sha256: identity.sha256 });
    }
    if (missing.length) missingMedia.set(document.path, missing);
    entries.push({ contentId: record.id, document, media });
  }
  return { entries, missingMedia };
}

export function loadContentRepoBaselines(): Map<string, ContentRepoBaseline> {
  const baselines = new Map<string, ContentRepoBaseline>();
  for (const row of db.select().from(contentRepoBaselines).all()) {
    let media: ContentRepoBaseline["media"] = {};
    let remoteBlobs: ContentRepoBaseline["remoteBlobs"] = {};
    try {
      media = JSON.parse(row.media) as ContentRepoBaseline["media"];
      remoteBlobs = JSON.parse(row.remoteBlobs) as ContentRepoBaseline["remoteBlobs"];
    } catch {
      continue;
    }
    baselines.set(row.path, {
      contentHash: row.contentHash,
      repoPath: row.path,
      contentId: row.contentId,
      document: row.document ?? null,
      media,
      remoteBlobs,
    });
  }
  return baselines;
}

export interface ContentRepoBaselineRow {
  document: string;
  path: string;
  contentId: string;
  kind: "post" | "memo";
  contentHash: string;
  media: string;
  remoteBlobs: string;
  commitSha: string;
  updatedAt: number;
}

export function buildBaselineRow(
  item: PushItem,
  entry: ContentRepoEntry,
  writtenShas: Map<string, string>,
  previous: ContentRepoBaseline | undefined,
  commit: string,
  updatedAt: number
): ContentRepoBaselineRow | null {
  if (item.status !== "write") return null;
  const documentSha = writtenShas.get(item.path);
  if (!documentSha) return null;
  const media: ContentRepoBaseline["media"] = {};
  const remoteBlobs: Record<string, string> = { [item.path]: documentSha };
  for (const file of entry.media) {
    const remoteSha = writtenShas.get(file.path) ?? previous?.media[file.path]?.remoteSha;
    if (!remoteSha) continue;
    media[file.path] = { sha256: file.sha256, remoteSha };
    remoteBlobs[file.path] = remoteSha;
  }
  return {
    path: item.path,
    contentId: entry.contentId,
    kind: entry.document.kind,
    contentHash: item.contentHash,
    document: new TextDecoder().decode(entry.document.bytes),
    media: JSON.stringify(media),
    remoteBlobs: JSON.stringify(remoteBlobs),
    commitSha: commit,
    updatedAt,
  };
}

function persistBaselines(
  items: PushItem[],
  entries: ContentRepoEntry[],
  writtenShas: Map<string, string>,
  commit: string,
  previous: Map<string, ContentRepoBaseline>
) {
  const now = Date.now();
  const byPath = new Map(entries.map((entry) => [entry.document.path, entry]));
  const rows: ContentRepoBaselineRow[] = [];
  db.transaction((tx) => {
    for (const item of items) {
      const entry = byPath.get(item.path);
      if (!entry) continue;
      const values = buildBaselineRow(
        item,
        entry,
        writtenShas,
        previous.get(item.path),
        commit,
        now
      );
      if (!values) continue;
      rows.push(values);
      tx.insert(contentRepoBaselines)
        .values(values)
        .onConflictDoUpdate({
          target: contentRepoBaselines.path,
          set: {
            contentId: values.contentId,
            kind: values.kind,
            contentHash: values.contentHash,
            media: values.media,
            remoteBlobs: values.remoteBlobs,
            commitSha: values.commitSha,
            updatedAt: values.updatedAt,
          },
        })
        .run();
    }
  });
  for (const values of rows)
    previous.set(values.path, {
      contentHash: values.contentHash,
      repoPath: values.path,
      contentId: values.contentId,
      document: values.document,
      media: JSON.parse(values.media) as ContentRepoBaseline["media"],
      remoteBlobs: JSON.parse(values.remoteBlobs) as ContentRepoBaseline["remoteBlobs"],
    });
}

export function persistBaselineRow(values: typeof contentRepoBaselines.$inferInsert) {
  db.insert(contentRepoBaselines)
    .values(values)
    .onConflictDoUpdate({
      target: contentRepoBaselines.path,
      set: {
        contentId: values.contentId,
        kind: values.kind,
        contentHash: values.contentHash,
        document: values.document,
        media: values.media,
        remoteBlobs: values.remoteBlobs,
        commitSha: values.commitSha,
        updatedAt: values.updatedAt,
      },
    })
    .run();
}

export interface PushExecutionOptions {
  observer?: PushPlanObserver;
  signal?: AbortSignal;
  /** Blob shas already uploaded before a retry or a later chunk. */
  writtenShas?: Map<string, string>;
}

export async function pushEntriesToRepo(
  transport: ContentRepoTransport,
  entries: ContentRepoEntry[],
  baselines: Map<string, ContentRepoBaseline>,
  options: PushExecutionOptions = {}
): Promise<{ plan: PushPlan; commit: string | null; writtenShas: Map<string, string> }> {
  const { observer, signal } = options;
  // Uploaded blobs survive a ref-conflict retry: a retry re-plans against the
  // new head and only uploads bytes it has not uploaded yet.
  const writtenShas = options.writtenShas ?? new Map<string, string>();
  const planFor = (remote: Map<string, string>) =>
    planPush({
      entries,
      remote,
      baselines,
      maxFileBytes: (kind) => FILE_LIMITS[kind],
      observer,
    });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    signal?.throwIfAborted();
    const head = await transport.resolveHead();
    const remote = await transport.listTree(head.tree);
    const plan = planFor(remote);
    if (!plan.writes.length) return { plan, commit: null, writtenShas };

    for (const write of plan.writes) {
      if (writtenShas.has(write.path)) continue;
      signal?.throwIfAborted();
      observer?.onWrite?.(write);
      writtenShas.set(write.path, await transport.createBlob(write.bytes));
    }
    signal?.throwIfAborted();
    const tree = await transport.createTree(
      head.tree,
      plan.writes.map((write) => ({ path: write.path, sha: writtenShas.get(write.path) ?? "" }))
    );
    const commit = await transport.createCommit({
      message: buildCommitMessage(plan.counts),
      tree,
      parents: [head.commit],
    });
    observer?.onRefUpdateStart?.(commit);
    try {
      await transport.updateRef(commit);
      return { plan, commit, writtenShas };
    } catch (error) {
      if (error instanceof ContentRepoError && error.kind === "conflict" && attempt === 0) continue;
      throw error;
    }
  }
  throw new ContentRepoError("conflict", "Content repository ref kept moving during the push");
}

let flight: Promise<ContentRepoPushOutcome> | undefined;

export interface ContentRepoPushOutcome {
  status: "pushed" | "unchanged" | "unconfigured" | "failed" | "busy";
  repository: string | null;
  ref: string | null;
  commit?: string;
  commits?: string[];
  counts?: { post: number; memo: number; media: number };
  items?: PushItem[];
  message?: string;
  taskId?: string;
  operation?: ContentTaskOperation;
}

function chunkByPath(entries: ContentRepoEntry[], size: number): ContentRepoEntry[][] {
  const ordered = [...entries].sort((left, right) =>
    left.document.path.localeCompare(right.document.path)
  );
  const chunks: ContentRepoEntry[][] = [];
  for (let index = 0; index < ordered.length; index += size)
    chunks.push(ordered.slice(index, index + size));
  return chunks;
}

interface ContentRepoConfigFailure {
  status: "failed" | "unconfigured";
  repository: string | null;
  ref: string | null;
  message?: string;
}

function resolveContentRepoConfig(): { config: ContentRepoConfig } | ContentRepoConfigFailure {
  let config: ContentRepoConfig;
  try {
    config = readContentRepoConfig();
  } catch (error) {
    return {
      status: "failed",
      repository: null,
      ref: null,
      message: error instanceof ContentRepoConfigError ? error.message : "Invalid configuration",
    };
  }
  if (!config.token)
    return { status: "unconfigured", repository: config.repository, ref: config.ref };
  return { config };
}

async function startPushTask(
  config: ContentRepoConfig,
  input: ContentRepoPushInput
): Promise<{ task: ContentTask; ids: string[] | undefined } | ContentRepoPushOutcome> {
  if (input.ids?.length && input.all)
    throw new Error("A push targets either explicit contents or the whole library");
  if (input.ids && !input.ids.length && !input.all)
    throw new Error("A push needs at least one content or the whole library");
  const ids = input.all ? undefined : input.ids;
  const requestKey = ids?.length
    ? `content-repo-push:${[...ids].sort().join(",")}`
    : "content-repo-push:all";
  const started = await beginContentRepoTask({
    operation: "push",
    requestKey,
    target: JSON.stringify({ ids: ids ?? null }),
  });
  if (started.busy)
    return {
      status: "busy" as const,
      repository: config.repository,
      ref: config.ref,
      taskId: started.task.id,
      operation: "push" as const,
      message: "A content repository task is already running",
    };
  return { task: started.task, ids };
}

async function runPushTask(
  task: ContentTask,
  config: ContentRepoConfig,
  ids: string[] | undefined
): Promise<ContentRepoPushOutcome> {
  try {
    const { entries } = await loadContentRepoEntries(ids, { enforceBatchLimit: Boolean(ids) });
    const ordered = [...entries].sort((left, right) =>
      left.document.path.localeCompare(right.document.path)
    );
    const mediaTotal = ordered.reduce((sum, entry) => sum + entry.media.length, 0);
    await initializeContentTaskItems(
      task.id,
      ordered.map((entry, index) => ({
        path: entry.document.path,
        ordinal: index,
        contentId: entry.contentId,
        kind: entry.document.kind,
        status: "pending" as const,
        mediaTotal: entry.media.length,
      }))
    );
    await updateContentTask(task.id, {
      phase: "checking",
      total: ordered.length,
      mediaTotal,
      mediaProcessed: 0,
      currentPath: null,
    });

    const chunks = ids?.length ? [ordered] : chunkByPath(ordered, CONTENT_REPO_MAX_BATCH_CONTENTS);
    const baselines = loadContentRepoBaselines();
    const transport = createContentRepoTransport(config);
    const writtenShas = new Map<string, string>();
    const commits: string[] = [];
    const items: PushItem[] = [];
    const counts = { post: 0, memo: 0, media: 0 };
    const mediaOwner = new Map<string, string>();
    for (const entry of ordered)
      for (const file of entry.media) mediaOwner.set(file.path, entry.document.path);

    const observer: PushPlanObserver = {
      onPlan(item) {
        const media = item.media.length;
        const settled =
          item.status === "unchanged"
            ? "unchanged"
            : item.status === "write"
              ? "running"
              : "blocked";
        updateContentTaskItemSync(task.id, item.path, {
          status: settled,
          reason: item.reason ?? null,
          retryable: item.status === "write" || item.status === "unchanged",
          mediaTotal: media,
          mediaProcessed: item.status === "unchanged" ? media : 0,
        });
        if (item.status === "write") setTaskPhaseSync(task.id, "planning", item.path);
      },
      onWrite(write) {
        setTaskPhaseSync(task.id, "uploading", write.path);
        if (write.source === "document") {
          updateContentTaskItemSync(task.id, write.path, { status: "uploaded" });
          return;
        }
        const owner = mediaOwner.get(write.path);
        if (!owner) return;
        const row = db
          .select()
          .from(contentTaskItems)
          .where(and(eq(contentTaskItems.taskId, task.id), eq(contentTaskItems.path, owner)))
          .get();
        updateContentTaskItemSync(task.id, owner, {
          mediaProcessed: (row?.mediaProcessed ?? 0) + 1,
        });
        bumpTaskMediaProcessedSync(task.id);
      },
      onRefUpdateStart() {
        setTaskPhaseSync(task.id, "committing", null);
      },
    };

    try {
      for (const chunk of chunks) {
        const result = await pushEntriesToRepo(transport, chunk, baselines, {
          observer,
          signal: taskControllers.get(task.id)?.signal,
          writtenShas,
        });
        items.push(...result.plan.items);
        counts.post += result.plan.counts.post;
        counts.memo += result.plan.counts.memo;
        counts.media += result.plan.counts.media;
        for (const item of result.plan.items) {
          if (item.status === "write")
            updateContentTaskItemSync(task.id, item.path, {
              status: "success",
              mediaProcessed: item.media.length,
              mediaFailed: 0,
              retryable: false,
            });
          else if (item.status === "unchanged")
            updateContentTaskItemSync(task.id, item.path, {
              mediaProcessed: item.media.length,
            });
        }
        if (!result.commit) continue;
        commits.push(result.commit);
        // The ref moved: cancellation from here on must not report failure.
        db.update(contentTasks)
          .set({ phase: "committed", currentPath: null, updatedAt: Date.now() })
          .where(and(eq(contentTasks.id, task.id), eq(contentTasks.status, "running")))
          .run();
        // Record the commit before persisting baselines: a crash in between
        // must not lose the fact that the ref already moved.
        setTaskResultSync(
          task.id,
          JSON.stringify(
            pushResultPayload({
              outcome: "pushed",
              repository: config.repository,
              ref: config.ref,
              commits,
              counts,
              chunks: chunks.length,
              message: `Pushed ${commits.length} of ${chunks.length} batch(es)`,
            })
          )
        );
        persistBaselines(result.plan.items, chunk, result.writtenShas, result.commit, baselines);
        await refreshContentTaskCounters(task.id);
      }
    } catch (error) {
      const cancelled =
        (error instanceof DOMException && error.name === "AbortError") ||
        taskControllers.get(task.id)?.signal.aborted === true;
      const committed = commits.length > 0;
      const message = cancelled
        ? committed
          ? "Content repository push cancelled after the last commit"
          : "Content repository push cancelled"
        : error instanceof Error
          ? error.message
          : "Content repository push failed";
      await refreshContentTaskCounters(task.id);
      setTaskResultSync(
        task.id,
        JSON.stringify(
          pushResultPayload({
            outcome: cancelled ? (committed ? "pushed" : "cancelled") : "failed",
            repository: config.repository,
            ref: config.ref,
            commits,
            counts,
            chunks: chunks.length,
            message,
          })
        )
      );
      if (cancelled) {
        finishContentTask(task.id, committed ? "success" : "cancelled");
        return {
          status: committed ? ("pushed" as const) : ("failed" as const),
          repository: config.repository,
          ref: config.ref,
          commit: commits.at(-1),
          commits,
          counts,
          items,
          message,
          taskId: task.id,
          operation: "push" as const,
        };
      }
      finishContentTask(task.id, "failed", message);
      throw error;
    }

    await refreshContentTaskCounters(task.id);
    const outcome = commits.length ? ("pushed" as const) : ("unchanged" as const);
    const payload = pushResultPayload({
      outcome,
      repository: config.repository,
      ref: config.ref,
      commits,
      counts,
      chunks: chunks.length,
      message: commits.length
        ? `Pushed ${commits.length} commit(s) in ${chunks.length} batch(es)`
        : "Repository already matches the content library",
    });
    setTaskResultSync(task.id, JSON.stringify(payload));
    finishContentTask(task.id, commits.length ? "success" : "unchanged");
    return {
      status: outcome,
      repository: config.repository,
      ref: config.ref,
      commit: commits.at(-1),
      commits,
      counts,
      items,
      taskId: task.id,
      operation: "push" as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Content repository push failed";
    finishContentTask(task.id, "failed", message);
    throw error;
  }
}

export function pushContentRepo(input: ContentRepoPushInput = {}): Promise<ContentRepoPushOutcome> {
  if (flight) return Promise.reject(new Error("Content repository push already running"));
  flight = (async () => {
    const resolved = resolveContentRepoConfig();
    if (!("config" in resolved))
      return {
        status: resolved.status,
        repository: resolved.repository,
        ref: resolved.ref,
        message: resolved.message,
      };
    const started = await startPushTask(resolved.config, input);
    if ("status" in started) return started;
    return runPushTask(started.task, resolved.config, started.ids);
  })().finally(() => {
    flight = undefined;
  });
  return flight;
}

export async function startContentRepoPush(
  input: ContentRepoPushInput = {}
): Promise<ContentRepoStartResult> {
  const resolved = resolveContentRepoConfig();
  if (!("config" in resolved))
    return { status: resolved.status, operation: "push", message: resolved.message };
  if (input.ids?.length && input.all)
    throw new Error("A push targets either explicit contents or the whole library");
  if (input.ids && !input.ids.length && !input.all)
    throw new Error("A push needs at least one content or the whole library");
  const started = await startPushTask(resolved.config, input);
  if ("status" in started) return toStartResult(started, "push");
  flight = runPushTask(started.task, resolved.config, started.ids).finally(() => {
    flight = undefined;
  });
  flight.catch(() => undefined);
  return { status: "started", taskId: started.task.id, operation: "push" };
}

function pushResultPayload(input: {
  outcome: "pushed" | "unchanged" | "failed" | "cancelled";
  repository: string;
  ref: string;
  commits: string[];
  counts: { post: number; memo: number; media: number };
  chunks: number;
  message: string;
}) {
  return {
    operation: "push" as const,
    outcome: input.outcome,
    repository: input.repository,
    ref: input.ref,
    commit: input.commits.at(-1) ?? null,
    commits: input.commits,
    counts: input.counts,
    batches: input.chunks,
    message: input.message,
  };
}

function updateContentTaskItemSync(
  taskId: string,
  path: string,
  values: Partial<typeof contentTaskItems.$inferInsert>
) {
  db.update(contentTaskItems)
    .set({ ...values, updatedAt: Date.now() })
    .where(and(eq(contentTaskItems.taskId, taskId), eq(contentTaskItems.path, path)))
    .run();
}

/** Result writes must survive a cancel request; they describe work already done. */
function setTaskResultSync(taskId: string, result: string) {
  db.update(contentTasks)
    .set({ result, updatedAt: Date.now() })
    .where(and(eq(contentTasks.id, taskId), eq(contentTasks.status, "running")))
    .run();
}

function setTaskPhaseSync(taskId: string, phase: string, currentPath: string | null) {
  db.update(contentTasks)
    .set({ phase, currentPath, updatedAt: Date.now() })
    .where(and(eq(contentTasks.id, taskId), eq(contentTasks.status, "running")))
    .run();
}

function bumpTaskMediaProcessedSync(taskId: string) {
  db.update(contentTasks)
    .set({ mediaProcessed: sql`${contentTasks.mediaProcessed}+1`, updatedAt: Date.now() })
    .where(eq(contentTasks.id, taskId))
    .run();
}

export interface ContentRepoPullOutcome {
  status: "pulled" | "nothing" | "unconfigured" | "failed" | "busy";
  repository: string | null;
  ref: string | null;
  commit?: string;
  pulled?: string[];
  skipped?: { path: string; reason: string }[];
  message?: string;
}

/**
 * Start a content-repository task exclusively: a live task of any operation
 * yields `busy`, a dead one is reconciled to `interrupted` first.
 */
async function beginContentRepoTask(input: {
  operation: ContentTaskOperation;
  requestKey: string;
  target: string;
  origin?: string;
}) {
  return beginContentTask({
    kind: "sync",
    source: "content-repo",
    operation: input.operation,
    exclusive: true,
    recoverStale: true,
    requestKey: input.requestKey,
    origin: input.origin ?? "manual",
    target: input.target,
  });
}

function busyOutcome<T extends { repository: string | null; ref: string | null }>(
  task: { id: string },
  operation: ContentTaskOperation,
  base: T
) {
  return {
    ...base,
    status: "busy" as const,
    taskId: task.id,
    operation,
    message: "A content repository task is already running",
  };
}

function pullResultPayload(input: {
  outcome: "pulled" | "nothing" | "failed" | "cancelled";
  repository: string;
  ref: string;
  commit: string;
  pulled: string[];
  skipped: { path: string; reason: string }[];
  message: string;
}) {
  return {
    operation: "pull" as const,
    outcome: input.outcome,
    repository: input.repository,
    ref: input.ref,
    commit: input.commit,
    counts: { pulled: input.pulled.length, skipped: input.skipped.length },
    message: input.message,
  };
}

let pullFlight: Promise<ContentRepoPullOutcome> | undefined;

async function startPullTask(
  config: ContentRepoConfig,
  input: { ids?: string[] }
): Promise<
  | { task: ContentTask; config: ContentRepoConfig; ids: string[] | undefined }
  | ContentRepoPullOutcome
> {
  const requestKey = input.ids?.length
    ? `content-repo-pull:${[...input.ids].sort().join(",")}`
    : "content-repo-pull:all";
  const started = await beginContentRepoTask({
    operation: "pull",
    requestKey,
    target: JSON.stringify({ ids: input.ids ?? null }),
  });
  if (started.busy)
    return busyOutcome(started.task, "pull", { repository: config.repository, ref: config.ref });
  return { task: started.task, config, ids: input.ids };
}

async function runPullTask(
  task: ContentTask,
  config: ContentRepoConfig,
  input: { ids?: string[] }
): Promise<ContentRepoPullOutcome> {
  const signal = taskControllers.get(task.id)?.signal;

  const pulled: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  let head = "";
  try {
    await updateContentTask(task.id, { phase: "checking" });
    const { entries, missingMedia } = await loadContentRepoEntries(undefined, {
      tolerateMissingMedia: true,
      recordIdentity: false,
    });
    const baselines = loadContentRepoBaselines();
    const transport = createContentRepoTransport(config);
    const resolved = await transport.resolveHead();
    head = resolved.commit;
    const remote = await transport.listTree(resolved.tree);
    const items = computeSyncStates({ entries, baselines, remote, missingMedia });
    const wanted = input.ids?.length ? new Set(input.ids) : null;
    const candidates = items.filter(
      (item) =>
        item.state === "to-pull" && (!wanted || (item.contentId && wanted.has(item.contentId)))
    );
    await initializeContentTaskItems(
      task.id,
      candidates.map((item, index) => ({
        path: item.path,
        ordinal: index,
        contentId: item.contentId,
        kind: item.kind,
        status: "pending" as const,
      }))
    );
    await updateContentTask(task.id, { total: candidates.length });

    for (const item of candidates) {
      signal?.throwIfAborted();
      setTaskPhaseSync(task.id, "pulling", item.path);
      updateContentTaskItemSync(task.id, item.path, { status: "running" });
      const baseline = baselines.get(item.path);
      if (!baseline || !item.remoteSha) {
        skipped.push({ path: item.path, reason: "missing-remote-state" });
        updateContentTaskItemSync(task.id, item.path, {
          status: "skipped",
          reason: "missing-remote-state",
          retryable: true,
        });
        continue;
      }
      const mediaChanged = Object.entries(baseline.media).some(
        ([mediaPath, recorded]) => remote.get(mediaPath) !== recorded.remoteSha
      );
      if (mediaChanged) {
        skipped.push({ path: item.path, reason: "attachment-changed" });
        updateContentTaskItemSync(task.id, item.path, {
          status: "skipped",
          reason: "attachment-changed",
          retryable: true,
        });
        await refreshContentTaskCounters(task.id);
        continue;
      }
      const row = findRowForRepoPath(item.path);
      if (!row) {
        skipped.push({ path: item.path, reason: "missing-local-content" });
        updateContentTaskItemSync(task.id, item.path, {
          status: "skipped",
          reason: "missing-local-content",
          retryable: true,
        });
        await refreshContentTaskCounters(task.id);
        continue;
      }
      try {
        const bytes = await transport.readBlob(item.remoteSha);
        const update = toDocumentUpdate(parseRemoteDocument(bytes));
        const updated = {
          slug: update.slug,
          title: update.title,
          body: update.body,
          draft: update.draft,
          public: update.public,
          category: update.category,
          tags: JSON.stringify(update.tags),
          author: update.author,
          image: update.image,
          publishDate: update.publishDate,
          updateDate: update.updateDate ?? row.updateDate,
          lastModified: Date.now(),
        };
        const kind = row.type === "memo" ? "memo" : "post";
        const document = buildCanonicalDocument(
          { ...toContentRecord(row), ...updated },
          { clipping: kind === "memo" ? clippingFrontmatterFor(row.id) : null }
        );
        db.update(posts)
          .set({ ...updated, contentHash: document.contentHash })
          .where(eq(posts.id, row.id))
          .run();
        const remoteBlobs: Record<string, string> = { [item.path]: item.remoteSha };
        for (const [mediaPath, recorded] of Object.entries(baseline.media))
          remoteBlobs[mediaPath] = recorded.remoteSha;
        persistBaselineRow({
          path: item.path,
          contentId: row.id,
          kind,
          contentHash: document.contentHash,
          document: new TextDecoder().decode(document.bytes),
          media: JSON.stringify(baseline.media),
          remoteBlobs: JSON.stringify(remoteBlobs),
          commitSha: head,
          updatedAt: Date.now(),
        });
        pulled.push(item.path);
        updateContentTaskItemSync(task.id, item.path, {
          status: "success",
          retryable: false,
        });
        await refreshContentTaskCounters(task.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Pull item failed";
        updateContentTaskItemSync(task.id, item.path, {
          status: "failed",
          error: message,
          retryable: !(error instanceof ContentRepoError) || error.kind === "failed",
        });
        throw error;
      }
    }

    if (pulled.length) clearSearchCache();
    await refreshContentTaskCounters(task.id);
    const outcome = pulled.length ? ("pulled" as const) : ("nothing" as const);
    setTaskResultSync(
      task.id,
      JSON.stringify(
        pullResultPayload({
          outcome,
          repository: config.repository,
          ref: config.ref,
          commit: head,
          pulled,
          skipped,
          message: pulled.length
            ? `Pulled ${pulled.length} content(s), skipped ${skipped.length}`
            : "Nothing to pull",
        })
      )
    );
    finishContentTask(task.id, "success");
    return {
      status: outcome,
      repository: config.repository,
      ref: config.ref,
      commit: head,
      pulled,
      skipped,
    };
  } catch (error) {
    const cancelled =
      (error instanceof DOMException && error.name === "AbortError") || signal?.aborted === true;
    await refreshContentTaskCounters(task.id);
    const message = cancelled
      ? "Content repository pull cancelled"
      : error instanceof Error
        ? error.message
        : "Content repository pull failed";
    setTaskResultSync(
      task.id,
      JSON.stringify(
        pullResultPayload({
          outcome: cancelled ? "cancelled" : "failed",
          repository: config.repository,
          ref: config.ref,
          commit: head,
          pulled,
          skipped,
          message,
        })
      )
    );
    finishContentTask(task.id, cancelled ? "cancelled" : "failed", cancelled ? undefined : message);
    return {
      status: cancelled ? ("nothing" as const) : ("failed" as const),
      repository: config.repository,
      ref: config.ref,
      pulled,
      skipped,
      message,
    };
  }
}

export function pullContentRepo(input: { ids?: string[] } = {}): Promise<ContentRepoPullOutcome> {
  if (pullFlight) return Promise.reject(new Error("Content repository pull already running"));
  pullFlight = (async () => {
    const resolved = resolveContentRepoConfig();
    if (!("config" in resolved))
      return {
        status: resolved.status,
        repository: resolved.repository,
        ref: resolved.ref,
        message: resolved.message,
      };
    const started = await startPullTask(resolved.config, input);
    if ("status" in started) return started;
    return runPullTask(started.task, started.config, input);
  })().finally(() => {
    pullFlight = undefined;
  });
  return pullFlight;
}

export async function startContentRepoPull(
  input: { ids?: string[] } = {}
): Promise<ContentRepoStartResult> {
  const resolved = resolveContentRepoConfig();
  if (!("config" in resolved))
    return { status: resolved.status, operation: "pull", message: resolved.message };
  const started = await startPullTask(resolved.config, input);
  if ("status" in started) return toStartResult(started, "pull");
  pullFlight = runPullTask(started.task, started.config, input).finally(() => {
    pullFlight = undefined;
  });
  pullFlight.catch(() => undefined);
  return { status: "started", taskId: started.task.id, operation: "pull" };
}

export interface ContentRepoMediaItem {
  path: string;
  mime: string;
  localSha: string | null;
  remoteSha: string | null;
  changed: boolean;
  missing: boolean;
}

export interface ContentRepoMediaOutcome {
  status: "ready" | "unconfigured" | "failed" | "saved";
  path: string;
  items?: ContentRepoMediaItem[];
  mediaPath?: string;
  message?: string;
}

/** Compare the attachments a content references on both sides without writing anything. */
export async function inspectContentMedia(input: {
  path: string;
}): Promise<ContentRepoMediaOutcome> {
  const { config, error } = readContentRepoConfigOrFail();
  if (!config) return { status: "failed", path: input.path, message: error ?? "" };
  if (!config.token)
    return {
      status: "unconfigured",
      path: input.path,
      message: "Content repository is not configured",
    };
  try {
    const context = await inspectContentRepo(config);
    const entry = context.entries.find((candidate) => candidate.document.path === input.path);
    const baseline = context.baselines.get(input.path);
    const mediaPaths = new Set<string>([
      ...(entry?.media.map((file) => file.path) ?? []),
      ...Object.keys(baseline?.media ?? {}),
    ]);
    const items = [...mediaPaths].sort().map((mediaPath) => {
      const local = entry?.media.find((file) => file.path === mediaPath) ?? null;
      const remoteSha = context.remote.get(mediaPath) ?? null;
      const recorded = baseline?.media[mediaPath]?.remoteSha ?? null;
      return {
        path: mediaPath,
        mime: inferPublicMediaMimeType(mediaPath),
        localSha: local?.sha256 ?? null,
        remoteSha,
        changed: remoteSha !== recorded,
        missing: !local,
      };
    });
    return { status: "ready", path: input.path, items };
  } catch (caught) {
    return {
      status: "failed",
      path: input.path,
      message: caught instanceof Error ? caught.message : "Content media inspection failed",
    };
  }
}

export interface ContentRepoRemoteMedia {
  status: "ready" | "unconfigured" | "failed";
  bytes?: Uint8Array;
  mime?: string;
  message?: string;
}

/** Read one repository attachment for in-page comparison or download. */
export async function readRemoteMedia(input: {
  sha: string;
  path: string;
}): Promise<ContentRepoRemoteMedia> {
  const { config, error } = readContentRepoConfigOrFail();
  if (!config) return { status: "failed", message: error ?? "" };
  if (!config.token)
    return { status: "unconfigured", message: "Content repository is not configured" };
  try {
    const bytes = await createContentRepoTransport(config).readBlob(input.sha);
    return { status: "ready", bytes, mime: inferPublicMediaMimeType(input.path) };
  } catch (caught) {
    return {
      status: "failed",
      message: caught instanceof Error ? caught.message : "Remote attachment read failed",
    };
  }
}

/** Replace a local attachment with its repository version and refresh its recorded identity. */
export async function adoptRemoteMedia(input: {
  path: string;
  mediaPath: string;
}): Promise<ContentRepoMediaOutcome> {
  const { config, error } = readContentRepoConfigOrFail();
  if (!config) return { status: "failed", path: input.path, message: error ?? "" };
  if (!config.token)
    return {
      status: "unconfigured",
      path: input.path,
      message: "Content repository is not configured",
    };
  try {
    const context = await inspectContentRepo(config);
    const remoteSha = context.remote.get(input.mediaPath);
    if (!remoteSha)
      return { status: "failed", path: input.path, message: "Remote attachment is unavailable" };
    if (!isLocalContentEnabled())
      return { status: "failed", path: input.path, message: "Media storage is not configured" };
    const bytes = await context.transport.readBlob(remoteSha);
    const target = getLocalPath(input.mediaPath);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);
    recordMediaIdentity(input.mediaPath, bytes, inferPublicMediaMimeType(input.mediaPath));
    return { status: "saved", path: input.path, mediaPath: input.mediaPath };
  } catch (caught) {
    return {
      status: "failed",
      path: input.path,
      message: caught instanceof Error ? caught.message : "Remote attachment adoption failed",
    };
  }
}

export interface ContentRepoResolveOutcome {
  status: "saved" | "unavailable" | "failed";
  path: string;
  /** Content id; callers must push by id, never by repository path. */
  contentId?: string;
  contentHash?: string;
  message?: string;
}

/**
 * Write a human-resolved document back into the content library.
 * The sync baseline is intentionally left untouched so the next check reports
 * `to-push`; resolution never implies publishing.
 */
export function saveResolvedContent(input: {
  path: string;
  text: string;
}): ContentRepoResolveOutcome {
  try {
    const bytes = new TextEncoder().encode(input.text);
    const update = toDocumentUpdate(parseRemoteDocument(bytes));
    const row = findRowForRepoPath(input.path);
    if (!row) return { status: "unavailable", path: input.path, message: "Unknown path" };
    const document = buildCanonicalDocument({
      ...toContentRecord(row),
      ...{
        slug: update.slug,
        title: update.title,
        body: update.body,
        draft: update.draft,
        public: update.public,
        category: update.category,
        tags: JSON.stringify(update.tags),
        author: update.author,
        image: update.image,
        publishDate: update.publishDate,
        updateDate: update.updateDate ?? row.updateDate,
      },
    });
    db.update(posts)
      .set({
        slug: update.slug,
        title: update.title,
        body: update.body,
        draft: update.draft,
        public: update.public,
        category: update.category,
        tags: JSON.stringify(update.tags),
        author: update.author,
        image: update.image,
        publishDate: update.publishDate,
        updateDate: update.updateDate ?? row.updateDate,
        lastModified: Date.now(),
        contentHash: document.contentHash,
      })
      .where(eq(posts.id, row.id))
      .run();
    clearSearchCache();
    return {
      status: "saved",
      path: input.path,
      contentId: row.id,
      contentHash: document.contentHash,
    };
  } catch (error) {
    return {
      status: "failed",
      path: input.path,
      message: error instanceof Error ? error.message : "Content resolution failed",
    };
  }
}

export interface ContentRepoDiffOutcome {
  status: "ready" | "unavailable" | "unconfigured" | "failed";
  path: string;
  state?: string;
  baseText?: string | null;
  localText?: string | null;
  remoteText?: string | null;
  mergedText?: string | null;
  conflictingFields?: string[];
  bodyConflicts?: number;
  regions?: MergeRegionView[];
  message?: string;
}

/** Read-only three-way view of one content for the administrator diff surface. */
export async function diffContentRepo(input: { path: string }): Promise<ContentRepoDiffOutcome> {
  const { config, error } = readContentRepoConfigOrFail();
  if (!config) return { status: "failed", path: input.path, message: error ?? "" };
  if (!config.token)
    return {
      status: "unconfigured",
      path: input.path,
      message: "Content repository is not configured",
    };
  try {
    const context = await inspectContentRepo(config);
    const item = context.items.find((candidate) => candidate.path === input.path);
    if (!item) return { status: "unavailable", path: input.path, message: "Unknown path" };
    const entry = context.entries.find((candidate) => candidate.document.path === input.path);
    const baseline = context.baselines.get(input.path);
    const decoder = new TextDecoder();
    const baseText = baseline?.document ?? null;
    const localText = entry ? decoder.decode(entry.document.bytes) : null;
    const remoteText = item.remoteSha
      ? decoder.decode(await context.transport.readBlob(item.remoteSha))
      : null;
    if (!baseText || !localText || !remoteText)
      return {
        status: "ready",
        path: input.path,
        state: item.state,
        baseText,
        localText,
        remoteText,
      };

    const baseDoc = parseRemoteDocument(new TextEncoder().encode(baseText));
    const localDoc = parseRemoteDocument(new TextEncoder().encode(localText));
    const remoteDoc = parseRemoteDocument(new TextEncoder().encode(remoteText));
    const frontmatter = mergeFrontmatter(
      baseDoc.frontmatter,
      localDoc.frontmatter,
      remoteDoc.frontmatter
    );
    const body = mergeBody(
      baseDoc.body.split("\n"),
      localDoc.body.split("\n"),
      remoteDoc.body.split("\n")
    );
    return {
      status: "ready",
      path: input.path,
      state: item.state,
      baseText,
      localText,
      remoteText,
      mergedText: new TextDecoder().decode(
        serializeCanonicalDocument(frontmatter.value, body.lines.join("\n"))
      ),
      conflictingFields: frontmatter.conflicts,
      bodyConflicts: body.conflicts,
      regions: mergeRegions(baseText.split("\n"), localText.split("\n"), remoteText.split("\n")),
    };
  } catch (caught) {
    return {
      status: "failed",
      path: input.path,
      message: caught instanceof Error ? caught.message : "Content repository diff failed",
    };
  }
}

export interface ContentRepoAdoptOutcome {
  status: "accepted" | "removed" | "nothing" | "unconfigured" | "failed";
  repository: string | null;
  ref: string | null;
  commit?: string;
  paths?: string[];
  skipped?: { path: string; reason: string }[];
  message?: string;
}

async function inspectContentRepo(config: ContentRepoConfig) {
  const { entries, missingMedia } = await loadContentRepoEntries(undefined, {
    tolerateMissingMedia: true,
    recordIdentity: false,
  });
  const baselines = loadContentRepoBaselines();
  const transport = createContentRepoTransport(config);
  const head = await transport.resolveHead();
  const remote = await transport.listTree(head.tree);
  const items = computeSyncStates({ entries, baselines, remote, missingMedia });
  return { entries, baselines, transport, head, remote, items };
}

function readContentRepoConfigOrFail() {
  try {
    return { config: readContentRepoConfig(), error: null as string | null };
  } catch (error) {
    return {
      config: null,
      error: error instanceof Error ? error.message : "Invalid configuration",
    };
  }
}

/**
 * Adopt repository files the content library has never seen. Only `remote-new`
 * paths are eligible; anything else is refused by name.
 */
export async function acceptRemoteNew(
  input: { paths?: string[] } = {}
): Promise<ContentRepoAdoptOutcome> {
  const { config, error } = readContentRepoConfigOrFail();
  if (!config) return { status: "failed", repository: null, ref: null, message: error ?? "" };
  if (!config.token)
    return { status: "unconfigured", repository: config.repository, ref: config.ref };
  const wanted = new Set(input.paths?.length ? input.paths : []);
  const accepted: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  try {
    const context = await inspectContentRepo(config);
    const decoder = new TextDecoder();
    for (const item of context.items) {
      if (item.state !== "remote-new") continue;
      if (wanted.size && !wanted.has(item.path)) continue;
      if (!item.remoteSha) continue;
      const bytes = await context.transport.readBlob(item.remoteSha);
      const update = toDocumentUpdate(parseRemoteDocument(bytes));
      const document = buildCanonicalDocument({
        id: item.path,
        type: item.kind,
        slug: update.slug,
        title: update.title,
        excerpt: null,
        body: update.body,
        draft: update.draft,
        public: update.public,
        category: update.category,
        tags: JSON.stringify(update.tags),
        author: update.author,
        image: update.image,
        publishDate: update.publishDate,
        updateDate: update.updateDate,
        filePath: item.path,
        metadata: null,
      });
      const now = Date.now();
      db.insert(posts)
        .values({
          id: item.path,
          type: item.kind,
          slug: update.slug,
          title: update.title,
          excerpt: update.body.slice(0, 200),
          body: update.body,
          publishDate: update.publishDate,
          updateDate: update.updateDate,
          draft: update.draft,
          public: update.public,
          category: update.category,
          tags: JSON.stringify(update.tags),
          author: update.author,
          image: update.image,
          metadata: null,
          dataSource: "content-repo",
          contentHash: document.contentHash,
          lastModified: now,
          source: "content-repo",
          filePath: item.path,
        })
        .run();
      persistBaselineRow({
        path: item.path,
        contentId: item.path,
        kind: item.kind,
        contentHash: document.contentHash,
        document: decoder.decode(document.bytes),
        media: JSON.stringify({}),
        remoteBlobs: JSON.stringify({ [item.path]: item.remoteSha }),
        commitSha: context.head.commit,
        updatedAt: now,
      });
      accepted.push(item.path);
    }
    if (accepted.length) clearSearchCache();
    return {
      status: accepted.length ? "accepted" : "nothing",
      repository: config.repository,
      ref: config.ref,
      commit: context.head.commit,
      paths: accepted,
      skipped,
    };
  } catch (caught) {
    return {
      status: "failed",
      repository: config.repository,
      ref: config.ref,
      paths: accepted,
      skipped,
      message: caught instanceof Error ? caught.message : "Content repository adoption failed",
    };
  }
}

/**
 * Remove content whose repository file disappeared and whose local text never
 * changed after the last sync. Any other state is refused by name.
 */
export async function removeRemoteDeleted(
  input: { paths?: string[] } = {}
): Promise<ContentRepoAdoptOutcome> {
  const { config, error } = readContentRepoConfigOrFail();
  if (!config) return { status: "failed", repository: null, ref: null, message: error ?? "" };
  if (!config.token)
    return { status: "unconfigured", repository: config.repository, ref: config.ref };
  const wanted = new Set(input.paths?.length ? input.paths : []);
  const removed: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  try {
    const context = await inspectContentRepo(config);
    for (const item of context.items) {
      if (item.state !== "remote-deleted") continue;
      if (wanted.size && !wanted.has(item.path)) continue;
      const row = findRowForRepoPath(item.path);
      if (!row) {
        skipped.push({ path: item.path, reason: "missing-local-content" });
        continue;
      }
      db.transaction((tx) => {
        tx.delete(posts).where(eq(posts.id, row.id)).run();
        tx.delete(contentRepoBaselines).where(eq(contentRepoBaselines.path, item.path)).run();
      });
      removed.push(item.path);
    }
    if (removed.length) clearSearchCache();
    return {
      status: removed.length ? "removed" : "nothing",
      repository: config.repository,
      ref: config.ref,
      commit: context.head.commit,
      paths: removed,
      skipped,
    };
  } catch (caught) {
    return {
      status: "failed",
      repository: config.repository,
      ref: config.ref,
      paths: removed,
      skipped,
      message: caught instanceof Error ? caught.message : "Content repository removal failed",
    };
  }
}

export interface ContentRepoMergeConflict {
  path: string;
  fields: string[];
  bodyConflicts: number;
}

export interface ContentRepoMergeOutcome {
  status: "merged" | "conflicts" | "nothing" | "unconfigured" | "failed" | "busy";
  repository: string | null;
  ref: string | null;
  commit?: string;
  merged?: string[];
  conflicts?: ContentRepoMergeConflict[];
  skipped?: { path: string; reason: string }[];
  message?: string;
}

function mergeResultPayload(input: {
  outcome: "merged" | "conflicts" | "nothing" | "failed" | "cancelled";
  repository: string;
  ref: string;
  commit: string;
  merged: string[];
  conflicts: ContentRepoMergeConflict[];
  skipped: { path: string; reason: string }[];
  message: string;
}) {
  return {
    operation: "merge" as const,
    outcome: input.outcome,
    repository: input.repository,
    ref: input.ref,
    commit: input.commit,
    counts: {
      merged: input.merged.length,
      conflicts: input.conflicts.length,
      skipped: input.skipped.length,
    },
    conflicts: input.conflicts,
    message: input.message,
  };
}

let mergeFlight: Promise<ContentRepoMergeOutcome> | undefined;

async function startMergeTask(
  config: ContentRepoConfig,
  input: { ids?: string[] }
): Promise<{ task: ContentTask; config: ContentRepoConfig } | ContentRepoMergeOutcome> {
  const requestKey = input.ids?.length
    ? `content-repo-merge:${[...input.ids].sort().join(",")}`
    : "content-repo-merge:all";
  const started = await beginContentRepoTask({
    operation: "merge",
    requestKey,
    target: JSON.stringify({ ids: input.ids ?? null }),
  });
  if (started.busy)
    return busyOutcome(started.task, "merge", { repository: config.repository, ref: config.ref });
  return { task: started.task, config };
}

async function runMergeTask(
  task: ContentTask,
  config: ContentRepoConfig,
  input: { ids?: string[] }
): Promise<ContentRepoMergeOutcome> {
  const signal = taskControllers.get(task.id)?.signal;

  const merged: string[] = [];
  const conflicts: ContentRepoMergeConflict[] = [];
  const skipped: { path: string; reason: string }[] = [];
  let head = "";
  try {
    await updateContentTask(task.id, { phase: "checking" });
    const { entries, missingMedia } = await loadContentRepoEntries(undefined, {
      tolerateMissingMedia: true,
      recordIdentity: false,
    });
    const baselines = loadContentRepoBaselines();
    const transport = createContentRepoTransport(config);
    const resolved = await transport.resolveHead();
    head = resolved.commit;
    const remote = await transport.listTree(resolved.tree);
    const items = computeSyncStates({ entries, baselines, remote, missingMedia });
    const wanted = input.ids?.length ? new Set(input.ids) : null;
    const decoder = new TextDecoder();
    const candidates = items.filter(
      (item) =>
        item.state === "merge-conflict" &&
        (!wanted || (item.contentId !== null && wanted.has(item.contentId)))
    );
    await initializeContentTaskItems(
      task.id,
      candidates.map((item, index) => ({
        path: item.path,
        ordinal: index,
        contentId: item.contentId,
        kind: item.kind,
        status: "pending" as const,
      }))
    );
    await updateContentTask(task.id, { total: candidates.length });

    const skip = async (path: string, reason: string) => {
      skipped.push({ path, reason });
      updateContentTaskItemSync(task.id, path, {
        status: "skipped",
        reason,
        retryable: true,
      });
      await refreshContentTaskCounters(task.id);
    };

    for (const item of candidates) {
      signal?.throwIfAborted();
      setTaskPhaseSync(task.id, "merging", item.path);
      updateContentTaskItemSync(task.id, item.path, { status: "running" });
      const entry = entries.find((candidate) => candidate.document.path === item.path);
      if (!entry) {
        await skip(item.path, "missing-local-content");
        continue;
      }
      const baseline = baselines.get(item.path);
      if (!baseline?.document) {
        await skip(item.path, "baseline-document-unavailable");
        continue;
      }
      const mediaChanged = Object.entries(baseline.media).some(
        ([mediaPath, recorded]) => remote.get(mediaPath) !== recorded.remoteSha
      );
      if (mediaChanged) {
        await skip(item.path, "attachment-changed");
        continue;
      }
      if (!item.remoteSha) {
        await skip(item.path, "remote-deleted");
        continue;
      }

      const baseDoc = parseRemoteDocument(new TextEncoder().encode(baseline.document));
      const localDoc = parseRemoteDocument(entry.document.bytes);
      const remoteDoc = parseRemoteDocument(await transport.readBlob(item.remoteSha));
      const frontmatter = mergeFrontmatter(
        baseDoc.frontmatter,
        localDoc.frontmatter,
        remoteDoc.frontmatter
      );
      const body = mergeBody(
        baseDoc.body.split("\n"),
        localDoc.body.split("\n"),
        remoteDoc.body.split("\n")
      );
      if (frontmatter.conflicts.length || !body.clean) {
        conflicts.push({
          path: item.path,
          fields: frontmatter.conflicts,
          bodyConflicts: body.conflicts,
        });
        // A conflict is a normal outcome, not a task failure.
        updateContentTaskItemSync(task.id, item.path, {
          status: "conflict",
          reason: [...frontmatter.conflicts, `${body.conflicts} body conflict(s)`].join(", "),
          retryable: false,
        });
        await refreshContentTaskCounters(task.id);
        continue;
      }

      const bytes = serializeCanonicalDocument(frontmatter.value, body.lines.join("\n"));
      const update = toDocumentUpdate(parseRemoteDocument(bytes));
      const row = findRowForRepoPath(item.path);
      if (!row) {
        await skip(item.path, "missing-local-content");
        continue;
      }
      const updated = {
        slug: update.slug,
        title: update.title,
        body: update.body,
        draft: update.draft,
        public: update.public,
        category: update.category,
        tags: JSON.stringify(update.tags),
        author: update.author,
        image: update.image,
        publishDate: update.publishDate,
        updateDate: update.updateDate ?? row.updateDate,
        lastModified: Date.now(),
      };
      const kind = row.type === "memo" ? "memo" : "post";
      const document = buildCanonicalDocument(
        { ...toContentRecord(row), ...updated },
        { clipping: kind === "memo" ? clippingFrontmatterFor(row.id) : null }
      );
      db.update(posts)
        .set({ ...updated, contentHash: document.contentHash })
        .where(eq(posts.id, row.id))
        .run();
      const remoteBlobs: Record<string, string> = { [item.path]: item.remoteSha };
      for (const [mediaPath, recorded] of Object.entries(baseline.media))
        remoteBlobs[mediaPath] = recorded.remoteSha;
      persistBaselineRow({
        path: item.path,
        contentId: row.id,
        kind,
        contentHash: document.contentHash,
        document: decoder.decode(document.bytes),
        media: JSON.stringify(baseline.media),
        remoteBlobs: JSON.stringify(remoteBlobs),
        commitSha: head,
        updatedAt: Date.now(),
      });
      merged.push(item.path);
      updateContentTaskItemSync(task.id, item.path, { status: "success", retryable: false });
      await refreshContentTaskCounters(task.id);
    }

    if (merged.length) clearSearchCache();
    const status = conflicts.length
      ? ("conflicts" as const)
      : merged.length
        ? ("merged" as const)
        : ("nothing" as const);
    await refreshContentTaskCounters(task.id);
    setTaskResultSync(
      task.id,
      JSON.stringify(
        mergeResultPayload({
          outcome: status,
          repository: config.repository,
          ref: config.ref,
          commit: head,
          merged,
          conflicts,
          skipped,
          message: `Merged ${merged.length}, conflicts ${conflicts.length}, skipped ${skipped.length}`,
        })
      )
    );
    finishContentTask(task.id, "success");
    return {
      status,
      repository: config.repository,
      ref: config.ref,
      commit: head,
      merged,
      conflicts,
      skipped,
    };
  } catch (error) {
    const cancelled =
      (error instanceof DOMException && error.name === "AbortError") || signal?.aborted === true;
    await refreshContentTaskCounters(task.id);
    const message = cancelled
      ? "Content repository merge cancelled"
      : error instanceof Error
        ? error.message
        : "Content repository merge failed";
    setTaskResultSync(
      task.id,
      JSON.stringify(
        mergeResultPayload({
          outcome: cancelled ? "cancelled" : "failed",
          repository: config.repository,
          ref: config.ref,
          commit: head,
          merged,
          conflicts,
          skipped,
          message,
        })
      )
    );
    finishContentTask(task.id, cancelled ? "cancelled" : "failed", cancelled ? undefined : message);
    return {
      status: "failed" as const,
      repository: config.repository,
      ref: config.ref,
      merged,
      conflicts,
      skipped,
      message,
    };
  }
}

export function mergeContentRepo(input: { ids?: string[] } = {}): Promise<ContentRepoMergeOutcome> {
  if (mergeFlight) return Promise.reject(new Error("Content repository merge already running"));
  mergeFlight = (async () => {
    const resolved = resolveContentRepoConfig();
    if (!("config" in resolved))
      return {
        status: resolved.status,
        repository: resolved.repository,
        ref: resolved.ref,
        message: resolved.message,
      };
    const started = await startMergeTask(resolved.config, input);
    if ("status" in started) return started;
    return runMergeTask(started.task, started.config, input);
  })().finally(() => {
    mergeFlight = undefined;
  });
  return mergeFlight;
}

export async function startContentRepoMerge(
  input: { ids?: string[] } = {}
): Promise<ContentRepoStartResult> {
  const resolved = resolveContentRepoConfig();
  if (!("config" in resolved))
    return { status: resolved.status, operation: "merge", message: resolved.message };
  const started = await startMergeTask(resolved.config, input);
  if ("status" in started) return toStartResult(started, "merge");
  mergeFlight = runMergeTask(started.task, started.config, input).finally(() => {
    mergeFlight = undefined;
  });
  mergeFlight.catch(() => undefined);
  return { status: "started", taskId: started.task.id, operation: "merge" };
}

export interface ContentRepoCheckOutcome {
  status: "checked" | "unconfigured" | "failed";
  repository: string | null;
  ref: string | null;
  commit?: string;
  items?: ContentSyncStateItem[];
  counts?: ContentSyncCounts;
  message?: string;
}

export async function checkContentRepo(
  input: { ids?: string[] } = {}
): Promise<ContentRepoCheckOutcome> {
  let config: ContentRepoConfig;
  try {
    config = readContentRepoConfig();
  } catch (error) {
    return {
      status: "failed",
      repository: null,
      ref: null,
      message: error instanceof Error ? error.message : "Invalid configuration",
    };
  }
  if (!config.token)
    return { status: "unconfigured", repository: config.repository, ref: config.ref };

  try {
    // Check is read-only: loading must not record or repair media identity.
    const { entries, missingMedia } = await loadContentRepoEntries(input.ids, {
      tolerateMissingMedia: true,
      recordIdentity: false,
    });
    const transport = createContentRepoTransport(config);
    const head = await transport.resolveHead();
    const remote = await transport.listTree(head.tree);
    const items = computeSyncStates({
      entries,
      baselines: loadContentRepoBaselines(),
      remote,
      missingMedia,
    });
    return {
      status: "checked",
      repository: config.repository,
      ref: config.ref,
      commit: head.commit,
      items,
      counts: summarizeSyncStates(items),
    };
  } catch (error) {
    return {
      status: "failed",
      repository: config.repository,
      ref: config.ref,
      message: error instanceof Error ? error.message : "Content repository check failed",
    };
  }
}

export function readContentRepoStatus(): ContentRepoStatus {
  try {
    const config = readContentRepoConfig();
    let baselines = 0;
    try {
      baselines = db.select().from(contentRepoBaselines).all().length;
    } catch {
      baselines = 0;
    }
    return {
      configured: Boolean(config.token),
      repository: config.repository,
      ref: config.ref,
      baselines,
    };
  } catch (error) {
    return {
      configured: false,
      repository: null,
      ref: null,
      baselines: 0,
      message: error instanceof Error ? error.message : "Invalid configuration",
    };
  }
}

/**
 * Retry only the items that did not succeed. A task without item rows (older
 * task) falls back to its original target so the operator is never blocked.
 */
export async function retryContentRepoTask(taskId: string): Promise<ContentRepoStartResult> {
  const task = await getContentTask(taskId);
  if (!task) return { status: "failed", operation: "push", message: "Task not found" };
  const operation: ContentTaskOperation = (task.operation as ContentTaskOperation | null) ?? "push";
  if (task.source !== "content-repo")
    return {
      status: "failed",
      operation,
      taskId: task.id,
      message: "Task is not a content repository task",
    };
  if (task.finishedAt === null)
    return {
      status: "busy",
      operation,
      taskId: task.id,
      message: "Task is still running",
    };
  const items = await listContentTaskItems(task.id);
  if (!items.length) {
    const target = parseTaskTarget(task.target);
    return startContentRepoOperation(operation, target);
  }
  const retryable = items.filter(
    (item) => item.retryable && ["failed", "pending", "skipped", "blocked"].includes(item.status)
  );
  const ids = [
    ...new Set(retryable.map((item) => item.contentId).filter((id): id is string => Boolean(id))),
  ];
  if (!ids.length && retryable.length)
    return {
      status: "failed",
      operation,
      message: "Retryable items have no content id; start the batch again",
    };
  if (!ids.length)
    return { status: "failed", operation, taskId: task.id, message: "Nothing to retry" };
  return startContentRepoOperation(operation, { ids });
}

function parseTaskTarget(target: string): { ids?: string[]; all?: boolean } {
  try {
    const parsed: unknown = JSON.parse(target);
    if (!parsed || typeof parsed !== "object") return { all: true };
    const ids = (parsed as { ids?: unknown }).ids;
    if (!Array.isArray(ids) || !ids.length) return { all: true };
    return { ids: ids.filter((id): id is string => typeof id === "string") };
  } catch {
    return { all: true };
  }
}

function startContentRepoOperation(
  operation: ContentTaskOperation,
  input: { ids?: string[]; all?: boolean }
): Promise<ContentRepoStartResult> {
  if (operation === "pull") return startContentRepoPull({ ids: input.ids });
  if (operation === "merge") return startContentRepoMerge({ ids: input.ids });
  return startContentRepoPush({ ids: input.ids, all: input.all });
}
