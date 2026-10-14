import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test.skipIf(process.platform !== "linux")(
  "Mock projections survive process restart and feed modern RAG",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "rag-mock-restart-"));
    try {
      const env = {
        PATH: process.env.PATH,
        DB_PATH: join(root, "db.sqlite"),
        PLAYBOOK_CACHE_DIR: join(root, "playbook"),
        SEARCH_INDEX_PATH: join(root, "search"),
        LOCAL_CONTENT_BASE_PATH: join(root, "local"),
        OPENAI_API_BASE_URL: "https://synthetic-restart.example.test",
        OPENAI_API_KEY: "synthetic-only",
        CHAT_COMPLETION_MODEL: "synthetic-chat",
        EMBEDDING_MODEL_NAME: "synthetic-embedding",
        PLAYBOOK_SYNC_ENABLED: "false",
      };
      for (const phase of ["write", "read"]) {
        const child = Bun.spawn(
          [process.execPath, "tests/lib/rag-index-restart-fixture.ts", phase],
          { env, stdout: "pipe", stderr: "pipe" }
        );
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        if (code !== 0) throw new Error(`Mock ${phase} failed: ${stderr}\n${stdout}`);
        const receipt = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");
        expect(receipt.mock).toBe(true);
        expect(receipt.contents.indexed).toBe(receipt.contents.total);
        if (phase === "write") expect(receipt.embeddingCalls).toBeGreaterThan(0);
        else expect(receipt.embeddingCalls).toBe(2); // One query vector per source; no implicit rebuilding.
        console.log(JSON.stringify(receipt));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  30000
);
