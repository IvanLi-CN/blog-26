import { afterEach, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startJobsRuntime, stopJobsRuntime } from "@/server/jobs/runtime";

const consoleRuntimeSource = readFileSync(resolve("scripts/start-console.ts"), "utf8");
const gatewayRuntimeSource = readFileSync(resolve("scripts/start-gateway.ts"), "utf8");

it("registers the jobs runtime only in the canonical production console lifecycle", () => {
  expect(consoleRuntimeSource).toContain(
    'import { startJobsRuntime, stopJobsRuntime } from "@/server/jobs/runtime";'
  );
  expect(consoleRuntimeSource).toContain("await startJobsRuntime();");
  expect(consoleRuntimeSource).toContain("stopJobsRuntime();");
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
