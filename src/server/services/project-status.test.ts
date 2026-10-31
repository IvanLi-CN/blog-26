import { describe, expect, test } from "bun:test";
import { checkProjectStatusTarget } from "./project-status";

function response(
  status: number,
  url: string,
  redirected = false,
  headers: Record<string, string> = {}
) {
  return { status, url, redirected, headers: new Headers(headers) } as Response;
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
    resolveHost: async () => [{ address: "93.184.216.34", family: 4 }],
    ...overrides,
  };
}

describe("project status target checker", () => {
  test("follows redirects manually and records redirected 2xx metadata without reading a body", async () => {
    let requestInit: RequestInit | undefined;
    let calls = 0;
    const result = await checkProjectStatusTarget(
      "https://example.test/start",
      10_000,
      dependencies(async (_input, init) => {
        calls += 1;
        requestInit = init;
        return calls === 1
          ? response(302, "https://example.test/start", false, {
              location: "https://example.test/final",
            })
          : response(200, "https://example.test/final");
      })
    );

    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.redirect).toBe("manual");
    expect(result).toMatchObject({
      status: "available",
      finalUrl: "https://example.test/final",
      redirected: true,
      attemptCount: 1,
    });
  });

  test("rejects redirects into private networks before making the redirected request", async () => {
    let calls = 0;
    const result = await checkProjectStatusTarget(
      "https://example.test/start",
      10_000,
      dependencies(async () => {
        calls += 1;
        return response(302, "https://example.test/start", false, {
          location: "http://127.0.0.1:8080/internal",
        });
      })
    );

    expect(calls).toBe(1);
    expect(result).toMatchObject({
      status: "unavailable",
      errorKind: "unsafe_target",
      attemptCount: 1,
    });
  });

  test("rejects IPv4-mapped IPv6 private targets before making a request", async () => {
    let calls = 0;
    const result = await checkProjectStatusTarget(
      "http://[::ffff:7f00:1]/internal",
      10_000,
      dependencies(async () => {
        calls += 1;
        return response(200, "http://[::ffff:7f00:1]/internal");
      })
    );

    expect(calls).toBe(0);
    expect(result).toMatchObject({ status: "unavailable", errorKind: "unsafe_target" });
  });

  test("rejects all IPv6 link-local targets before making a request", async () => {
    let calls = 0;
    const result = await checkProjectStatusTarget(
      "http://[fe90::1]/internal",
      10_000,
      dependencies(async () => {
        calls += 1;
        return response(200, "http://[fe90::1]/internal");
      })
    );

    expect(calls).toBe(0);
    expect(result).toMatchObject({ status: "unavailable", errorKind: "unsafe_target" });
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

  test("counts DNS resolution against the target timeout", async () => {
    let fetchCalls = 0;
    const result = await checkProjectStatusTarget(
      "https://example.test/dns-timeout",
      10_000,
      dependencies(
        async () => {
          fetchCalls += 1;
          return response(200, "https://example.test/dns-timeout");
        },
        {
          resolveHost: () => new Promise(() => undefined),
        }
      )
    );

    expect(fetchCalls).toBe(0);
    expect(result).toMatchObject({ status: "unavailable", errorKind: "timeout" });
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
