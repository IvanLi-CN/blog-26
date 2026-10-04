import { writeFile } from "node:fs/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { PiSqliteDatabase } from "./pi-sqlite";

if (import.meta.main) {
  const [path, marker] = process.argv.slice(2);
  if (!path || !marker) throw new Error("Expected database and readiness marker paths");
  const models = createModels();
  const faux = fauxProvider();
  models.setProvider(faux.provider);
  faux.setResponses([
    async () => {
      await writeFile(marker, "model request is in flight");
      return new Promise(() => {
        // Hold the model response until the parent kills this process.
      });
    },
  ]);
  const harness = await Harness.open(
    await SqliteStorage.open(
      await PiSqliteDatabase.open(path, { leaseMs: 1000, heartbeatMs: 100 })
    ),
    { models, registry: createRegistry() },
    BACKGROUND_CONTEXT
  );
  const root = await harness.root(BACKGROUND_CONTEXT, {
    agent: { model: { provider: faux.provider.id, modelId: faux.getModel().id } },
  });
  setInterval(() => {
    // Keep an OS process alive while the model request remains unresolved.
  }, 1000);
  await (
    await root.submit(
      { type: "input", content: "Resume after interruption", requestId: "interrupted-input" },
      BACKGROUND_CONTEXT
    )
  ).wait(BACKGROUND_CONTEXT);
}
