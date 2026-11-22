import { readFile } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { getLocalPath, isLocalContentEnabled } from "@/config/paths";
import { clearSearchCache } from "@/lib/ai/search-cache";
import {
  buildCanonicalDocument,
  type ContentRecord,
  sha256Hex,
} from "@/lib/content-repo/canonical";
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
import { mergeBody, mergeFrontmatter } from "@/lib/content-repo/merge";
import {
  buildCommitMessage,
  type ContentRepoBaseline,
  type ContentRepoEntry,
  type ContentRepoMediaFile,
  type PushItem,
  type PushPlan,
  planPush,
} from "@/lib/content-repo/push";
import {
  type ContentSyncCounts,
  type ContentSyncStateItem,
  computeSyncStates,
  summarizeSyncStates,
} from "@/lib/content-repo/state";
import { db } from "@/lib/db";
import { contentRepoBaselines, memoClippings, posts } from "@/lib/schema";
import { beginContentTask, finishContentTask, updateContentTask } from "./content-tasks";
import { recordMediaIdentity, verifyMediaIdentity } from "./media-identity";

const FILE_LIMITS = {
  post: CONTENT_REPO_MAX_POST_FILE_BYTES,
  memo: CONTENT_REPO_MAX_MEMO_FILE_BYTES,
} as const;

export interface ContentRepoPushInput {
  ids?: string[];
  all?: boolean;
}

export interface ContentRepoPushOutcome {
  status: "pushed" | "unchanged" | "unconfigured" | "failed";
  repository: string | null;
  ref: string | null;
  commit?: string;
  counts?: { post: number; memo: number; media: number };
  items?: PushItem[];
  message?: string;
}

