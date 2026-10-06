import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { handleVersionRequest, readRuntimeVersionInfo } from "../../src/server/version-api";

const metadata = {
  productVersion: "2.8.0",
  buildVersion: "20261007-abcdef01",
  sourceSha: "a".repeat(40),
};
describe("read-only product version API", () => {
  test("fresh development boot tolerates absent generated metadata while production fails closed", async () => {
    const root = await mkdtemp(join(tmpdir(), "product-version-test-"));
    const file = pathToFileURL(join(root, "version.json"));
    try {
      expect(await readRuntimeVersionInfo(file, false)).toEqual({
        productVersion: null,
        buildVersion: "dev-local",
        sourceSha: "unknown",
      });
      await expect(readRuntimeVersionInfo(file, true)).rejects.toThrow();
      await writeFile(file, JSON.stringify(metadata));
      expect(await readRuntimeVersionInfo(file, true)).toEqual(metadata);
      await writeFile(file, JSON.stringify({ ...metadata, sourceSha: "unknown" }));
      await expect(readRuntimeVersionInfo(file, true)).rejects.toThrow("incomplete");
      await writeFile(file, "invalid json");
      await expect(readRuntimeVersionInfo(file, false)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test("reports product and build identity separately without caching stale deployments", async () => {
    const response = handleVersionRequest(
      new Request("https://console.ivanli.cc/api/version"),
      metadata
    );
    expect(await response.json()).toEqual(metadata);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  test("HEAD has no body and mutation methods cannot change version metadata", async () => {
    const head = handleVersionRequest(
      new Request("https://console.ivanli.cc/api/version", { method: "HEAD" }),
      metadata
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = handleVersionRequest(
        new Request("https://console.ivanli.cc/api/version", { method }),
        metadata
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
    }
  });
});
