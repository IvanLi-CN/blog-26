import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { publicFixtureCatalog, publicFixtureSearch } from "@/lib/playbook/fixture";
import type { PlaybookGitHubSourceResult } from "@/lib/playbook/github-source";
import { computePlaybookContentHash, encodeJson } from "@/lib/playbook/manifest";
import type { PlaybookGitHubSnapshot } from "@/lib/playbook/types";
import { contentTaskCounters, contentTasks, playbookSnapshots } from "@/lib/schema";
import {
  checkPlaybook,
  PLAYBOOK_SYNC_INTERVAL_MS,
  startContentSyncRuntime,
} from "./content-sync-runtime";
import {
  beginContentTask,
  cancelContentTask,
  finishContentTask,
  getContentTask,
  updateContentTask,
} from "./content-tasks";
import { PlaybookSnapshotStore } from "./playbook-snapshot-store";

let root: string;
let seedPath: string;
const environment = { ...process.env };

function snapshot(commit: string): PlaybookGitHubSnapshot {
  const normalized = {
    catalog: structuredClone(publicFixtureCatalog),
    search: structuredClone(publicFixtureSearch),
  };
  return {
    ...normalized,
    sourceRevision: {
      provider: "github",
      repository: "IvanLi-CN/style-playbook-skills",
      ref: "main",
      commit,
    },
    contentHash: computePlaybookContentHash(normalized),
  };
}

async function waitForTask(id: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const task = await getContentTask(id);
    if (task?.finishedAt !== null && task) return task;
    await Bun.sleep(5);
  }
  throw new Error(`Task did not finish: ${id}`);
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "playbook-snapshot-runtime-"));
  process.env.DB_PATH = join(root, "db.sqlite");
  process.env.LOCAL_CONTENT_BASE_PATH = root;
  seedPath = join(root, "playbook-edition.json");
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
});

beforeEach(async () => {
  await db.delete(playbookSnapshots);
  await db.delete(contentTasks);
  await db.delete(contentTaskCounters);
  delete process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
  delete process.env.STYLE_PLAYBOOK_GITHUB_REPOSITORY;
  delete process.env.STYLE_PLAYBOOK_GITHUB_REF;
});

afterAll(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  rmSync(root, { recursive: true, force: true });
});

test("empty database adopts the seed and then rotates current to previous", async () => {
  const seed = await import("../../../tests/lib/playbook-fixture");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(seedPath, encodeJson(seed.makePublicBundle("v3.0.0", "100").edition));
  const store = new PlaybookSnapshotStore();

  const seeded = await store.load(seedPath);
  expect(seeded?.sourceRevision.provider).toBe("seed");
  const candidate = snapshot("a".repeat(40));
  const adopted = store.adopt(candidate, { expectedCurrent: seeded });

  expect(adopted.status).toBe("adopted");
  expect(store.current?.sourceRevision).toEqual(candidate.sourceRevision);
  expect(store.previous?.sourceRevision.provider).toBe("seed");
  const { contentSyncStatus } = await import("./content-sync-status");
  const status = await contentSyncStatus({ source: "playbook" });
  expect(status.playbook.current).toMatchObject({
    editionDigest: candidate.contentHash,
    source: { releaseId: candidate.sourceRevision.commit, tag: candidate.sourceRevision.ref },
  });
});

test("missing token and failed candidates retain the durable current snapshot", async () => {
  const store = new PlaybookSnapshotStore();
  const current = snapshot("b".repeat(40));
  store.adopt(current, { expectedCurrent: null });

  const unconfigured = await checkPlaybook("manual", undefined, { store });
  expect(unconfigured).toEqual({ cancelled: false, adopted: false });
  expect(store.current?.contentHash).toBe(current.contentHash);
  const unconfiguredTask = (await db.select().from(contentTasks)).at(-1);
  expect(JSON.parse(unconfiguredTask?.result ?? "null")).toMatchObject({
    sourceStatus: "unconfigured",
  });

  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  await expect(
    checkPlaybook("manual", undefined, {
      store,
      sourceLoader: async (config) => ({
        status: "failed",
        repository: config.repository,
        ref: config.ref,
        message: "synthetic GitHub outage",
      }),
    })
  ).rejects.toThrow("synthetic GitHub outage");
  expect(store.current?.sourceRevision).toEqual(current.sourceRevision);
  const failedTask = (await db.select().from(contentTasks)).at(-1);
  expect(failedTask?.status).toBe("failed");
  expect(JSON.parse(failedTask?.result ?? "null")).toMatchObject({ sourceStatus: "failed" });
});

test("duplicate active checks reuse one durable task and startup keeps the five-minute cadence", async () => {
  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  let release!: (result: PlaybookGitHubSourceResult) => void;
  const candidate = snapshot("c".repeat(40));
  const sourceLoader = async () =>
    await new Promise<PlaybookGitHubSourceResult>((resolve) => {
      release = resolve;
    });
  const first = checkPlaybook("manual", undefined, { sourceLoader });
  const active = db.select().from(contentTasks).where(eq(contentTasks.source, "playbook")).get();
  expect(active?.status).toBe("running");
  const second = checkPlaybook("manual", undefined, { sourceLoader });
  expect(second).toBe(first);
  for (let attempt = 0; attempt < 100 && !release; attempt++) await Bun.sleep(1);
  expect(release).toBeDefined();
  release({ status: "ready", snapshot: candidate });
  await Promise.all([first, second]);
  expect(
    (await db.select().from(contentTasks)).filter((task) => task.source === "playbook")
  ).toHaveLength(1);

  await db.delete(contentTasks);
  let interval = 0;
  const stop = await startContentSyncRuntime({
    schedule: (_run, intervalMs) => {
      interval = intervalMs;
      return () => undefined;
    },
    sourceLoader: async () => ({ status: "ready", snapshot: candidate }),
  });
  stop();
  expect(interval).toBe(PLAYBOOK_SYNC_INTERVAL_MS);
  await checkPlaybook("automatic", undefined, {
    sourceLoader: async () => ({ status: "ready", snapshot: candidate }),
  });
});

