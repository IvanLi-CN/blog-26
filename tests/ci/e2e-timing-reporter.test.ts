import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { summarizeSteps } from "../e2e/timing-reporter";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function step(
  category: string,
  title: string,
  start: number,
  duration: number,
  steps: ReturnType<typeof leaf>[] = []
) {
  return { category, title, startTime: new Date(start), duration, steps };
}
function leaf(category: string, title: string, start: number, duration: number) {
  return { category, title, startTime: new Date(start), duration, steps: [] };
}

test("timing separates navigation, input and waits without double-counting nested or concurrent work", () => {
  const result = summarizeSteps([
    step("hook", "Before Hooks", 0, 200, [
      leaf("pw:api", "Navigate", 0, 100),
      leaf("pw:api", "Reload", 50, 100),
    ]),
    step("expect", "expect.toBeVisible", 100, 150, [leaf("pw:api", "Wait for selector", 110, 100)]),
    leaf("pw:api", 'Fill "SECRET"', 250, 20),
    leaf("pw:api", "Wait for timeout", 270, 30),
    leaf("pw:api", "Evaluate", 300, 10),
    leaf("pw:api", "Navigate", 0, -1),
  ]);
  expect(result).toEqual({
    navigation_ms: 150,
    action_ms: 20,
    assertion_ms: 150,
    wait_ms: 30,
    other_ms: 10,
    observed_union_ms: 310,
  });
  expect(JSON.stringify(result)).not.toContain("SECRET");
  expect(summarizeSteps([]).observed_union_ms).toBe(0);
});

test("the real Playwright runner invokes the reporter, preserves failures and emits no title or parameter values", async () => {
  const root = await mkdtemp(join(tmpdir(), "e2e-timing-reporter-"));
  roots.push(root);
  const reporter = resolve("tests/e2e/timing-reporter.ts");
  const runner = resolve("node_modules/@playwright/test/index.mjs");
  const config = join(root, "playwright.config.ts");
  await writeFile(
    config,
    `export default { testDir: ${JSON.stringify(root)}, outputDir: ${JSON.stringify(join(root, "results"))}, reporter: [[${JSON.stringify(reporter)}]], workers: 1, retries: 0 };`
  );
  await writeFile(
    join(root, "probe.spec.ts"),
    `
    import {test, expect} from ${JSON.stringify(runner)};
    test('SECRET_TITLE', async () => {
      await test.step('SECRET_STEP', async () => {
        const start = Date.now();
        await expect.poll(() => Date.now() - start, {intervals: [5]}).toBeGreaterThan(20);
      });
      expect('SECRET_VALUE').toBe('intentional failure');
    });
  `
  );
  const child = Bun.spawn([process.execPath, "x", "playwright", "test", "--config", config], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ status, stderr }).toEqual({ status: 1, stderr: "" });
  const line = stdout.split("\n").find((value) => value.startsWith("[e2e-timing] "));
  expect(line).toBeDefined();
  const output = JSON.parse(line?.slice("[e2e-timing] ".length) ?? "{}");
  expect(output.files).toHaveLength(1);
  expect(output.files[0].file).toBe("probe.spec.ts");
  expect(output.files[0].attempts).toBe(1);
  expect(output.files[0].steps.assertion_ms).toBeGreaterThanOrEqual(20);
  expect(output.slowest).toHaveLength(1);
  expect(output.slowest[0].retry).toBe(0);
  expect(line).not.toContain("SECRET");
  expect(line).not.toContain(root);
}, 15000);
