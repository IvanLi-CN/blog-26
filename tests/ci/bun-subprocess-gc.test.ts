import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("memo subprocess output survives GC of pipe writers without synchronous waiting", async () => {
  // Isolate the Bun 1.4.2 wrong-loop trigger so it cannot corrupt the parent test runner.
  const script = `
    const { runBun } = await import(${JSON.stringify(resolve("tests/helpers/run-bun.ts"))});
    const holder = { writers: Array.from({ length: 3 }, () => {
      const writer = Bun.stderr.writer(); writer.write(""); writer.flush(); return writer;
    }) };
    const references = holder.writers.map(writer => new WeakRef(writer));
    await Bun.sleep(0);
    Bun.spawnSync({ cmd: ["true"], stdout: "pipe", stderr: "ignore",
      get maxBuffer() { Bun.gc(true); holder.writers = null; }
    });
    const collected = references.filter(reference => !reference.deref()).length;
    const result = await runBun(["-e", 'await Bun.sleep(100); const mod = await import("./src/lib/memo-paths.ts?gc-regression"); console.log(mod.getMemoRootDir());']);
    console.log(JSON.stringify({ collected, status: result.status, stdout: result.stdout, stderr: result.stderr }));
  `;
  const child = Bun.spawn([process.execPath, "-e", script], {
    env: { ...process.env, BUN_JSC_slowPathAllocsBetweenGCs: "3" },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 3000,
  });
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ status, stderr }).toEqual({ status: 0, stderr: "" });
  expect(JSON.parse(stdout)).toEqual({ collected: 3, status: 0, stdout: "Memos\n", stderr: "" });
});
