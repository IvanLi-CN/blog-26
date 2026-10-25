import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { initializeDB } from "../../src/lib/db";
import { publicFixtureCatalog, publicFixtureSearch } from "../../src/lib/playbook/fixture";
import { computePlaybookContentHash } from "../../src/lib/playbook/manifest";
import { PlaybookSnapshotStore } from "../../src/server/services/playbook-snapshot-store";

let root: string;
const environment = { ...process.env };

function snapshot(commit: string) {
  const normalized = {
    catalog: structuredClone(publicFixtureCatalog),
    search: structuredClone(publicFixtureSearch),
  };
  return {
    ...normalized,
    sourceRevision: {
      provider: "github" as const,
      repository: "IvanLi-CN/style-playbook-skills",
      ref: "main",
      commit,
    },
    contentHash: computePlaybookContentHash(normalized),
  };
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "playbook-snapshot-restart-"));
  process.env.DB_PATH = join(root, "db.sqlite");
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
});

afterAll(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  rmSync(root, { recursive: true, force: true });
});

test("current and previous normalized snapshots survive a separate process restart", async () => {
  const store = new PlaybookSnapshotStore();
  const first = snapshot("e".repeat(40));
  const second = snapshot("f".repeat(40));
  store.adopt(first, { expectedCurrent: null });
  store.adopt(second, { expectedCurrent: store.current });

  const dbModule = resolve("src/lib/db.ts");
  const storeModule = resolve("src/server/services/playbook-snapshot-store.ts");
  const script = `
    const { initializeDB } = await import(${JSON.stringify(dbModule)});
    const { PlaybookSnapshotStore } = await import(${JSON.stringify(storeModule)});
    await initializeDB(true);
    const store = new PlaybookSnapshotStore();
    console.log(JSON.stringify({
      current: store.current?.sourceRevision.commit,
      previous: store.previous?.sourceRevision.commit,
      currentHash: store.current?.contentHash,
      previousHash: store.previous?.contentHash,
    }));
  `;
  const child = Bun.spawn([process.execPath, "-e", script], {
    cwd: process.cwd(),
    env: { ...process.env, DB_PATH: join(root, "db.sqlite") },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  if (code !== 0) throw new Error(stderr);
  const result = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");
  expect(result).toMatchObject({
    current: "f".repeat(40),
    previous: "e".repeat(40),
    currentHash: second.contentHash,
    previousHash: first.contentHash,
  });
});
