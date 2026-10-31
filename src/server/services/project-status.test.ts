import { describe, expect, test } from "bun:test";
import { checkProjectStatusTarget } from "./project-status";

function response(status: number, url: string, redirected = false) {
  return { status, url, redirected } as Response;
}

function dependencies(
  fetchImpl: typeof fetch,
  overrides: Partial<Parameters<typeof checkProjectStatusTarget>[2]> = {}
) {
  let current = 1_000;
  return {
    fetch: fetchImpl,
    sleep: async (ms: number) => {
      current += ms;
    },
    now: () => current,
    id: () => "test-id",
    targetTimeoutMs: 10,
    retryDelayMs: 30,
    ...overrides,
  };
}

describe("project status target checker", () => {
  test("follows the GET contract and records redirected 2xx metadata without reading a body", async () => {
    let requestInit: RequestInit | undefined;
    const result = await checkProjectStatusTarget(
      "https://example.test/start",
      10_000,
      dependencies(async (_input, init) => {
        requestInit = init;
        return response(200, "https://example.test/final", true);
      })
    );

    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.redirect).toBe("follow");
    expect(result).toMatchObject({
      status: "available",
      finalUrl: "https://example.test/final",
      redirected: true,
      attemptCount: 1,
    });
  });

  test("does not retry 4xx but retries a 5xx once after the configured delay", async () => {
    let calls = 0;
    const notFound = await checkProjectStatusTarget(
      "https://example.test/missing",
      10_000,
      dependencies(async () => {
        calls += 1;
        return response(404, "https://example.test/missing");
      })
    );
    expect(calls).toBe(1);
    expect(notFound).toMatchObject({
      status: "unavailable",
      attemptCount: 1,
      errorKind: "http_404",
    });

    calls = 0;
    const recovered = await checkProjectStatusTarget(
      "https://example.test/flaky",
      10_000,
      dependencies(async () => {
        calls += 1;
        return response(calls === 1 ? 503 : 200, "https://example.test/flaky");
      })
    );
    expect(calls).toBe(2);
    expect(recovered).toMatchObject({ status: "available", attemptCount: 2 });
  });

  test("classifies network failures and timeout aborts", async () => {
    let calls = 0;
    const network = await checkProjectStatusTarget(
      "https://example.test/network",
      10_000,
      dependencies(async () => {
        calls += 1;
        throw new Error("DNS failed");
      })
    );
    expect(calls).toBe(2);
    expect(network).toMatchObject({ status: "unavailable", errorKind: "network", attemptCount: 2 });

    const timeout = await checkProjectStatusTarget(
      "https://example.test/slow",
      10_000,
      dependencies(
        (_input, init) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          })
      )
    );
    expect(timeout).toMatchObject({ status: "unavailable", errorKind: "timeout", attemptCount: 2 });
  });

  test("returns unknown when the batch deadline is already exhausted", async () => {
    const result = await checkProjectStatusTarget(
      "https://example.test/deadline",
      1_000,
      dependencies(async () => response(200, "https://example.test/deadline"))
    );
    expect(result).toMatchObject({
      status: "unknown",
      attempted: false,
      errorKind: "batch_timeout",
    });
  });
});
