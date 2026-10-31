import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { getProjectStatusCatalogEntries } from "@/lib/project-catalog";
import { PROJECT_STATUS_RETENTION_MS } from "@/lib/project-status";
import { projectStatusResults, projectStatusRuns } from "@/lib/schema";
import { getProjectStatusOverview, runProjectStatusCheck } from "./project-status";

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

    await runProjectStatusCheck("scheduler", {
      fetch: async () =>
        ({ status: 200, url: "https://final.example.test", redirected: false }) as Response,
      sleep: async () => undefined,
      now: () => Date.now(),
      id: (() => {
        let index = 0;
        return () => `status-test-new-${index++}`;
      })(),
    });

    const runs = await db.select().from(projectStatusRuns);
    expect(runs.some((run) => run.id === oldRunId)).toBe(false);
    expect(runs.find((run) => run.id === activeRunId)?.status).toBe("interrupted");
  });
});
