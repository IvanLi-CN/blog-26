import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { getProjectStatusCatalogEntries } from "@/lib/project-catalog";
import {
  PROJECT_STATUS_HEARTBEAT_STALE_AFTER_MS,
  PROJECT_STATUS_RETENTION_MS,
} from "@/lib/project-status";
import { projectStatusResults, projectStatusRuns } from "@/lib/schema";
import {
  getProjectStatusOverview,
  interruptActiveProjectStatusRuns,
  runProjectStatusCheck,
} from "./project-status";

const testDbPath = path.join(process.cwd(), "tmp/project-status-test.sqlite");

describe("project status service persistence", () => {
  beforeAll(async () => {
    process.env.DB_PATH = testDbPath;
    fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    fs.rmSync(testDbPath, { force: true });
    const sqlite = new Database(testDbPath);
    migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    sqlite.close();
    await initializeDB(true);
  });

  beforeEach(async () => {
    await db.delete(projectStatusResults);
    await db.delete(projectStatusRuns);
  });

  afterAll(() => {
    fs.rmSync(testDbPath, { force: true });
  });

  test("stores one snapshot per catalog entry, keeps concurrency at eight, and derives overview counts", async () => {
    let active = 0;
    let maxActive = 0;
    const result = await runProjectStatusCheck("manual", {
      fetch: async (_input, init) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        init?.signal?.throwIfAborted();
        active -= 1;
        return { status: 200, url: "https://final.example.test", redirected: false } as Response;
      },
      sleep: async () => undefined,
      now: () => Date.now(),
      resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
      id: (() => {
        let index = 0;
        return () => `status-test-${index++}`;
      })(),
    });

    expect(result.status).toBe("completed");
    expect(result.targetCount).toBe(42);
    expect(result.attemptedCount).toBe(42);
    expect(maxActive).toBeLessThanOrEqual(8);

    const overview = await getProjectStatusOverview();
    expect(overview.catalog).toHaveLength(42);
    expect(overview.results).toHaveLength(42);
    expect(overview.summary).toMatchObject({
      total: 42,
      available: 42,
      unavailable: 0,
      unknown: 0,
    });
  });

  test("marks active runs interrupted and prunes snapshots older than thirty days", async () => {
    const oldRunId = "status-test-old-run";
    const activeRunId = "status-test-active-run";
    const oldStartedAt = Date.now() - PROJECT_STATUS_RETENTION_MS - 1_000;
    await db.insert(projectStatusRuns).values([
      {
        id: oldRunId,
        status: "completed",
        triggeredBy: "scheduler",
        targetCount: 1,
        attemptedCount: 1,
        availableCount: 1,
        unavailableCount: 0,
        startedAt: oldStartedAt,
        finishedAt: oldStartedAt + 100,
      },
      {
        id: activeRunId,
        status: "running",
        triggeredBy: "scheduler",
        targetCount: 0,
        attemptedCount: 0,
        availableCount: 0,
        unavailableCount: 0,
        startedAt: Date.now() - 1_000,
      },
    ]);
    await db.insert(projectStatusResults).values({
      id: "status-test-old-result",
      runId: oldRunId,
      entryKey: getProjectStatusCatalogEntries()[0].entryKey,
      projectSlug: getProjectStatusCatalogEntries()[0].projectSlug,
      projectTitle: getProjectStatusCatalogEntries()[0].projectTitle,
      domain: getProjectStatusCatalogEntries()[0].domain,
      entryKind: getProjectStatusCatalogEntries()[0].kind,
      entryLabel: getProjectStatusCatalogEntries()[0].label,
      href: getProjectStatusCatalogEntries()[0].href,
      status: "available",
      attempted: true,
      httpStatus: 200,
      checkedAt: oldStartedAt + 100,
    });
    await interruptActiveProjectStatusRuns();

    await runProjectStatusCheck("scheduler", {
      fetch: async () =>
        ({ status: 200, url: "https://final.example.test", redirected: false }) as Response,
      sleep: async () => undefined,
      now: () => Date.now(),
      resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
      id: (() => {
        let index = 0;
        return () => `status-test-new-${index++}`;
      })(),
    });

    const runs = await db.select().from(projectStatusRuns);
    expect(runs.some((run) => run.id === oldRunId)).toBe(false);
    expect(runs.find((run) => run.id === activeRunId)?.status).toBe("interrupted");
  });

  test("refuses a second run while an active batch exists", async () => {
    await db.insert(projectStatusRuns).values({
      id: "status-test-active-conflict",
      status: "running",
      triggeredBy: "scheduler",
      targetCount: 42,
      startedAt: Date.now(),
      heartbeatAt: Date.now(),
    });

    await expect(runProjectStatusCheck("manual")).rejects.toThrow("already running");
  });

  test("does not interrupt a fresh batch owned by another live process", async () => {
    const startedAt = Date.now();
    await db.insert(projectStatusRuns).values({
      id: "status-test-fresh-active",
      status: "running",
      triggeredBy: "scheduler",
      targetCount: 42,
      startedAt,
      heartbeatAt: startedAt,
    });

    await interruptActiveProjectStatusRuns(startedAt + 1_000);

    expect((await db.select().from(projectStatusRuns))[0]?.status).toBe("running");
  });

  test("force-interrupts all active runs on restart and reconciles saved results", async () => {
    const now = Date.now();
    const [availableEntry, unknownEntry] = getProjectStatusCatalogEntries();
    await db.insert(projectStatusRuns).values({
      id: "status-test-restart-run",
      status: "running",
      triggeredBy: "scheduler",
      targetCount: 42,
      attemptedCount: 0,
      availableCount: 0,
      unavailableCount: 0,
      startedAt: now - 1_000,
      heartbeatAt: now,
    });
    await db.insert(projectStatusResults).values([
      {
        id: "status-test-restart-available",
        runId: "status-test-restart-run",
        entryKey: availableEntry.entryKey,
        projectSlug: availableEntry.projectSlug,
        projectTitle: availableEntry.projectTitle,
        domain: availableEntry.domain,
        entryKind: availableEntry.kind,
        entryLabel: availableEntry.label,
        href: availableEntry.href,
        status: "available",
        attempted: true,
        httpStatus: 200,
        checkedAt: now - 100,
      },
      {
        id: "status-test-restart-unknown",
        runId: "status-test-restart-run",
        entryKey: unknownEntry.entryKey,
        projectSlug: unknownEntry.projectSlug,
        projectTitle: unknownEntry.projectTitle,
        domain: unknownEntry.domain,
        entryKind: unknownEntry.kind,
        entryLabel: unknownEntry.label,
        href: unknownEntry.href,
        status: "unknown",
        attempted: false,
      },
    ]);

    await interruptActiveProjectStatusRuns(now, true);

    const run = (await db.select().from(projectStatusRuns))[0];
    expect(run).toMatchObject({
      id: "status-test-restart-run",
      status: "interrupted",
      attemptedCount: 1,
      availableCount: 1,
      unavailableCount: 0,
    });
    const overview = await getProjectStatusOverview(now);
    expect(overview.latestRun?.status).toBe("interrupted");
    expect(overview.summary).toMatchObject({ available: 1, unavailable: 0, unknown: 41 });
  });

  test("shows saved snapshots from the active run while it is checking", async () => {
    const now = Date.now();
    const entry = getProjectStatusCatalogEntries()[0];
    await db.insert(projectStatusRuns).values({
      id: "status-test-active-overview",
      status: "running",
      triggeredBy: "manual",
      targetCount: 42,
      attemptedCount: 1,
      availableCount: 1,
      unavailableCount: 0,
      startedAt: now - 1_000,
      heartbeatAt: now,
    });
    await db.insert(projectStatusResults).values({
      id: "status-test-active-overview-result",
      runId: "status-test-active-overview",
      entryKey: entry.entryKey,
      projectSlug: entry.projectSlug,
      projectTitle: entry.projectTitle,
      domain: entry.domain,
      entryKind: entry.kind,
      entryLabel: entry.label,
      href: entry.href,
      status: "available",
      attempted: true,
      httpStatus: 200,
      checkedAt: now - 100,
    });

    const overview = await getProjectStatusOverview(now);

    expect(overview.activeRun?.id).toBe("status-test-active-overview");
    expect(overview.results.find((result) => result.entryKey === entry.entryKey)?.status).toBe(
      "available"
    );
    expect(overview.summary).toMatchObject({ available: 1, unavailable: 0, unknown: 41 });
  });

  test("interrupts a non-null heartbeat that has expired", async () => {
    const now = Date.now();
    await db.insert(projectStatusRuns).values({
      id: "status-test-stale-active",
      status: "running",
      triggeredBy: "scheduler",
      targetCount: 42,
      startedAt: now - PROJECT_STATUS_HEARTBEAT_STALE_AFTER_MS - 1_000,
      heartbeatAt: now - PROJECT_STATUS_HEARTBEAT_STALE_AFTER_MS - 1,
    });

    await interruptActiveProjectStatusRuns(now);

    expect((await db.select().from(projectStatusRuns))[0]?.status).toBe("interrupted");
  });

  test("allows only one concurrent batch to claim the running slot", async () => {
    const overrides = (prefix: string) => ({
      fetch: async () =>
        ({ status: 200, url: "https://final.example.test", redirected: false }) as Response,
      sleep: async () => undefined,
      now: () => Date.now(),
      resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
      id: (() => {
        let index = 0;
        return () => `${prefix}-${index++}`;
      })(),
    });
    const results = await Promise.allSettled([
      runProjectStatusCheck("manual", overrides("status-test-race-a")),
      runProjectStatusCheck("manual", overrides("status-test-race-b")),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ message: expect.stringContaining("already running") }),
    });
  });

  test("uses the latest interrupted or failed batch as the current overview", async () => {
    const now = Date.now();
    await db.insert(projectStatusRuns).values([
      {
        id: "status-test-previous-complete",
        status: "completed",
        triggeredBy: "scheduler",
        targetCount: 42,
        attemptedCount: 42,
        availableCount: 42,
        startedAt: now - 2_000,
        finishedAt: now - 1_000,
      },
      {
        id: "status-test-latest-error",
        status: "error",
        triggeredBy: "manual",
        targetCount: 42,
        startedAt: now,
        finishedAt: now + 100,
        errorMessage: "synthetic failure",
      },
    ]);

    const overview = await getProjectStatusOverview(now + 100);

    expect(overview.latestRun?.id).toBe("status-test-latest-error");
    expect(overview.summary).toMatchObject({ available: 0, unavailable: 0, unknown: 42 });
  });

  test("stops writing results after its lease is interrupted", async () => {
    let interrupted = false;
    await expect(
      runProjectStatusCheck("manual", {
        fetch: async () => {
          if (!interrupted) {
            interrupted = true;
            await interruptActiveProjectStatusRuns(
              Date.now() + PROJECT_STATUS_HEARTBEAT_STALE_AFTER_MS + 1
            );
          }
          return { status: 200, url: "https://final.example.test", redirected: false } as Response;
        },
        sleep: async () => undefined,
        now: () => Date.now(),
        resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
        id: (() => {
          let index = 0;
          return () => `status-test-lease-${index++}`;
        })(),
      })
    ).rejects.toThrow("interrupted");

    const runs = await db.select().from(projectStatusRuns);
    expect(runs.find((run) => run.id === "status-test-lease-0")?.status).toBe("interrupted");
    expect(await db.select().from(projectStatusResults)).toHaveLength(42);
    expect(runs.find((run) => run.id === "status-test-lease-0")).toMatchObject({
      attemptedCount: 0,
      availableCount: 0,
      unavailableCount: 0,
    });
  });
});
