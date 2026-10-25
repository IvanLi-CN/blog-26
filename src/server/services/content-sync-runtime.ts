import { and, eq, inArray } from "drizzle-orm";
import { projectionDigest } from "@/lib/ai/embedding-target";
import { getContentSourceManager } from "@/lib/content-sources";
import { ensureContentSourcesRegistered } from "@/lib/content-sources/register";
import { db } from "@/lib/db";
import type {
  PlaybookGitHubSourceConfig,
  PlaybookGitHubSourceResult,
} from "@/lib/playbook/github-source";
import {
  createPlaybookGitHubSourceTransport,
  loadPlaybookGitHubSnapshot,
  PLAYBOOK_GITHUB_DEFAULT_REF,
  PLAYBOOK_GITHUB_DEFAULT_REPOSITORY,
  readPlaybookGitHubSourceConfig,
} from "@/lib/playbook/github-source";
import { contentTasks } from "@/lib/schema";
import {
  assertContentTaskOwner,
  beginContentTask,
  finishContentTask,
  taskControllers,
  taskOwnerIsLive,
  updateContentTask,
  waitContentTask,
} from "./content-tasks";
import {
  getPlaybookSnapshotStore,
  type PlaybookSnapshotIdentity,
  type PlaybookSnapshotSourceRevision,
  type PlaybookSnapshotStore,
  samePlaybookSnapshotIdentity,
} from "./playbook-snapshot-store";
import { ragCatalog, ragCoverage, runRagIndex, triggerRagIndex } from "./rag-index";

export const PLAYBOOK_SYNC_INTERVAL_MS = 300000;
export const PLAYBOOK_SYNC_REQUEST_KEY = "github-public-snapshot";

export interface PlaybookSourceLoadOptions {
  signal?: AbortSignal;
  fixedSourceRevision?: PlaybookSnapshotSourceRevision & { provider: "github" };
}

export type PlaybookSourceLoader = (
  config: PlaybookGitHubSourceConfig,
  options?: PlaybookSourceLoadOptions
) => Promise<PlaybookGitHubSourceResult>;

export interface PlaybookRuntimeOptions {
  store?: PlaybookSnapshotStore;
  sourceLoader?: PlaybookSourceLoader;
  seedPath?: string;
  now?: () => number;
}

export interface PlaybookCheckResult {
  cancelled: boolean;
  adopted: boolean;
}

type SnapshotTaskTarget = {
  base?: PlaybookSnapshotIdentity | null;
  candidate?: PlaybookSnapshotIdentity;
};

type RagTaskTarget = {
  source: "blog" | "playbook";
  mode: "repair" | "rebuild";
  edition?: "current" | "previous";
  type?: string;
  targetKey?: string;
  identity?: {
    playbook?: {
      edition: string;
      sourceReleaseId: string;
      sourceTag: string;
    } | null;
  };
};

function combineAbortSignals(...signals: Array<AbortSignal | null | undefined>) {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (active.length <= 1) return active[0];
  if ("any" in AbortSignal)
    return (
      AbortSignal as typeof AbortSignal & { any: (signals: AbortSignal[]) => AbortSignal }
    ).any(active);
  const controller = new AbortController();
  const abort = () => controller.abort();
  for (const signal of active) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

function defaultSourceLoader(
  config: PlaybookGitHubSourceConfig,
  options: PlaybookSourceLoadOptions = {}
) {
  if (!config.token)
    return Promise.resolve<PlaybookGitHubSourceResult>({
      status: "unconfigured",
      repository: config.repository,
      ref: config.ref,
    });
  const fixed = options.fixedSourceRevision;
  const sourceConfig = fixed
    ? { ...config, repository: fixed.repository, ref: fixed.commit }
    : config;
  const fetchImpl = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        signal: combineAbortSignals(init?.signal, options.signal),
      }),
    { preconnect: fetch.preconnect }
  ) as typeof fetch;
  return loadPlaybookGitHubSnapshot(
    createPlaybookGitHubSourceTransport(config.token, fetchImpl),
    sourceConfig
  ).then((result) => {
    if (result.status !== "ready" || !fixed) return result;
    return {
      status: "ready" as const,
      snapshot: { ...result.snapshot, sourceRevision: fixed },
    };
  });
}

