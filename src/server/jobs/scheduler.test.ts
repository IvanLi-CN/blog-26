import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { jobRuns, jobSchedulerLeases } from "@/lib/schema";
import { markOrphanedSchedulerRuns } from "./scheduler";

const testDbPath = path.join(process.cwd(), "tmp/scheduler-test.sqlite");

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
  await db.delete(jobRuns);
  await db.delete(jobSchedulerLeases);
});

afterAll(() => {
  fs.rmSync(testDbPath, { force: true });
});

test("reclaims scheduler jobs without interrupting manual work", async () => {
  const now = Date.now();
  await db.insert(jobRuns).values([
    {
      id: "scheduler-run",
      jobKey: "project-entry-status",
      jobName: "项目入口状态检查",
      status: "running",
      triggeredBy: "scheduler",
      startedAt: now - 1_000,
      logPath: "/tmp/scheduler-run.log",
      logDeleted: false,
      attempt: 1,
    },
    {
      id: "manual-run",
      jobKey: "incremental-sync",
      jobName: "定时增量同步",
      status: "running",
      triggeredBy: "manual",
      startedAt: now - 500,
      logPath: "/tmp/manual-run.log",
      logDeleted: false,
      attempt: 1,
    },
  ]);

  await markOrphanedSchedulerRuns(now);

  expect(await db.select({ id: jobRuns.id, status: jobRuns.status }).from(jobRuns)).toEqual(
    expect.arrayContaining([
      { id: "scheduler-run", status: "error" },
      { id: "manual-run", status: "running" },
    ])
  );
});
