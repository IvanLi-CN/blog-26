import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.skipIf(process.platform !== "linux")(
  "independent processes reuse a live task and fence its late worker after takeover",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "content-task-lease-"));
    const env = {
      PATH: process.env.PATH,
      DB_PATH: join(root, "db.sqlite"),
      PLAYBOOK_CACHE_DIR: join(root, "playbook"),
    };
    const child = Bun.spawn([process.execPath, "tests/lib/content-task-lease-fixture.ts", "hold"], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    try {
      for (let attempt = 0; !existsSync(join(root, "owner.json")); attempt++) {
        if (attempt > 500) throw new Error("Owner startup timeout");
        await Bun.sleep(10);
      }
      for (const phase of ["reuse", "takeover"]) {
        const probe = Bun.spawn(
          [process.execPath, "tests/lib/content-task-lease-fixture.ts", phase],
          { env, stdout: "pipe", stderr: "pipe" }
        );
        const [stdout, stderr, code] = await Promise.all([
          new Response(probe.stdout).text(),
          new Response(probe.stderr).text(),
          probe.exited,
        ]);
        if (code !== 0) throw new Error(`${phase}: ${stderr}\n${stdout}`);
        const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");
        expect(result.mock).toBe(true);
        if (phase === "reuse") expect(result.reused).toBe(true);
        else expect(result.task).toMatchObject({ status: "success", processed: 2 });
      }
      writeFileSync(join(root, "release"), "go");
      const [stdout, stderr, code] = await output;
      if (code !== 0) throw new Error(`${stderr}\n${stdout}`);
      expect(JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}").task).toMatchObject({
        status: "success",
        processed: 2,
      });
      const sqlite = new Database(env.DB_PATH);
      expect(
        sqlite.query("SELECT total FROM content_task_counters WHERE source='local'").get()
      ).toEqual({ total: 1 });
      sqlite.close();
    } finally {
      child.kill();
      await output;
      rmSync(root, { recursive: true, force: true });
    }
  },
  30000
);
