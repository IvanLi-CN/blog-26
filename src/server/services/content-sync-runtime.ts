import { and, eq, inArray } from "drizzle-orm";
import { projectionDigest } from "@/lib/ai/embedding-target";
import { getContentSourceManager } from "@/lib/content-sources";
import { ensureContentSourcesRegistered } from "@/lib/content-sources/register";
import { db } from "@/lib/db";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import { parseEditionIdentity, samePlaybookEdition } from "@/lib/playbook/manifest";
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
import { listPlaybookCandidates } from "./playbook-search";
import { ragCatalog, ragCoverage, runRagIndex, triggerRagIndex } from "./rag-index";

export const playbookSyncEnabled = () =>
  process.env.PLAYBOOK_SYNC_ENABLED === "true" ||
  (process.env.NODE_ENV === "production" && process.env.PLAYBOOK_SYNC_ENABLED !== "false");
let flightResumeId: string | undefined;
let flight: Promise<{ cancelled: boolean; adopted: boolean }> | undefined;
export function checkPlaybook(origin = "manual", resumeId?: string) {
  if (flight)
    return resumeId && resumeId !== flightResumeId
      ? Promise.reject(new Error("Recovery task already active"))
      : flight;
  flightResumeId = resumeId;
  flight = (async () => {
    if (!playbookSyncEnabled()) throw new Error("Playbook synchronization disabled");
    const store = getRuntimePlaybookStore();
    await store.load();
    const adoptionBase = store.current?.edition ?? null;
    const { task, reused } = await beginContentTask({
      kind: "sync",
      source: "playbook",
      requestKey: "public-deployment-pointer",
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
    const controller = taskControllers.get(task.id);
    let adopted = false;
    try {
      await updateContentTask(task.id, { phase: "checking" }, task.ownerToken ?? undefined);
      const savedTarget = resumeId ? JSON.parse(task.target) : null;
      const retained = resumeId
        ? parseEditionIdentity(
            Object.fromEntries(
              Object.entries(savedTarget ?? {}).filter(([key]) => key !== "recoveryBase")
            )
          )
        : undefined;
      const sameBase = (base: typeof adoptionBase) =>
        base
          ? Boolean(store.current && samePlaybookEdition(base, store.current.edition))
          : !store.current;
      if (
        retained &&
        store.current &&
        !samePlaybookEdition(retained, store.current.edition) &&
        ((Object.hasOwn(savedTarget, "recoveryBase") && !sameBase(savedTarget.recoveryBase)) ||
          (store.previous && samePlaybookEdition(retained, store.previous.edition)) ||
          (store.adoption &&
            store.adoption.taskId !== task.id &&
            store.adoption.at > task.startedAt))
      )
        throw new Error("Recovery adoption superseded");
      const edition = await store.downloadEdition(undefined, controller?.signal, retained);
      if (controller?.signal.aborted) throw controller.signal.reason;
      if (!edition) throw new Error("Public snapshot unavailable");
      await updateContentTask(
        task.id,
        {
          phase: "adopting",
          ...(!resumeId
            ? { target: JSON.stringify({ ...edition.edition, recoveryBase: adoptionBase }) }
            : {}),
        },
        task.ownerToken ?? undefined
      );
      adopted = !store.current || !samePlaybookEdition(store.current.edition, edition.edition);
      if (controller?.signal.aborted) throw controller.signal.reason;
      if (adopted && !resumeId && !sameBase(adoptionBase)) throw new Error("Adoption base changed");
      const before = store.current ? listPlaybookCandidates(store.current) : [];
      const after = listPlaybookCandidates(edition);
      const previous = new Map(before.map((row) => [JSON.stringify([row.type, row.slug]), row]));
      const next = new Map(after.map((row) => [JSON.stringify([row.type, row.slug]), row]));
      const created = after.filter(
        (row) => !previous.has(JSON.stringify([row.type, row.slug]))
      ).length;
      const deleted = before.filter(
        (row) => !next.has(JSON.stringify([row.type, row.slug]))
      ).length;
      const updated = after.filter(
        (row) =>
          previous.has(JSON.stringify([row.type, row.slug])) &&
          previous.get(JSON.stringify([row.type, row.slug]))?.contentHash !== row.contentHash
      ).length;
      await updateContentTask(
        task.id,
        {
          total: after.length,
          processed: after.length,
          result: JSON.stringify({
            before: before.length,
            after: after.length,
            created,
            updated,
            deleted,
            skipped: after.length - created - updated,
            errors: 0,
          }),
        },
        task.ownerToken ?? undefined
      );
      if (adopted)
        await store.adopt(
          edition,
          { taskId: task.id, at: Date.now() },
          controller?.signal,
          adoptionBase,
          (commit) =>
            db.transaction((tx) => {
              const owner = tx
                .select()
                .from(contentTasks)
                .where(eq(contentTasks.id, task.id))
                .get();
              assertContentTaskOwner(owner, task.ownerToken);
              commit();
              tx.update(contentTasks)
                .set({ phase: "adopted" })
                .where(eq(contentTasks.id, task.id))
                .run();
            })
        );
      await updateContentTask(task.id, { phase: "adopted" }, task.ownerToken ?? undefined);
      finishContentTask(
        task.id,
        adopted ? "success" : "unchanged",
        undefined,
        task.ownerToken ?? undefined
      );
      if (adopted || origin === "manual") void triggerRagIndex("playbook", "repair", origin);
      return { cancelled: false, adopted };
    } catch (error) {
      const cancelled = Boolean(
        controller?.signal.aborted ||
          db.select().from(contentTasks).where(eq(contentTasks.id, task.id)).get()?.cancelRequested
      );
      adopted = store.adoption?.taskId === task.id;
      finishContentTask(
        task.id,
        cancelled ? "cancelled" : "failed",
        cancelled ? "Check cancelled" : "Public snapshot check failed",
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
export async function startContentSyncRuntime() {
  const store = getRuntimePlaybookStore();
  await store.load();
  await ensureContentSourcesRegistered(getContentSourceManager());
  let recoveryFlight: Promise<void> | undefined;
  const recover = () => {
    if (recoveryFlight) return recoveryFlight;
    recoveryFlight = (async () => {
      const unfinished = await db
        .select()
        .from(contentTasks)
        .where(inArray(contentTasks.status, ["queued", "running", "interrupted"]));
      for (const task of unfinished) {
        if (taskOwnerIsLive(task)) continue;
        if (
          task.kind === "sync" &&
          task.source === "playbook" &&
          store.adoption?.taskId === task.id
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
        if (task.kind === "rag") {
          try {
            const target = JSON.parse(task.target) as {
              source: "blog" | "playbook";
              mode: "repair" | "rebuild";
              edition: "current" | "previous";
              type?: string;
              targetKey?: string;
              identity: {
                playbook?: { edition: string; sourceReleaseId: string; sourceTag: string };
              };
            };
            const identity = target.identity.playbook;
            const playbook = identity
              ? store.getEdition(identity.edition, identity.sourceReleaseId, identity.sourceTag)
              : undefined;
            if (identity && !playbook) throw new Error("Edition expired");
            const recoveredScope = {
              source: target.source,
              edition: target.edition,
              playbook,
              type: target.type,
            };
            const recovered = await ragCatalog(recoveredScope);
            const recoveredKey = projectionDigest({
              source: target.source,
              type: target.type ?? "all",
              targets: recovered.targets.map((row) => row.id),
              fingerprint: recovered.identity.fingerprint,
              playbook: recovered.identity.playbook,
            });
            if (target.targetKey && target.targetKey !== recoveredKey)
              throw new Error("Recovery target changed");
            await runRagIndex(recoveredScope, target.mode, "recovery", task.id);
          } catch {
            finishContentTask(task.id, "failed", "Recovery target unavailable");
          }
        } else if (task.source === "playbook")
          await checkPlaybook("recovery", task.id).catch(() =>
            finishContentTask(task.id, "failed", "Playbook recovery unavailable")
          );
        else
          await getContentSourceManager()
            .syncAll(task.requestKey === "full", task.id)
            .catch(() => finishContentTask(task.id, "failed", "Local recovery failed"));
      }
    })().finally(() => {
      recoveryFlight = undefined;
    });
    return recoveryFlight;
  };
  await recover();
  const prepare = async () => {
    for (const source of ["blog", "playbook"] as const) {
      for (const edition of (source === "playbook" && store.previous
        ? ["current", "previous"]
        : ["current"]) as ("current" | "previous")[]) {
        const manifest = await ragCatalog({ source, edition });
        if (!manifest.available || manifest.missingSources.length) continue;
        const coverage = await ragCoverage({ source, edition });
        if (!coverage.status.incompleteSources.length) continue;
        const tasks = await db
          .select()
          .from(contentTasks)
          .where(
            and(
              eq(contentTasks.kind, "rag"),
              eq(contentTasks.source, source === "blog" ? "local" : "playbook")
            )
          )
          .orderBy(contentTasks.startedAt)
          .all();
        if (tasks.some((task) => ["queued", "running"].includes(task.status))) continue;
        const targetKey = projectionDigest({
          source,
          type: "all",
          targets: manifest.targets.map((row) => row.id),
          fingerprint: manifest.identity.fingerprint,
          playbook: manifest.identity.playbook,
        });
        const matching = tasks
          .filter((task) => {
            try {
              return JSON.parse(task.target).targetKey === targetKey;
            } catch {
              return false;
            }
          })
          .at(-1);
        if (matching && ["cancelled", "failed"].includes(matching.status)) continue;
        await runRagIndex({ source, edition }, "repair", "automatic").catch(() => undefined);
      }
    }
  };
  await prepare();
  if (playbookSyncEnabled()) void checkPlaybook("automatic").catch(() => undefined);
  const timer = setInterval(() => {
    if (playbookSyncEnabled()) void checkPlaybook("automatic").catch(() => undefined);
    void recover()
      .then(prepare)
      .catch(() => undefined);
  }, 300000);
  timer.unref?.();
  return () => clearInterval(timer);
}
