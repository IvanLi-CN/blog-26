import { describe, expect, test } from "bun:test";
import { handleVersionRequest } from "../../src/server/version-api";

const metadata = {
  productVersion: "2.8.0",
  buildVersion: "20261007-abcdef01",
  sourceSha: "a".repeat(40),
};
describe("read-only product version API", () => {
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
