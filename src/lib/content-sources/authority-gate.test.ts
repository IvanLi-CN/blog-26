import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContentSourceManager } from "./manager";
import { ensureContentSourcesRegistered } from "./register";

const environment = { ...process.env };
const temporaryRoot = mkdtempSync(join(tmpdir(), "authority-gate-"));
process.env.DB_PATH = join(temporaryRoot, "db.sqlite");

beforeEach(() => {
  process.env.DB_PATH = join(temporaryRoot, "db.sqlite");
});

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
});

describe("content authority gate", () => {
  test("registering sources is skipped once the database is authoritative", async () => {
    process.env.LOCAL_CONTENT_BASE_PATH = process.cwd();
    process.env.CONTENT_AUTHORITY = "database";
    const manager = new ContentSourceManager();
    await ensureContentSourcesRegistered(manager);
    expect(manager.getSources()).toHaveLength(0);
  });

  test("the default authority still registers the local source", async () => {
    process.env.LOCAL_CONTENT_BASE_PATH = process.cwd();
    delete process.env.CONTENT_AUTHORITY;
    const manager = new ContentSourceManager();
    await ensureContentSourcesRegistered(manager);
    expect(manager.getSources().map((source) => source.name)).toEqual(["local"]);
  });
});