test("expired Playbook lease resumes the original task and records its adoption checkpoint", async () => {
  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  const candidate = snapshot("d".repeat(40));
  const { task } = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: "github-public-snapshot",
    origin: "test",
    target: "null",
  });
  await db.update(contentTasks).set({ leaseUntil: 0 }).where(eq(contentTasks.id, task.id));
  finishContentTask(task.id, "failed", "late owner", task.ownerToken ?? undefined);
  expect((await getContentTask(task.id))?.finishedAt).toBeNull();
  const stop = await startContentSyncRuntime({
    schedule: () => () => undefined,
    sourceLoader: async () => ({ status: "ready", snapshot: candidate }),
  });
  stop();
  await checkPlaybook("automatic", undefined, {
    sourceLoader: async () => ({ status: "ready", snapshot: candidate }),
  });
  const recovered = await waitForTask(task.id);
  expect(recovered.status).toBe("success");
  expect(recovered.id).toBe(task.id);
  expect(new PlaybookSnapshotStore().current?.taskId).toBe(task.id);
});

test("scheduled checks recover an expired Playbook lease before starting a fresh check", async () => {
  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  const initial = snapshot("7".repeat(40));
  const recoveredCandidate = snapshot("8".repeat(40));
  let nextCandidate = initial;
  let scheduledRun!: () => void | Promise<void>;
  const stop = await startContentSyncRuntime({
    schedule: (run) => {
      scheduledRun = run;
      return () => undefined;
    },
    sourceLoader: async () => ({ status: "ready", snapshot: nextCandidate }),
  });
  stop();
  await checkPlaybook("automatic", undefined, {
    sourceLoader: async () => ({ status: "ready", snapshot: initial }),
  });
  expect(scheduledRun).toBeDefined();

  const { task } = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: "github-public-snapshot",
    origin: "test",
    target: "null",
  });
  await db.update(contentTasks).set({ leaseUntil: 0 }).where(eq(contentTasks.id, task.id));
  nextCandidate = recoveredCandidate;
  await scheduledRun();

  const recovered = await waitForTask(task.id);
  expect(recovered.status).toBe("success");
  expect(new PlaybookSnapshotStore().current?.taskId).toBe(task.id);
});

test("recovery pins the persisted candidate source revision", async () => {
  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  const store = new PlaybookSnapshotStore();
  const current = snapshot("e".repeat(40));
  const candidate = snapshot("f".repeat(40));
  store.adopt(current, { expectedCurrent: null });
  const { task } = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: "github-public-snapshot",
    origin: "test",
    target: "null",
  });
  await updateContentTask(
    task.id,
    {
      target: JSON.stringify({
        base: { sourceRevision: current.sourceRevision, contentHash: current.contentHash },
        candidate: { sourceRevision: candidate.sourceRevision, contentHash: candidate.contentHash },
      }),
    },
    task.ownerToken ?? undefined
  );
  await db
    .update(contentTasks)
    .set({ status: "interrupted", phase: "interrupted", leaseUntil: 0 })
    .where(eq(contentTasks.id, task.id));

  let fixedSourceRevision: unknown;
  const result = await checkPlaybook("recovery", task.id, {
    store,
    sourceLoader: async (_config, options) => {
      fixedSourceRevision = options?.fixedSourceRevision;
      return { status: "ready", snapshot: candidate };
    },
  });

  expect(result).toEqual({ cancelled: false, adopted: true });
  expect(fixedSourceRevision).toEqual(candidate.sourceRevision);
  expect(store.current?.sourceRevision).toEqual(candidate.sourceRevision);
  expect((await getContentTask(task.id))?.status).toBe("success");
});

test("cancelling a Playbook check aborts the source loader", async () => {
  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  let signal: AbortSignal | undefined;
  const promise = checkPlaybook("manual", undefined, {
    sourceLoader: async (_config, options) => {
      signal = options?.signal;
      start();
      return await new Promise<PlaybookGitHubSourceResult>((_resolve, reject) => {
        if (!signal) {
          reject(new Error("Playbook source signal was not provided"));
          return;
        }
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(signal?.reason ?? new DOMException("Task cancelled", "AbortError")),
          { once: true }
        );
      });
    },
  });
  await started;
  const task = db.select().from(contentTasks).where(eq(contentTasks.source, "playbook")).get();
  expect(task).toBeDefined();
  await cancelContentTask(task?.id ?? "");
  expect(signal?.aborted).toBe(true);
  expect(await promise).toEqual({ cancelled: true, adopted: false });
  expect((await getContentTask(task?.id ?? ""))?.status).toBe("cancelled");
});
