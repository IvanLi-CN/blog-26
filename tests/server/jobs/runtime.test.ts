import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path, { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { initializeDB } from "@/lib/db";
import { startJobsRuntime, stopJobsRuntime } from "@/server/jobs/runtime";

const testDbPath = path.join(process.cwd(), "tmp/jobs-runtime-test.sqlite");

beforeAll(async () => {
  process.env.DB_PATH = testDbPath;
  mkdirSync(path.dirname(testDbPath), { recursive: true });
  rmSync(testDbPath, { force: true });
  const sqlite = new Database(testDbPath);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
  await initializeDB(true);
});

afterAll(() => {
  rmSync(testDbPath, { force: true });
});

const consoleStartSource = readFileSync(resolve("scripts/start-console.ts"), "utf8");
const gatewayRuntimeSource = readFileSync(resolve("scripts/start-gateway.ts"), "utf8");

it("registers the jobs runtime only in the canonical production console lifecycle", () => {
  expect(consoleStartSource).toContain(
    'import { startJobsRuntime, stopJobsRuntime } from "@/server/jobs/runtime";'
  );
  expect(consoleStartSource).toContain("await startJobsRuntime();");
  expect(consoleStartSource).toContain("stopJobsRuntime();");
  expect(gatewayRuntimeSource).not.toContain("startJobsRuntime");
  expect(gatewayRuntimeSource).not.toContain("startJobsScheduler");
});

afterEach(() => {
  stopJobsRuntime();
});

it("starts one scheduler instance and stops its timers through the runtime lifecycle", async () => {
  const first = await startJobsRuntime();
  const second = await startJobsRuntime();

  expect(second).toBe(first);
  expect(first.getOverview().map((job) => job.key)).toContain("ai-usage-maintenance");

  stopJobsRuntime();

  expect(first.getOverview()).toEqual([]);
});
