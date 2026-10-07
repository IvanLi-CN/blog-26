import { expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { AgentConfigurationError, AgentRuntimeFacade } from "./agent-runtime";
import { PiSqliteDatabase } from "./pi-sqlite";

it("adapts an OpenAI-compatible endpoint and recovers messages without storing credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-protocol-"));
  const path = join(directory, "runtime.sqlite");
  let calls = 0;
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe("/v1/chat/completions");
      expect(request.headers.get("authorization")).toBe("Bearer fixture-secret");
      const body = await request.json();
      expect(body.model).toBe("fixture-model");
      expect(body.tools).toBeUndefined();
      calls++;
      const chunks = [
        {
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "A grounded answer." },
              finish_reason: null,
            },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      ];
      return new Response(
        `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
        {
          headers: { "content-type": "text/event-stream" },
        }
      );
    },
  });
  const options = {
    path,
    resolveModel: async () => ({
      model: "fixture-model",
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      apiKey: "fixture-secret",
    }),
  };
  let runtime: AgentRuntimeFacade | undefined;
  try {
    runtime = await AgentRuntimeFacade.open(options);
    const id = await runtime.createConversation("Use the supplied article only.");
    const submission = await runtime.submit(id, "Discuss the source.", "message-1");
    expect(await runtime.answer(id, submission)).toBe("A grounded answer.");
    await runtime.close();
    runtime = await AgentRuntimeFacade.open(options);
    expect(await runtime.submit(id, "Discuss the source.", "message-1")).toBe(submission);
    expect(await runtime.answer(id, submission)).toBe("A grounded answer.");
    const snapshot = await runtime.snapshot(id);
    expect(snapshot.messages.map((message) => message.text)).toEqual([
      "Discuss the source.",
      "A grounded answer.",
    ]);
    expect(snapshot.generating).toBe(false);
    expect(calls).toBe(1);
    await runtime.close();
    runtime = undefined;
    expect((await readFile(path)).includes(Buffer.from("fixture-secret"))).toBe(false);
  } finally {
    await runtime?.close();
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
});

it("reports missing application model configuration without opening runtime storage", async () => {
  await expect(
    AgentRuntimeFacade.open({
      path: ":memory:",
      resolveModel: async () => ({ model: "fixture", baseUrl: null, apiKey: null }),
    })
  ).rejects.toBeInstanceOf(AgentConfigurationError);
});

it("resumes the committed model request after SIGKILL without duplicating the input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-kill-"));
  const path = join(directory, "runtime.sqlite");
  const marker = join(directory, "request-started");
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "pi-interruption.fixture.ts"), path, marker],
    { stdout: "ignore", stderr: "pipe" }
  );
  let harness: Harness | undefined;
  try {
    const deadline = Date.now() + 5000;
    while (!existsSync(marker) && Date.now() < deadline) await Bun.sleep(10);
    expect(existsSync(marker)).toBe(true);
    child.kill(9);
    await child.exited;
    const models = createModels();
    const faux = fauxProvider();
    models.setProvider(faux.provider);
    faux.setResponses([fauxAssistantMessage("Recovered the interrupted request.")]);
    harness = await Harness.open(
      await SqliteStorage.open(
        await PiSqliteDatabase.open(path, { now: () => Date.now() + 10_000 })
      ),
      { models, registry: createRegistry() },
      BACKGROUND_CONTEXT
    );
    harness.resume();
    const root = await harness.root(BACKGROUND_CONTEXT);
    const submission = await root.submit(
      { type: "input", content: "Resume after interruption", requestId: "interrupted-input" },
      BACKGROUND_CONTEXT
    );
    expect((await submission.wait(BACKGROUND_CONTEXT)).status).toBe("done");
    const entries = await root.entries({}, 100, undefined, BACKGROUND_CONTEXT);
    expect(entries.items.filter((entry) => entry.kind === "pi.user")).toHaveLength(1);
    expect(faux.state.callCount).toBe(1);
  } finally {
    child.kill(9);
    await child.exited;
    await harness?.close(BACKGROUND_CONTEXT);
    await rm(directory, { recursive: true, force: true });
  }
}, 10_000);
