import { describe, expect, it } from "bun:test";

describe("scripts/start-dev-webdav.ts", () => {
  it("does not throw on import when WEBDAV_URL is invalid", async () => {
    const prevWebdavUrl = process.env.WEBDAV_URL;

    try {
      process.env.WEBDAV_URL = "http://example.com:25601";

      // If config is eagerly parsed at module load, importing would throw.
      // Use a query param to avoid module cache between runs.
      await expect(
        import("../../../scripts/start-dev-webdav.ts?invalid-env")
      ).resolves.toBeDefined();
    } finally {
      if (typeof prevWebdavUrl === "string") {
        process.env.WEBDAV_URL = prevWebdavUrl;
      } else {
        delete process.env.WEBDAV_URL;
      }
    }
  });
});
