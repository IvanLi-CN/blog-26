import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { validatePlaybookEdition } from "@/lib/playbook/cache";
import { comparePlaybookSnapshots } from "@/lib/playbook/github-source";
import { computePlaybookContentHash, encodeJson, parseJson } from "@/lib/playbook/manifest";
import {
  assertPublicCatalog,
  commitSchema,
  digestSchema,
  githubRefSchema,
  githubRepositorySchema,
  githubSourceRevisionSchema,
  searchSchema,
} from "@/lib/playbook/schema";
import type {
  PlaybookGitHubSnapshot,
  PlaybookNormalizedSnapshot,
  PlaybookSnapshotComparison,
} from "@/lib/playbook/types";
import { playbookSnapshots } from "@/lib/schema";

export type PlaybookSnapshotSlot = "current" | "previous";
export type PlaybookSnapshotProvider = "github" | "seed";

export interface PlaybookSnapshotSourceRevision {
  provider: PlaybookSnapshotProvider;
  repository: string;
  ref: string;
  commit: string;
}

export interface PlaybookStoredSnapshot extends PlaybookNormalizedSnapshot {
  sourceRevision: PlaybookSnapshotSourceRevision;
  contentHash: string;
  slot: PlaybookSnapshotSlot;
  checkedAt: number;
  adoptedAt: number;
  taskId: string | null;
}

export interface PlaybookSnapshotIdentity {
  sourceRevision: PlaybookSnapshotSourceRevision;
  contentHash: string;
}

export class PlaybookSnapshotConflictError extends Error {
  constructor(message = "Playbook snapshot adoption base changed") {
    super(message);
    this.name = "PlaybookSnapshotConflictError";
  }
}

type SnapshotRow = typeof playbookSnapshots.$inferSelect;
export type PlaybookSnapshotTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function sourceIdentity(snapshot: PlaybookSnapshotIdentity): PlaybookSnapshotIdentity {
  return {
    sourceRevision: { ...snapshot.sourceRevision },
    contentHash: snapshot.contentHash,
  };
}

export function samePlaybookSnapshotIdentity(
  left: PlaybookSnapshotIdentity | null | undefined,
  right: PlaybookSnapshotIdentity | null | undefined
) {
  if (!left || !right) return left === right;
  return (
    left.contentHash === right.contentHash &&
    left.sourceRevision.provider === right.sourceRevision.provider &&
    left.sourceRevision.repository === right.sourceRevision.repository &&
    left.sourceRevision.ref === right.sourceRevision.ref &&
    left.sourceRevision.commit === right.sourceRevision.commit
  );
}

function readSource(row: SnapshotRow): PlaybookSnapshotSourceRevision {
  if (row.provider === "github")
    return githubSourceRevisionSchema.parse({
      provider: row.provider,
      repository: row.repository,
      ref: row.ref,
      commit: row.commit,
    });
  if (row.provider !== "seed") throw new Error("Unknown Playbook snapshot provider");
  return {
    provider: "seed",
    repository: githubRepositorySchema.parse(row.repository),
    ref: githubRefSchema.parse(row.ref),
    commit: commitSchema.parse(row.commit),
  };
}

function readRow(row: SnapshotRow | undefined): PlaybookStoredSnapshot | null {
  if (!row || (row.slot !== "current" && row.slot !== "previous")) return null;
  try {
    const normalized = {
      catalog: assertPublicCatalog(parseJson(row.catalog), { stripInternalMetadata: true }),
      search: searchSchema.parse(parseJson(row.search)),
    };
    const contentHash = digestSchema.parse(row.contentHash);
    if (computePlaybookContentHash(normalized) !== contentHash)
      throw new Error("Snapshot hash mismatch");
    return {
      ...normalized,
      sourceRevision: readSource(row),
      contentHash,
      slot: row.slot,
      checkedAt: row.checkedAt,
      adoptedAt: row.adoptedAt,
      taskId: row.taskId,
    };
  } catch {
    return null;
  }
}

function readSlot(query: PlaybookSnapshotTransaction | typeof db, slot: PlaybookSnapshotSlot) {
  return readRow(
    query.select().from(playbookSnapshots).where(eq(playbookSnapshots.slot, slot)).get()
  );
}

function rowFor(
  snapshot: PlaybookNormalizedSnapshot & {
    sourceRevision: PlaybookSnapshotSourceRevision;
    contentHash: string;
  },
  slot: PlaybookSnapshotSlot,
  options: { checkedAt: number; adoptedAt: number; taskId?: string | null }
): typeof playbookSnapshots.$inferInsert {
  const source = snapshot.sourceRevision;
  if (source.provider === "github") githubSourceRevisionSchema.parse(source);
  else {
    githubRepositorySchema.parse(source.repository);
    githubRefSchema.parse(source.ref);
    commitSchema.parse(source.commit);
  }
  digestSchema.parse(snapshot.contentHash);
  if (computePlaybookContentHash(snapshot) !== snapshot.contentHash)
    throw new Error("Playbook snapshot content hash mismatch");
  return {
    slot,
    provider: source.provider,
    repository: source.repository,
    ref: source.ref,
    commit: source.commit,
    contentHash: snapshot.contentHash,
    catalog: encodeJson(snapshot.catalog),
    search: encodeJson(snapshot.search),
    checkedAt: options.checkedAt,
    adoptedAt: options.adoptedAt,
    taskId: options.taskId ?? null,
  };
}

