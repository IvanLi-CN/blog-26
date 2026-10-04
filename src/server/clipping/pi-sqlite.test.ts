import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Type } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { createRegistry, defineExtension, defineTool, Harness } from "@earendil-works/pi-durable";
import { type SqliteExecutor, SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { registerStorageConformance } from "@earendil-works/pi-durable/testing";
import { PiSqliteDatabase, RuntimeOwnershipError } from "./pi-sqlite";

const context = BACKGROUND_CONTEXT;

registerStorageConformance({ describe, expect, it }, "Bun fenced SQLite", async (use) => {
  const storage = await SqliteStorage.open(await PiSqliteDatabase.open(":memory:"));
  try {
    await use(storage);
  } finally {
    await storage.close(context);
  }
});

describe("Pi runtime ownership and recovery", () => {
  it("rejects a second owner and fences an expired process after takeover", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-owner-"));
    const path = join(directory, "runtime.sqlite");
    let clock = 1000;
    const first = await PiSqliteDatabase.open(path, { now: () => clock, leaseMs: 100 });
    let second: PiSqliteDatabase | undefined;
    try {
      await expect(PiSqliteDatabase.open(path, { now: () => clock })).rejects.toBeInstanceOf(
        RuntimeOwnershipError
      );
      await first.exec("CREATE TABLE example(value TEXT)");
      clock += 101;
      second = await PiSqliteDatabase.open(path, { now: () => clock });
      await expect(first.run("INSERT INTO example VALUES ('stale')")).rejects.toBeInstanceOf(
        RuntimeOwnershipError
      );
      await second.run("INSERT INTO example VALUES (?)", "current");
      expect(await second.all("SELECT * FROM example")).toEqual([{ value: "current" }]);
    } finally {
      await first.close();
      await second?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("serializes outside operations, rolls back errors and expires transaction handles", async () => {
    const database = await PiSqliteDatabase.open(":memory:");
    let retained: SqliteExecutor | undefined;
    try {
      await database.exec("CREATE TABLE example(value TEXT)");
      let outside: Promise<void> | undefined;
      await database.transaction(async (tx) => {
        retained = tx;
        await tx.run("INSERT INTO example VALUES ('inside')");
        outside = database.run("INSERT INTO example VALUES ('outside')");
        expect(await tx.all("SELECT * FROM example")).toEqual([{ value: "inside" }]);
      });
      await outside;
      await expect(retained?.all("SELECT * FROM example")).rejects.toThrow("no longer active");
      await expect(
        database.transaction(async (tx) => {
          await tx.run("DELETE FROM example");
          throw new Error("rollback");
        })
      ).rejects.toThrow("rollback");
      expect(await database.all("SELECT * FROM example")).toEqual([
        { value: "inside" },
        { value: "outside" },
      ]);
    } finally {
      await database.close();
    }
  });

  it("runs a scoped tool and reopens the same conversation and idempotent submission", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-recovery-"));
    const path = join(directory, "runtime.sqlite");
    const models = createModels();
    const faux = fauxProvider();
    models.setProvider(faux.provider);
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("article_section", { section: "intro" }), {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage(fauxText("The source confirms the claim.")),
    ]);
    let calls = 0;
    const registry = createRegistry();
    registry.install(
      defineExtension({
        name: "article",
        tools: [
          defineTool({
            name: "article_section",
            description: "Read an article section",
            replay: "safe",
            parameters: Type.Object({ section: Type.String() }),
            execute: async () => {
              calls++;
              return { content: [{ type: "text", text: "A committed source passage." }] };
            },
          }),
        ],
      })
    );
    let harness: Harness | undefined;
    try {
      harness = await Harness.open(
        await SqliteStorage.open(await PiSqliteDatabase.open(path)),
        {
          models,
          registry,
        },
        context
      );
      const root = await harness.root(context, {
        agent: { model: { provider: faux.provider.id, modelId: faux.getModel().id } },
      });
      const submission = await root.submit(
        { type: "input", content: "Find the intro", requestId: "memo-turn-1" },
        context
      );
      expect((await submission.wait(context)).status).toBe("done");
      expect(calls).toBe(1);
      const id = root.id;
      await harness.close(context);
      harness = await Harness.open(
        await SqliteStorage.open(await PiSqliteDatabase.open(path)),
        {
          models,
          registry,
        },
        context
      );
      harness.resume();
      const restored = await harness.root(context);
      expect(restored.id).toBe(id);
      const retried = await restored.submit(
        { type: "input", content: "Find the intro", requestId: "memo-turn-1" },
        context
      );
      expect(retried.id).toBe(submission.id);
      expect((await retried.wait(context)).status).toBe("done");
      expect(faux.state.callCount).toBe(2);
      expect(calls).toBe(1);
    } finally {
      await harness?.close(context);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
