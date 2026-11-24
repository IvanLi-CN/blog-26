import type { CanonicalDocument } from "./canonical";

export interface ContentRepoMediaFile {
  path: string;
  bytes: Uint8Array;
  sha256: string;
}

export interface ContentRepoEntry {
  contentId: string;
  document: CanonicalDocument;
  media: ContentRepoMediaFile[];
}

export interface ContentRepoBaselineMedia {
  sha256: string;
  remoteSha: string;
}

export interface ContentRepoBaseline {
  contentHash: string;
  repoPath: string;
  /** Content library id; repository paths are not content ids. */
  contentId?: string | null;
  /** Canonical ancestors text used for three-way merges. */
  document?: string | null;
  media: Record<string, ContentRepoBaselineMedia>;
  remoteBlobs: Record<string, string>;
}

export type PushItemStatus = "write" | "unchanged" | "claim-required" | "oversized";

export interface PushItem {
  path: string;
  kind: "post" | "memo";
  status: PushItemStatus;
  contentHash: string;
  reason?: string;
  media: { path: string; sha256: string; changed: boolean }[];
}

/** Progress sink used by the executing service; planning stays pure without it. */
export interface PushPlanObserver {
  onPlan?(item: PushItem, entry: ContentRepoEntry): void;
  onWrite?(write: PushWrite): void;
  onRefUpdateStart?(commit: string): void;
}

export interface PushWrite {
  path: string;
  bytes: Uint8Array;
  source: "document" | "media";
}

export interface PushPlan {
  items: PushItem[];
  writes: PushWrite[];
  counts: { post: number; memo: number; media: number };
  skipped: number;
  conflicts: number;
  blocked: number;
}

export interface PushPlanInput {
  entries: ContentRepoEntry[];
  remote: Map<string, string>;
  baselines: Map<string, ContentRepoBaseline>;
  maxFileBytes: (kind: "post" | "memo") => number;
  /** Optional progress sink; planning stays pure without it. */
  observer?: PushPlanObserver;
}

function mediaChanged(
  file: ContentRepoMediaFile,
  baseline: ContentRepoBaseline,
  remote: Map<string, string>
): boolean {
  const recorded = baseline.media[file.path];
  if (!recorded) return true;
  if (recorded.sha256 !== file.sha256) return true;
  const remoteSha = remote.get(file.path);
  return !remoteSha || remoteSha !== recorded.remoteSha;
}

export function planPush(input: PushPlanInput): PushPlan {
  const items: PushItem[] = [];
  const writes: PushWrite[] = [];
  const counts = { post: 0, memo: 0, media: 0 };
  let skipped = 0;
  let conflicts = 0;
  let blocked = 0;

  const entries = [...input.entries].sort((left, right) =>
    left.document.path.localeCompare(right.document.path)
  );

  for (const entry of entries) {
    const document = entry.document;
    const path = document.path;
    const baseline = input.baselines.get(path);
    const limit = input.maxFileBytes(document.kind);

    const oversized =
      document.bytes.byteLength > limit ||
      entry.media.some((file) => file.bytes.byteLength > limit);
    if (oversized) {
      blocked += 1;
      items.push({
        path,
        kind: document.kind,
        status: "oversized",
        contentHash: document.contentHash,
        reason: "Content or attachment exceeds the configured size limit",
        media: [],
      });
      continue;
    }

    if (!baseline && input.remote.has(path)) {
      conflicts += 1;
      items.push({
        path,
        kind: document.kind,
        status: "claim-required",
        contentHash: document.contentHash,
        reason: "The repository already contains this path without a sync baseline",
        media: [],
      });
      continue;
    }

    const media = entry.media.map((file) => ({
      path: file.path,
      sha256: file.sha256,
      changed: baseline ? mediaChanged(file, baseline, input.remote) : true,
    }));
    const documentUnchanged = baseline?.contentHash === document.contentHash;
    if (documentUnchanged && media.every((file) => !file.changed)) {
      skipped += 1;
      items.push({
        path,
        kind: document.kind,
        status: "unchanged",
        contentHash: document.contentHash,
        media,
      });
      continue;
    }

    writes.push({ path, bytes: document.bytes, source: "document" });
    counts[document.kind] += 1;
    for (const [index, file] of entry.media.entries()) {
      if (!media[index]?.changed) continue;
      writes.push({ path: file.path, bytes: file.bytes, source: "media" });
      counts.media += 1;
    }
    items.push({
      path,
      kind: document.kind,
      status: "write",
      contentHash: document.contentHash,
      media,
    });
  }

  for (const item of items) {
    const entry = input.entries.find((candidate) => candidate.document.path === item.path);
    if (entry) input.observer?.onPlan?.(item, entry);
  }
  writes.sort((left, right) => left.path.localeCompare(right.path));
  return { items, writes, counts, skipped, conflicts, blocked };
}

export function buildCommitMessage(counts: { post: number; memo: number }): string {
  return `content: push ${counts.post} post(s) and ${counts.memo} memo(s) from console`;
}
