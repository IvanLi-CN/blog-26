import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL } from "../../site/pages/api/[...path]";

const CONTENT_PATH = "Memos/20260930_gong1-kai1-ce4-shi4.md";
const CONTENT_ROOT = resolve("tmp/console-api-route-test");

beforeEach(() => {
  mkdirSync(resolve(CONTENT_ROOT, "Memos"), { recursive: true });
  writeFileSync(resolve(CONTENT_ROOT, CONTENT_PATH), "# 公开测试\n\n公开测试 Memo\n", "utf8");
});

afterEach(() => {
  delete process.env.CONSOLE_RUNTIME;
  delete process.env.DB_PATH;
  delete process.env.LOCAL_CONTENT_BASE_PATH;
  delete process.env.ADMIN_EMAIL;
  rmSync(CONTENT_ROOT, { recursive: true, force: true });
});

describe("console file API route", () => {
  test("does not expose existing raw files to anonymous requests", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    process.env.DB_PATH = "./dev-data/sqlite.db";
    process.env.LOCAL_CONTENT_BASE_PATH = CONTENT_ROOT;

    const response = await ALL({
      request: new Request(`https://console.ivanli.cc/api/files/local/${CONTENT_PATH}`),
      params: { path: `files/local/${CONTENT_PATH}` },
    });

    expect(response.status).toBe(404);
  });

  test("allows administrators to read raw files for authoring", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    process.env.DB_PATH = "./dev-data/sqlite.db";
    process.env.LOCAL_CONTENT_BASE_PATH = CONTENT_ROOT;
    process.env.ADMIN_EMAIL = "admin-test@test.local";

    const response = await ALL({
      request: new Request(`https://console.ivanli.cc/api/files/local/${CONTENT_PATH}`, {
        headers: { "Remote-Email": "admin-test@test.local" },
      }),
      params: { path: `files/local/${CONTENT_PATH}` },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("公开测试");
  });

  test("does not allow anonymous raw file writes through the console route", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    process.env.DB_PATH = "./dev-data/sqlite.db";
    process.env.LOCAL_CONTENT_BASE_PATH = CONTENT_ROOT;

    const response = await ALL({
      request: new Request("https://console.ivanli.cc/api/files/local/Memos/blocked.txt", {
        method: "POST",
        body: "blocked",
      }),
      params: { path: "files/local/Memos/blocked.txt" },
    });

    expect(response.status).toBe(404);
  });

  test("decodes encoded percent sequences in file names exactly once", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    process.env.DB_PATH = "./dev-data/sqlite.db";
    process.env.LOCAL_CONTENT_BASE_PATH = CONTENT_ROOT;
    process.env.ADMIN_EMAIL = "admin-test@test.local";
    writeFileSync(resolve(CONTENT_ROOT, "Memos/a%2Fb.md"), "# Encoded file name\n", "utf8");

    const response = await ALL({
      request: new Request("https://console.ivanli.cc/api/files/local/Memos/a%252Fb.md", {
        headers: { "Remote-Email": "admin-test@test.local" },
      }),
      params: { path: "files/local/Memos/a%2Fb.md" },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Encoded file name");
  });
});