function asIdentity(snapshot: PlaybookStoredSnapshot | null): PlaybookSnapshotIdentity | null {
  return snapshot ? sourceIdentity(snapshot) : null;
}

function seedSnapshot(value: unknown): PlaybookStoredSnapshot {
  const edition = validatePlaybookEdition(value, undefined, { stripInternalMetadata: true });
  const normalized = { catalog: edition.catalog, search: edition.search };
  const sourceRevision: PlaybookSnapshotSourceRevision = {
    provider: "seed",
    repository: edition.edition.source.repository,
    ref: edition.edition.source.tag,
    commit: edition.edition.source.commit,
  };
  return {
    ...normalized,
    sourceRevision,
    contentHash: computePlaybookContentHash(normalized),
    slot: "current",
    checkedAt: 0,
    adoptedAt: 0,
    taskId: null,
  };
}

export class PlaybookSnapshotStore {
  getCurrent() {
    return readSlot(db, "current");
  }

  getPrevious() {
    return readSlot(db, "previous");
  }

  get current() {
    return this.getCurrent();
  }

  get previous() {
    return this.getPrevious();
  }

  async load(seedPath = process.env.PLAYBOOK_SEED_PATH || "site/generated/playbook-edition.json") {
    await this.seedIfEmpty(seedPath);
    return this.getCurrent();
  }

  async seedIfEmpty(
    seedPath = process.env.PLAYBOOK_SEED_PATH || "site/generated/playbook-edition.json"
  ) {
    let seed: PlaybookStoredSnapshot;
    try {
      seed = seedSnapshot(parseJson(await readFile(resolve(seedPath), "utf8")));
    } catch {
      return this.getCurrent();
    }
    const now = Date.now();
    return db.transaction((tx) => {
      const current = readSlot(tx, "current");
      if (current) return current;
      const row = rowFor(seed, "current", { checkedAt: now, adoptedAt: now });
      tx.insert(playbookSnapshots)
        .values(row)
        .onConflictDoUpdate({
          target: playbookSnapshots.slot,
          set: row,
        })
        .run();
      return readSlot(tx, "current");
    });
  }

  compare(
    candidate: PlaybookGitHubSnapshot,
    adopted = this.getCurrent()
  ): PlaybookSnapshotComparison {
    if (adopted?.sourceRevision.provider !== "github")
      return {
        status: "stale",
        sourceChanged: true,
        contentChanged: true,
        updateProvenance: true,
        rebuildContent: true,
        rebuildKeywordProjection: true,
      };
    return comparePlaybookSnapshots(candidate, adopted as PlaybookGitHubSnapshot);
  }

  adopt(
    candidate: PlaybookGitHubSnapshot,
    options: {
      taskId?: string | null;
      checkedAt?: number;
      adoptedAt?: number;
      expectedCurrent?: PlaybookSnapshotIdentity | null;
      beforeCommit?: (tx: PlaybookSnapshotTransaction) => void;
    } = {}
  ) {
    githubSourceRevisionSchema.parse(candidate.sourceRevision);
    digestSchema.parse(candidate.contentHash);
    const checkedAt = options.checkedAt ?? Date.now();
    const adoptedAt = options.adoptedAt ?? checkedAt;
    return db.transaction((tx) => {
      const current = readSlot(tx, "current");
      if (
        options.expectedCurrent !== undefined &&
        !samePlaybookSnapshotIdentity(asIdentity(current), options.expectedCurrent)
      )
        throw new PlaybookSnapshotConflictError();
      if (current && samePlaybookSnapshotIdentity(sourceIdentity(candidate), asIdentity(current)))
        return { status: "unchanged" as const, current };
      options.beforeCommit?.(tx);
      if (current)
        tx.insert(playbookSnapshots)
          .values(
            rowFor(current, "previous", {
              checkedAt: current.checkedAt,
              adoptedAt: current.adoptedAt,
              taskId: current.taskId,
            })
          )
          .onConflictDoUpdate({
            target: playbookSnapshots.slot,
            set: rowFor(current, "previous", {
              checkedAt: current.checkedAt,
              adoptedAt: current.adoptedAt,
              taskId: current.taskId,
            }),
          })
          .run();
      const next = rowFor(candidate, "current", {
        checkedAt,
        adoptedAt,
        taskId: options.taskId,
      });
      tx.insert(playbookSnapshots)
        .values(next)
        .onConflictDoUpdate({ target: playbookSnapshots.slot, set: next })
        .run();
      const adopted = readSlot(tx, "current");
      if (!adopted) throw new Error("Adopted Playbook snapshot could not be read back");
      return { status: "adopted" as const, current: adopted };
    });
  }
}

const stores = new Map<string, PlaybookSnapshotStore>();
export function getPlaybookSnapshotStore() {
  const key = resolve(process.env.DB_PATH || "./sqlite.db");
  let store = stores.get(key);
  if (!store) {
    store = new PlaybookSnapshotStore();
    stores.set(key, store);
  }
  return store;
}
