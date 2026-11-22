import type { ContentRepoBaseline, ContentRepoEntry } from "./push";

export type ContentSyncState =
  | "synced"
  | "to-push"
  | "to-pull"
  | "remote-new"
  | "remote-deleted"
  | "merge-conflict";

export interface ContentSyncStateItem {
  path: string;
  kind: "post" | "memo";
  state: ContentSyncState;
  localHash: string | null;
  baselineHash: string | null;
  remoteSha: string | null;
  baselineSha: string | null;
  changedMedia: string[];
  missingMedia: string[];
}

export interface ContentSyncStateInput {
  entries: ContentRepoEntry[];
  baselines: Map<string, ContentRepoBaseline>;
  remote: Map<string, string>;
  missingMedia?: Map<string, string[]>;
}

function changedMediaPaths(entry: ContentRepoEntry, baseline: ContentRepoBaseline) {
  const changed: string[] = [];
  for (const file of entry.media) {
    const recorded = baseline.media[file.path];
    if (!recorded || recorded.sha256 !== file.sha256) changed.push(file.path);
  }
  for (const path of Object.keys(baseline.media))
    if (!entry.media.some((file) => file.path === path)) changed.push(path);
  return changed.sort();
}

export function computeSyncStates(input: ContentSyncStateInput): ContentSyncStateItem[] {
  const byPath = new Map(input.entries.map((entry) => [entry.document.path, entry]));
  const paths = new Set<string>([...byPath.keys(), ...input.baselines.keys()]);
  const items: ContentSyncStateItem[] = [];

  for (const path of [...paths].sort()) {
    const entry = byPath.get(path);
    const baseline = input.baselines.get(path);
    const remoteSha = input.remote.get(path) ?? null;
    const missingMedia = input.missingMedia?.get(path) ?? [];

    if (!baseline) {
      if (!entry) continue;
      items.push({
        path,
        kind: entry.document.kind,
        state: remoteSha ? "remote-new" : "to-push",
        localHash: entry.document.contentHash,
        baselineHash: null,
        remoteSha,
        baselineSha: null,
        changedMedia: [],
        missingMedia,
      });
      continue;
    }

    const baselineSha = remoteSha === null ? null : (baseline.remoteBlobs[path] ?? null);
    const remoteChanged = remoteSha !== null && remoteSha !== baselineSha;
    const remoteMissing = remoteSha === null;

    if (!entry) {
      items.push({
        path,
        kind: baseline.repoPath.startsWith("Memos/") ? "memo" : "post",
        state: remoteMissing ? "synced" : remoteChanged ? "merge-conflict" : "to-push",
        localHash: null,
        baselineHash: baseline.contentHash,
        remoteSha,
        baselineSha,
        changedMedia: [],
        missingMedia,
      });
      continue;
    }

    const changedMedia = changedMediaPaths(entry, baseline);
    const localChanged =
      entry.document.contentHash !== baseline.contentHash || changedMedia.length > 0;
    const state: ContentSyncState = remoteMissing
      ? localChanged
        ? "merge-conflict"
        : "remote-deleted"
      : localChanged && remoteChanged
        ? "merge-conflict"
        : localChanged
          ? "to-push"
          : remoteChanged
            ? "to-pull"
            : "synced";

    items.push({
      path,
      kind: entry.document.kind,
      state,
      localHash: entry.document.contentHash,
      baselineHash: baseline.contentHash,
      remoteSha,
      baselineSha,
      changedMedia,
      missingMedia,
    });
  }

  return items;
}

export type ContentSyncCounts = Record<ContentSyncState, number>;

export function summarizeSyncStates(items: ContentSyncStateItem[]): ContentSyncCounts {
  const counts: ContentSyncCounts = {
    synced: 0,
    "to-push": 0,
    "to-pull": 0,
    "remote-new": 0,
    "remote-deleted": 0,
    "merge-conflict": 0,
  };
  for (const item of items) counts[item.state] += 1;
  return counts;
}
