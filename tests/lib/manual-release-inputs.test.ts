import { describe, expect, test } from "bun:test";
import { fetchPublicSnapshot } from "../../src/lib/release/inputs";

const snapshotUrl = new URL("https://console.example.test/api/public/snapshot");

describe("manual release snapshot acquisition", () => {
  test("retries transient edge failures before returning the snapshot", async () => {
    const statuses = [525, 503, 200];
    const waits: number[] = [];
    const response = await fetchPublicSnapshot(
      snapshotUrl,
      async () => {
        const status = statuses.shift();
        if (!status) throw new Error("missing test status");
        return new Response("ok", { status });
      },
      async (delayMs) => waits.push(delayMs)
    );

    expect(response.status).toBe(200);
    expect(waits).toEqual([1_000, 3_000]);
  });

  test("does not retry non-transient client errors", async () => {
    let calls = 0;
    await expect(
      fetchPublicSnapshot(
        snapshotUrl,
        async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
        async () => {
          throw new Error("unexpected retry");
        }
      )
    ).rejects.toThrow("HTTP 404");
    expect(calls).toBe(1);
  });

  test("retries network failures and preserves the final error", async () => {
    const waits: number[] = [];
    await expect(
      fetchPublicSnapshot(
        snapshotUrl,
        async () => {
          throw new Error("socket reset");
        },
        async (delayMs) => waits.push(delayMs)
      )
    ).rejects.toThrow("socket reset");
    expect(waits).toEqual([1_000, 3_000]);
  });
});