function snapshotIdentity(snapshot: {
  sourceRevision: PlaybookSnapshotSourceRevision;
  contentHash: string;
}): PlaybookSnapshotIdentity {
  return {
    sourceRevision: { ...snapshot.sourceRevision },
    contentHash: snapshot.contentHash,
  };
}

function parseTarget(value: string): SnapshotTaskTarget {
  if (!value || value === "null") return {};
  try {
    const target = JSON.parse(value) as SnapshotTaskTarget;
    return target && typeof target === "object" ? target : {};
  } catch {
    return {};
  }
}

function sourceConfigError(): PlaybookGitHubSourceResult {
  try {
    readPlaybookGitHubSourceConfig();
  } catch (error) {
    return {
      status: "invalid",
      repository:
        process.env.STYLE_PLAYBOOK_GITHUB_REPOSITORY?.trim() || PLAYBOOK_GITHUB_DEFAULT_REPOSITORY,
      ref: process.env.STYLE_PLAYBOOK_GITHUB_REF?.trim() || PLAYBOOK_GITHUB_DEFAULT_REF,
      message: error instanceof Error ? error.message : "GitHub source configuration is invalid",
    };
  }
  throw new Error("Expected invalid GitHub source configuration");
}

function readSourceResult(
  config: PlaybookGitHubSourceConfig | null
):
  | { config: PlaybookGitHubSourceConfig; result: null }
  | { config: null; result: PlaybookGitHubSourceResult } {
  if (!config) return { config: null, result: sourceConfigError() };
  return { config, result: null };
}

function resultPayload(result: PlaybookGitHubSourceResult, extra: Record<string, unknown> = {}) {
  if (result.status === "ready")
    return {
      sourceStatus: result.status,
      repository: result.snapshot.sourceRevision.repository,
      ref: result.snapshot.sourceRevision.ref,
      commit: result.snapshot.sourceRevision.commit,
      contentHash: result.snapshot.contentHash,
      ...extra,
    };
  return {
    sourceStatus: result.status,
    repository: result.repository,
    ref: result.ref,
    ...(result.status !== "unconfigured" ? { error: result.message } : {}),
    ...extra,
  };
}

let flightResumeId: string | undefined;
let flight: Promise<PlaybookCheckResult> | undefined;

export const playbookSyncEnabled = () => {
  try {
    return Boolean(readPlaybookGitHubSourceConfig().token);
  } catch {
    return false;
  }
};

