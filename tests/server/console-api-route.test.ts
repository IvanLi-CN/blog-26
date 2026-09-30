import { afterEach, describe, expect, test } from "bun:test";
import { ALL } from "../../site/pages/api/[...path]";

const CONTENT_PATH = "Memos/20260930_gong1-kai1-ce4-shi4.md";

afterEach(() => {
  delete process.env.CONSOLE_RUNTIME;
  delete process.env.DB_PATH;
  delete process.env.LOCAL_CONTENT_BASE_PATH;
  delete process.env.ADMIN_EMAIL;
});

describe("console file API route", () => {
  test("does not expose existing raw files to anonymous requests", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    process.env.DB_PATH = "./dev-data/sqlite.db";
    process.env.LOCAL_CONTENT_BASE_PATH = "./dev-data/local";

    const response = await ALL({
      request: new Request(`https://console.ivanli.cc/api/files/local/${CONTENT_PATH}`),
      params: { path: `files/local/${CONTENT_PATH}` },
    });

    expect(response.status).toBe(404);
  });

  test("allows administrators to read raw files for authoring", async () => {
    process.env.CONSOLE_RUNTIME = "true";
    process.env.DB_PATH = "./dev-data/sqlite.db";
    process.env.LOCAL_CONTENT_BASE_PATH = "./dev-data/local";
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
    process.env.LOCAL_CONTENT_BASE_PATH = "./dev-data/local";

    const response = await ALL({
      request: new Request("https://console.ivanli.cc/api/files/local/Memos/blocked.txt", {
        method: "POST",
        body: "blocked",
      }),
      params: { path: "files/local/Memos/blocked.txt" },
    });

    expect(response.status).toBe(404);
  });
});
