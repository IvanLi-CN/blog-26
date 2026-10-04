import { expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startClippingRuntime } from "./runtime";

test("a Pi database symlink cannot reuse the application database", async () => {
  const root = await mkdtemp(join(tmpdir(), "clipping-runtime-path-"));
  const keys = ["DB_PATH", "PI_DURABLE_DB_PATH", "CLIPPING_PROCESSOR_ENABLED"] as const;
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.DB_PATH = join(root, "app.sqlite");
    process.env.PI_DURABLE_DB_PATH = join(root, "pi.sqlite");
    delete process.env.CLIPPING_PROCESSOR_ENABLED;
    await symlink(process.env.DB_PATH, process.env.PI_DURABLE_DB_PATH);
    await expect(startClippingRuntime()).rejects.toThrow(
      "Pi storage must be separate from the application database."
    );
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
    await rm(root, { recursive: true, force: true });
  }
});