export function checkPlaybook(
  origin = "manual",
  resumeId?: string,
  options: PlaybookRuntimeOptions = {}
): Promise<PlaybookCheckResult> {
  if (flight)
    return resumeId && resumeId !== flightResumeId
      ? Promise.reject(new Error("Recovery task already active"))
      : flight;
  flightResumeId = resumeId;
  flight = (async (): Promise<PlaybookCheckResult> => {
    const { task, reused } = await beginContentTask({
      kind: "sync",
      source: "playbook",
      requestKey: PLAYBOOK_SYNC_REQUEST_KEY,
      origin,
      target: "null",
      resumeId,
    });
    if (reused) {
      const completed = await waitContentTask(task.id);
      return {
        cancelled: completed.status === "cancelled",
        adopted: completed.status === "success",
      };
    }

    const store = options.store ?? getPlaybookSnapshotStore();
    const now = options.now ?? Date.now;
    const controller = taskControllers.get(task.id);
    let adopted = false;
    let terminal = false;
    try {
      await store.seedIfEmpty(options.seedPath);
      const current = store.getCurrent();
      const savedTarget = parseTarget(task.target);
      const base = current ? snapshotIdentity(current) : null;
      if (
        resumeId &&
        savedTarget.base !== undefined &&
        !samePlaybookSnapshotIdentity(base, savedTarget.base)
      )
        throw new Error("Recovery adoption superseded");
      await updateContentTask(task.id, { phase: "checking" }, task.ownerToken ?? undefined);

      const configured = readSourceResult(
        (() => {
          try {
            return readPlaybookGitHubSourceConfig();
          } catch {
            return null;
          }
        })()
      );
      const savedCandidateSource = savedTarget.candidate?.sourceRevision;
      const fixedSourceRevision =
        resumeId && savedCandidateSource?.provider === "github"
          ? {
              provider: "github" as const,
              repository: savedCandidateSource.repository,
              ref: savedCandidateSource.ref,
              commit: savedCandidateSource.commit,
            }
          : undefined;
      const sourceResult = configured.result
        ? configured.result
        : await (options.sourceLoader ?? defaultSourceLoader)(configured.config, {
            signal: controller?.signal,
            fixedSourceRevision,
          });

      if (sourceResult.status === "unconfigured") {
        await updateContentTask(
          task.id,
          { result: JSON.stringify(resultPayload(sourceResult, { current: Boolean(current) })) },
          task.ownerToken ?? undefined
        );
        finishContentTask(
          task.id,
          current ? "unchanged" : "failed",
          undefined,
          task.ownerToken ?? undefined
        );
        terminal = true;
        return { cancelled: false, adopted: false };
      }
      if (sourceResult.status !== "ready") {
        await updateContentTask(
          task.id,
          { result: JSON.stringify(resultPayload(sourceResult)) },
          task.ownerToken ?? undefined
        );
        finishContentTask(task.id, "failed", sourceResult.message, task.ownerToken ?? undefined);
        terminal = true;
        throw new Error(sourceResult.message);
      }

      const candidate = sourceResult.snapshot;
      const candidateIdentity = snapshotIdentity(candidate);
      if (
        resumeId &&
        savedTarget.candidate &&
        !samePlaybookSnapshotIdentity(savedTarget.candidate, candidateIdentity)
      )
        throw new Error("Recovery target changed");
      const comparison = store.compare(candidate, current);
      await updateContentTask(
        task.id,
        {
          phase: comparison.status === "current" ? "checked" : "adopting",
          target: JSON.stringify({
            base,
            candidate: candidateIdentity,
          } satisfies SnapshotTaskTarget),
          total: candidate.search.documents.length,
          processed: candidate.search.documents.length,
          result: JSON.stringify(
            resultPayload(sourceResult, {
              comparison: comparison.status,
              sourceChanged: comparison.sourceChanged,
              contentChanged: comparison.contentChanged,
            })
          ),
        },
        task.ownerToken ?? undefined
      );
      if (comparison.status === "current") {
        finishContentTask(task.id, "unchanged", undefined, task.ownerToken ?? undefined);
        terminal = true;
        return {
          cancelled: false,
          adopted: false,
        };
      }

      const adoption = store.adopt(candidate, {
        taskId: task.id,
        checkedAt: now(),
        adoptedAt: now(),
        expectedCurrent: base,
        beforeCommit: (tx) => {
          const owner = tx.select().from(contentTasks).where(eq(contentTasks.id, task.id)).get();
          assertContentTaskOwner(owner, task.ownerToken);
        },
      });
      adopted = adoption.status === "adopted";
      await updateContentTask(task.id, { phase: "adopted" }, task.ownerToken ?? undefined);
      finishContentTask(
        task.id,
        adopted ? "success" : "unchanged",
        undefined,
        task.ownerToken ?? undefined
      );
      if (adopted || origin === "manual")
        void triggerRagIndex("playbook", "repair", "content-sync").catch(() => undefined);
      terminal = true;
      return { cancelled: false, adopted };
    } catch (error) {
      const currentTask = db.select().from(contentTasks).where(eq(contentTasks.id, task.id)).get();
      const cancelled = Boolean(currentTask?.cancelRequested);
      adopted = store.getCurrent()?.taskId === task.id;
      if (!terminal)
        finishContentTask(
          task.id,
          cancelled ? "cancelled" : "failed",
          cancelled
            ? "Check cancelled"
            : error instanceof Error
              ? error.message
              : "Playbook check failed",
          task.ownerToken ?? undefined
        );
      if (cancelled) return { cancelled: true, adopted };
      throw error;
    }
  })().finally(() => {
    flight = undefined;
    flightResumeId = undefined;
  });
  return flight;
}

export async function enqueuePlaybookCheck(
  origin = "manual",
  options: PlaybookRuntimeOptions = {}
) {
  const promise = checkPlaybook(origin, undefined, options);
  const task = db
    .select()
    .from(contentTasks)
    .where(
      and(
        eq(contentTasks.kind, "sync"),
        eq(contentTasks.source, "playbook"),
        inArray(contentTasks.status, ["queued", "running"])
      )
    )
    .get();
  if (!task) await promise;
  return { task: task ?? null, promise };
}

export interface ContentSyncRuntimeOptions extends PlaybookRuntimeOptions {
  intervalMs?: number;
  schedule?: (run: () => void | Promise<void>, intervalMs: number) => () => void;
}