export interface ContentRepoStatus {
  configured: boolean;
  repository: string | null;
  ref: string | null;
  baselines: number;
  message?: string;
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

export async function loadContentRepoEntries(
  ids?: string[],
  options: { tolerateMissingMedia?: boolean } = {}
): Promise<{ entries: ContentRepoEntry[]; missingMedia: Map<string, string[]> }> {
  const where = ids?.length ? inArray(posts.id, ids) : inArray(posts.type, ["post", "memo"]);
  const rows = db
    .select()
    .from(posts)
    .where(where)
    .all()
    .filter((row) => row.type === "post" || row.type === "memo");
  if (rows.length > CONTENT_REPO_MAX_BATCH_CONTENTS)
    throw new ContentRepoError(
      "invalid",
      `A push batch is limited to ${CONTENT_REPO_MAX_BATCH_CONTENTS} contents`
    );

  const entries: ContentRepoEntry[] = [];
  const missingMedia = new Map<string, string[]>();
  for (const row of rows) {
    const record = toContentRecord(row);
    const kind = record.type === "memo" ? "memo" : "post";
    const clipping =
      kind === "memo"
        ? db.select().from(memoClippings).where(eq(memoClippings.memoId, record.id)).get()
        : null;
    const document = buildCanonicalDocument(record, {
      clipping: clipping?.targetUrl
        ? { targetUrl: clipping.targetUrl, capturedAt: new Date(clipping.updatedAt).toISOString() }
        : null,
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
      if (identity.status === "record") recordMediaIdentity(path, bytes);
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

export async function pushEntriesToRepo(
  transport: ContentRepoTransport,
  entries: ContentRepoEntry[],
  baselines: Map<string, ContentRepoBaseline>
): Promise<{ plan: PushPlan; commit: string | null; writtenShas: Map<string, string> }> {
  let plan = planPush({
    entries,
    remote: new Map(),
    baselines,
    maxFileBytes: (kind) => FILE_LIMITS[kind],
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const head = await transport.resolveHead();
    const remote = await transport.listTree(head.tree);
    plan = planPush({ entries, remote, baselines, maxFileBytes: (kind) => FILE_LIMITS[kind] });
    if (!plan.writes.length) return { plan, commit: null, writtenShas: new Map() };

    const writtenShas = new Map<string, string>();
    for (const write of plan.writes)
      writtenShas.set(write.path, await transport.createBlob(write.bytes));
    const tree = await transport.createTree(
      head.tree,
      [...writtenShas].map(([path, sha]) => ({ path, sha }))
    );
    const commit = await transport.createCommit({
      message: buildCommitMessage(plan.counts),
      tree,
      parents: [head.commit],
    });
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

export function pushContentRepo(input: ContentRepoPushInput = {}): Promise<ContentRepoPushOutcome> {
  if (flight) return Promise.reject(new Error("Content repository push already running"));
  flight = (async () => {
    let config: ContentRepoConfig;
    try {
      config = readContentRepoConfig();
    } catch (error) {
      return {
        status: "failed" as const,
        repository: null,
        ref: null,
        message: error instanceof ContentRepoConfigError ? error.message : "Invalid configuration",
      };
    }
    if (!config.token)
      return { status: "unconfigured" as const, repository: config.repository, ref: config.ref };
    if (input.ids?.length && input.all)
      throw new Error("A push targets either explicit contents or the whole library");
    if (input.ids && !input.ids.length && !input.all)
      throw new Error("A push needs at least one content or the whole library");

    const ids = input.all ? undefined : input.ids;
    const requestKey = ids?.length
      ? `content-repo-push:${[...ids].sort().join(",")}`
      : "content-repo-push:all";
    const { task } = await beginContentTask({
      kind: "sync",
      source: "content-repo",
      requestKey,
      origin: "manual",
      target: JSON.stringify({ ids: ids ?? null }),
    });

    try {
      const { entries } = await loadContentRepoEntries(ids);
      await updateContentTask(task.id, { phase: "planning", total: entries.length });
      const baselines = loadContentRepoBaselines();
      const transport = createContentRepoTransport(config);
      const { plan, commit, writtenShas } = await pushEntriesToRepo(transport, entries, baselines);

      if (!commit) {
        finishContentTask(task.id, "unchanged");
        return {
          status: "unchanged" as const,
          repository: config.repository,
          ref: config.ref,
          counts: plan.counts,
          items: plan.items,
        };
      }

      persistBaselines(plan.items, entries, writtenShas, commit, baselines);
      finishContentTask(task.id, "success");
      return {
        status: "pushed" as const,
        repository: config.repository,
        ref: config.ref,
        commit,
        counts: plan.counts,
        items: plan.items,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Content repository push failed";
      finishContentTask(task.id, "failed", message);
      throw error;
    }
  })().finally(() => {
    flight = undefined;
  });
  return flight;
}

export interface ContentRepoPullOutcome {
  status: "pulled" | "nothing" | "unconfigured" | "failed";
  repository: string | null;
  ref: string | null;
  commit?: string;
  pulled?: string[];
  skipped?: { path: string; reason: string }[];
  message?: string;
}

let pullFlight: Promise<ContentRepoPullOutcome> | undefined;

export function pullContentRepo(input: { ids?: string[] } = {}): Promise<ContentRepoPullOutcome> {
  if (pullFlight) return Promise.reject(new Error("Content repository pull already running"));
  pullFlight = (async () => {
    let config: ContentRepoConfig;
    try {
      config = readContentRepoConfig();
    } catch (error) {
      return {
        status: "failed" as const,
        repository: null,
        ref: null,
        message: error instanceof Error ? error.message : "Invalid configuration",
      };
    }
    if (!config.token)
      return { status: "unconfigured" as const, repository: config.repository, ref: config.ref };

    const pulled: string[] = [];
    const skipped: { path: string; reason: string }[] = [];
    try {
      const { entries, missingMedia } = await loadContentRepoEntries(undefined, {
        tolerateMissingMedia: true,
      });
      const baselines = loadContentRepoBaselines();
      const transport = createContentRepoTransport(config);
      const head = await transport.resolveHead();
      const remote = await transport.listTree(head.tree);
      const items = computeSyncStates({ entries, baselines, remote, missingMedia });
      const wanted = input.ids?.length ? new Set(input.ids) : null;

      for (const item of items) {
        if (item.state !== "to-pull") continue;
        if (wanted && !wanted.has(item.path)) continue;
        if (item.kind !== "post") {
          skipped.push({ path: item.path, reason: "memo-pull-requires-authority-cutover" });
          continue;
        }
        const baseline = baselines.get(item.path);
        if (!baseline || !item.remoteSha) continue;
        const mediaChanged = Object.entries(baseline.media).some(
          ([mediaPath, recorded]) => remote.get(mediaPath) !== recorded.remoteSha
        );
        if (mediaChanged) {
          skipped.push({ path: item.path, reason: "attachment-changed" });
          continue;
        }
        const row = db.select().from(posts).where(eq(posts.filePath, item.path)).get();
        if (!row) {
          skipped.push({ path: item.path, reason: "missing-local-content" });
          continue;
        }
        const bytes = await transport.readBlob(item.remoteSha);
        const update = toDocumentUpdate(parseRemoteDocument(bytes));
        const nextBody = update.body;
        const updated = {
          slug: update.slug,
          title: update.title,
          body: nextBody,
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
        const document = buildCanonicalDocument({
          ...toContentRecord(row),
          ...updated,
        });
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
          kind: "post",
          contentHash: document.contentHash,
          document: new TextDecoder().decode(document.bytes),
          media: JSON.stringify(baseline.media),
          remoteBlobs: JSON.stringify(remoteBlobs),
          commitSha: head.commit,
          updatedAt: Date.now(),
        });
        pulled.push(item.path);
      }

      if (pulled.length) clearSearchCache();
      return {
        status: pulled.length ? ("pulled" as const) : ("nothing" as const),
        repository: config.repository,
        ref: config.ref,
        commit: head.commit,
        pulled,
        skipped,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        repository: config.repository,
        ref: config.ref,
        pulled,
        skipped,
        message: error instanceof Error ? error.message : "Content repository pull failed",
      };
    }
  })().finally(() => {
    pullFlight = undefined;
  });
  return pullFlight;
}

export interface ContentRepoMergeConflict {
  path: string;
  fields: string[];
  bodyConflicts: number;
}

export interface ContentRepoMergeOutcome {
  status: "merged" | "conflicts" | "nothing" | "unconfigured" | "failed";
  repository: string | null;
  ref: string | null;
  commit?: string;
  merged?: string[];
  conflicts?: ContentRepoMergeConflict[];
  skipped?: { path: string; reason: string }[];
  message?: string;
}

let mergeFlight: Promise<ContentRepoMergeOutcome> | undefined;

export function mergeContentRepo(input: { ids?: string[] } = {}): Promise<ContentRepoMergeOutcome> {
  if (mergeFlight) return Promise.reject(new Error("Content repository merge already running"));
  mergeFlight = (async () => {
    let config: ContentRepoConfig;
    try {
      config = readContentRepoConfig();
    } catch (error) {
      return {
        status: "failed" as const,
        repository: null,
        ref: null,
        message: error instanceof Error ? error.message : "Invalid configuration",
      };
    }
    if (!config.token)
      return { status: "unconfigured" as const, repository: config.repository, ref: config.ref };

    const merged: string[] = [];
    const conflicts: ContentRepoMergeConflict[] = [];
    const skipped: { path: string; reason: string }[] = [];
    try {
      const { entries, missingMedia } = await loadContentRepoEntries(undefined, {
        tolerateMissingMedia: true,
      });
      const baselines = loadContentRepoBaselines();
      const transport = createContentRepoTransport(config);
      const head = await transport.resolveHead();
      const remote = await transport.listTree(head.tree);
      const items = computeSyncStates({ entries, baselines, remote, missingMedia });
      const wanted = input.ids?.length ? new Set(input.ids) : null;
      const decoder = new TextDecoder();

      for (const item of items) {
        if (item.state !== "merge-conflict") continue;
        if (wanted && !wanted.has(item.path)) continue;
        const entry = entries.find((candidate) => candidate.document.path === item.path);
        if (!entry) {
          skipped.push({ path: item.path, reason: "missing-local-content" });
          continue;
        }
        if (item.kind !== "post") {
          skipped.push({ path: item.path, reason: "memo-merge-requires-authority-cutover" });
          continue;
        }
        const baseline = baselines.get(item.path);
        if (!baseline?.document) {
          skipped.push({ path: item.path, reason: "baseline-document-unavailable" });
          continue;
        }
        const mediaChanged = Object.entries(baseline.media).some(
          ([mediaPath, recorded]) => remote.get(mediaPath) !== recorded.remoteSha
        );
        if (mediaChanged) {
          skipped.push({ path: item.path, reason: "attachment-changed" });
          continue;
        }
        if (!item.remoteSha) {
          skipped.push({ path: item.path, reason: "remote-deleted" });
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
          continue;
        }

        const bytes = serializeCanonicalDocument(frontmatter.value, body.lines.join("\n"));
        const update = toDocumentUpdate(parseRemoteDocument(bytes));
        const row = db.select().from(posts).where(eq(posts.filePath, item.path)).get();
        if (!row) {
          skipped.push({ path: item.path, reason: "missing-local-content" });
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
        const document = buildCanonicalDocument({ ...toContentRecord(row), ...updated });
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
          kind: "post",
          contentHash: document.contentHash,
          document: decoder.decode(document.bytes),
          media: JSON.stringify(baseline.media),
          remoteBlobs: JSON.stringify(remoteBlobs),
          commitSha: head.commit,
          updatedAt: Date.now(),
        });
        merged.push(item.path);
      }

      if (merged.length) clearSearchCache();
      const status = conflicts.length
        ? ("conflicts" as const)
        : merged.length
          ? ("merged" as const)
          : ("nothing" as const);
      return {
        status,
        repository: config.repository,
        ref: config.ref,
        commit: head.commit,
        merged,
        conflicts,
        skipped,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        repository: config.repository,
        ref: config.ref,
        merged,
        conflicts,
        skipped,
        message: error instanceof Error ? error.message : "Content repository merge failed",
      };
    }
  })().finally(() => {
    mergeFlight = undefined;
  });
  return mergeFlight;
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
    const { entries, missingMedia } = await loadContentRepoEntries(input.ids, {
      tolerateMissingMedia: true,
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
