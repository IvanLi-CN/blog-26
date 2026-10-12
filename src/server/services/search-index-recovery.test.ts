import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

describe.skipIf(process.platform !== "linux")("persistent search process recovery", () => {
  test("recovers SQLite rollback and durable Tantivy commits before checkpoint after SIGKILL", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "blog-search-process-"));
    const file = path.join(directory, "content.sqlite");
    async function run(phase: string, killed = false) {
      const child = Bun.spawn(
        [process.execPath, "tests/fixtures/search-recovery-process.ts", phase, file],
        { stdout: "pipe", stderr: "pipe" }
      );
      const [exit, output, errors] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (killed) expect(exit).not.toBe(0);
      else {
        expect(errors).toBe("");
        expect(exit).toBe(0);
        if (phase.startsWith("check") || phase === "recover") expect(output).toContain('"ok":true');
      }
    }
    try {
      await run("init");
      await run("rollback", true);
      await run("check-empty");
      await run("checkpoint", true);
      await run("recover");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30000);
});
