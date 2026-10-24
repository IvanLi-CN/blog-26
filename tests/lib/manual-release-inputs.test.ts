import { describe, expect, test } from "bun:test";
import {
  clippingResourceUrlsFromSnapshot,
  DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES,
  DEFAULT_RELEASE_MEDIA_DOWNLOAD_CONCURRENCY,
  fetchPublicSnapshot,
  MAX_RELEASE_MEDIA_DOWNLOAD_CONCURRENCY,
  resolveReleaseMediaDownloadConcurrency,
} from "../../src/lib/release/inputs";

const snapshotUrl = new URL("https://console.example.test/api/public/snapshot");

test("freezes captured clipping references from the public snapshot", () => {
  const hash = "a".repeat(64);
  expect(
    clippingResourceUrlsFromSnapshot(
      {
        clip: {
          source: `# Article\n\n![Image](./assets/${hash}.png)`,
          translation: null,
          resourceBaseUrl: "/api/public/memos/clip/clipping/assets/version-1/",
        },
      },
      "https://console.example.test"
    )
  ).toEqual([
    `https://console.example.test/api/public/memos/clip/clipping/assets/version-1/${hash}.png`,
  ]);
});

describe("manual release snapshot acquisition", () => {
  test("uses bounded parallelism for release media freezing", () => {
    expect(DEFAULT_RELEASE_MEDIA_DOWNLOAD_CONCURRENCY).toBe(8);
    expect(resolveReleaseMediaDownloadConcurrency("")).toBe(8);
    expect(resolveReleaseMediaDownloadConcurrency("4")).toBe(4);
    expect(
      resolveReleaseMediaDownloadConcurrency(String(MAX_RELEASE_MEDIA_DOWNLOAD_CONCURRENCY))
    ).toBe(8);
    expect(() => resolveReleaseMediaDownloadConcurrency("9")).toThrow("integer from 1 to 8");
  });

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

  test("cancels retryable snapshot response bodies before retrying", async () => {
    let calls = 0;
    let canceled = false;
    const response = await fetchPublicSnapshot(
      snapshotUrl,
      async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(
            new ReadableStream<Uint8Array>({
              start: (controller) => controller.enqueue(new Uint8Array([1])),
              cancel: () => {
                canceled = true;
              },
            }),
            { status: 503 }
          );
        }
        return new Response("complete", { status: 200 });
      },
      async () => undefined
    );

    expect(await response.text()).toBe("complete");
    expect(calls).toBe(2);
    expect(canceled).toBe(true);
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

  test("retries when reading a successful response body fails", async () => {
    const waits: number[] = [];
    let calls = 0;
    const responseBody = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start: (controller) => {
            controller.enqueue(new TextEncoder().encode("partial"));
            controller.error(new Error("socket reset while reading body"));
          },
        }),
        { status: 200 }
      );
    const response = await fetchPublicSnapshot(
      snapshotUrl,
      async () => {
        calls += 1;
        return calls === 1 ? responseBody() : new Response("ok", { status: 200 });
      },
      async (delayMs) => waits.push(delayMs)
    );

    expect(await response.text()).toBe("ok");
    expect(calls).toBe(2);
    expect(waits).toEqual([1_000]);
  });

  test("bounds oversized primary snapshot responses", async () => {
    let calls = 0;
    await expect(
      fetchPublicSnapshot(
        snapshotUrl,
        async () => {
          calls += 1;
          return new Response("small body", {
            status: 200,
            headers: {
              "content-length": String(DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES + 1),
            },
          });
        },
        async () => undefined
      )
    ).rejects.toThrow(
      `Public snapshot response exceeds ${DEFAULT_MAX_PUBLIC_SNAPSHOT_BYTES} bytes`
    );
    expect(calls).toBe(3);
  });

  test("uses an HTTP/1.1 fallback after repeated response-body transport failures", async () => {
    let fallbackCalls = 0;
    const result = await fetchPublicSnapshot(
      snapshotUrl,
      async () => {
        return new Response(
          new ReadableStream<Uint8Array>({
            start: (controller) => {
              controller.enqueue(new TextEncoder().encode("partial"));
              controller.error(new Error("socket reset while reading body"));
            },
          }),
          { status: 200 }
        );
      },
      async () => undefined,
      async () => {
        fallbackCalls += 1;
        return new Response("complete", { status: 200 });
      }
    );

    expect(await result.text()).toBe("complete");
    expect(fallbackCalls).toBe(1);
  });

  test("uses the same fallback after repeated request transport failures", async () => {
    let calls = 0;
    let fallbackCalls = 0;
    const result = await fetchPublicSnapshot(
      snapshotUrl,
      async () => {
        calls += 1;
        throw new Error("socket reset before response");
      },
      async () => undefined,
      async () => {
        fallbackCalls += 1;
        return new Response("complete", { status: 200 });
      }
    );

    expect(await result.text()).toBe("complete");
    expect(calls).toBe(3);
    expect(fallbackCalls).toBe(1);
  });
});