export async function startContentSyncRuntime(options: ContentSyncRuntimeOptions = {}) {
  const store = options.store ?? getPlaybookSnapshotStore();
  await store.seedIfEmpty(options.seedPath);
  await ensureContentSourcesRegistered(getContentSourceManager());
  let recoveryFlight: Promise<void> | undefined;
  const recover = () => {
    if (recoveryFlight) return recoveryFlight;
    recoveryFlight = (async () => {
      if (flight) await flight.catch(() => undefined);
      const unfinished = await db
        .select()
        .from(contentTasks)
        .where(inArray(contentTasks.status, ["queued", "running", "interrupted"]));
      for (const task of unfinished) {
        if (taskOwnerIsLive(task)) continue;
        if (
          task.kind === "sync" &&
          task.source === "playbook" &&
          store.getCurrent()?.taskId === task.id
        ) {
          finishContentTask(task.id, "success");
          continue;
        }
        if (task.cancelRequested) {
          finishContentTask(task.id, "cancelled");
          continue;
        }
        const recoverable = db.transaction((tx) => {
          const current = tx.select().from(contentTasks).where(eq(contentTasks.id, task.id)).get();
          if (!current || current.finishedAt !== null || taskOwnerIsLive(current)) return false;
          tx.update(contentTasks)
            .set({ status: "interrupted", phase: "interrupted" })
            .where(eq(contentTasks.id, task.id))
            .run();
          return true;
        });
        if (!recoverable) continue;
        if (task.kind === "sync" && task.source === "playbook")
          await checkPlaybook("recovery", task.id, options).catch(() =>
            finishContentTask(task.id, "failed", "Playbook recovery unavailable")
          );
        else if (task.kind === "rag") {
          try {
            const target = JSON.parse(task.target) as RagTaskTarget;
            const edition = target.edition ?? "current";
            const playbook =
              target.source === "playbook"
                ? edition === "previous"
                  ? store.getPrevious()
                  : store.getCurrent()
                : undefined;
            const expectedPlaybook = target.identity?.playbook;
            if (
              target.source === "playbook" &&
              (!playbook || (expectedPlaybook && playbook.contentHash !== expectedPlaybook.edition))
            )
              throw new Error("Recovery target unavailable");
            const recoveredScope = {
              source: target.source,
              edition,
              playbook,
              type: target.type,
            };
            const recovered = await ragCatalog(recoveredScope);
            const recoveredKey = projectionDigest({
              source: target.source,
              type: target.type ?? "all",
              targets: recovered.targets.map((row) => row.id),
              fingerprint: recovered.identity.fingerprint,
              playbook: recovered.identity.playbook?.edition ?? null,
            });
            if (target.targetKey && target.targetKey !== recoveredKey)
              throw new Error("Recovery target changed");
            await runRagIndex(recoveredScope, target.mode, "recovery", task.id);
          } catch {
            finishContentTask(task.id, "failed", "Recovery target unavailable");
          }
        } else if (task.kind === "sync")
          await getContentSourceManager()
            .syncAll(task.requestKey === "full", task.id)
            .catch(() => finishContentTask(task.id, "failed", "Local recovery failed"));
        else finishContentTask(task.id, "failed", "RAG recovery unavailable");
      }
    })().finally(() => {
      recoveryFlight = undefined;
    });
    return recoveryFlight;
  };

  const prepare = async () => {
    for (const source of ["blog", "playbook"] as const) {
      const coverage = await ragCoverage({ source });
      if (!coverage.status.incompleteSources.includes(source)) continue;
      void triggerRagIndex(source, "repair", "automatic").catch(() => undefined);
    }
  };

  await recover();
  await prepare();
  void checkPlaybook("automatic", undefined, options)
    .then(() => prepare())
    .catch(() => undefined);
  const schedule =
    options.schedule ??
    ((run: () => void | Promise<void>, intervalMs: number) => {
      const timer = setInterval(run, intervalMs);
      timer.unref?.();
      return () => clearInterval(timer);
    });
  return schedule(
    () =>
      recover()
        .then(() => checkPlaybook("automatic", undefined, options))
        .then(() => prepare())
        .then(() => undefined)
        .catch(() => undefined),
    options.intervalMs ?? PLAYBOOK_SYNC_INTERVAL_MS
  );
}
