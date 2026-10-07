import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { link, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startClippingRuntime } from "./runtime";

test("an absent legacy content directory does not prevent gateway startup", async () => {
  const root = await mkdtemp(join(tmpdir(), "clipping-runtime-missing-content-"));
  const keys = [
    "DB_PATH",
    "PI_DURABLE_DB_PATH",
    "CLIPPING_PROCESSOR_ENABLED",
    "LOCAL_CONTENT_BASE_PATH",
  ] as const;
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.DB_PATH = join(root, "app.sqlite");
    process.env.PI_DURABLE_DB_PATH = join(root, "pi.sqlite");
    process.env.LOCAL_CONTENT_BASE_PATH = join(root, "not-created");
    delete process.env.CLIPPING_PROCESSOR_ENABLED;
    expect(await startClippingRuntime()).toBeNull();
    expect(await Bun.file(process.env.PI_DURABLE_DB_PATH).exists()).toBe(false);
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
    await rm(root, { recursive: true, force: true });
  }
});

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

test("a Pi database hardlink cannot reuse the application database", async () => {
  const root = await mkdtemp(join(tmpdir(), "clipping-runtime-hardlink-"));
  const keys = ["DB_PATH", "PI_DURABLE_DB_PATH", "CLIPPING_PROCESSOR_ENABLED"] as const;
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.DB_PATH = join(root, "app.sqlite");
    process.env.PI_DURABLE_DB_PATH = join(root, "pi.sqlite");
    delete process.env.CLIPPING_PROCESSOR_ENABLED;
    new Database(process.env.DB_PATH).close();
    await link(process.env.DB_PATH, process.env.PI_DURABLE_DB_PATH);
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

test("a dangling Pi database symlink is rejected before runtime creation", async () => {
  const root = await mkdtemp(join(tmpdir(), "clipping-runtime-dangling-"));
  const keys = ["DB_PATH", "PI_DURABLE_DB_PATH", "CLIPPING_PROCESSOR_ENABLED"] as const;
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.DB_PATH = join(root, "app.sqlite");
    process.env.PI_DURABLE_DB_PATH = join(root, "pi.sqlite");
    delete process.env.CLIPPING_PROCESSOR_ENABLED;
    new Database(process.env.DB_PATH).close();
    await symlink(join(root, "missing.sqlite"), process.env.PI_DURABLE_DB_PATH);
    await expect(startClippingRuntime()).rejects.toThrow("Pi storage symlink target must exist.");
  } finally {
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
    await rm(root, { recursive: true, force: true });
  }
});
