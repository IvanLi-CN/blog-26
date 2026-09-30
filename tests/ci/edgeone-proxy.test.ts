import { afterEach, describe, expect, test } from "bun:test";
import { createProxyHandler } from "../../edge-functions/_lib/proxy.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function context(request: Request, backendOrigin = "https://console.ivanli.cc") {
  return {
    request,
    env: { BLOG_BACKEND_ORIGIN: backendOrigin, EDGEONE_PUBLIC_FALLBACK_SECRET: "edge-secret" },
  };
}

describe("EdgeOne Makers API proxy", () => {
  test("forwards public requests without browser identity headers", async () => {
    let upstreamRequest: Request | undefined;
    globalThis.fetch = (async (input) => {
      upstreamRequest = input instanceof Request ? input : new Request(input);
      return new Response("ok", {
        status: 201,
        headers: { "set-cookie": "session=updated; Path=/; HttpOnly" },
      });
    }) as typeof fetch;

    const response = await createProxyHandler()(
      context(
        new Request("https://ivanli.cc/api/public/comments?slug=hello", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer leaked-token",
            cookie: "session=existing",
            "remote-email": "admin@example.com",
          },
          body: '{"body":"hello"}',
        })
      )
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("session=updated");
    expect(upstreamRequest?.url).toBe("https://console.ivanli.cc/api/public/comments?slug=hello");
    expect(upstreamRequest?.method).toBe("POST");
    expect(upstreamRequest?.headers.get("cookie")).toBeNull();
    expect(upstreamRequest?.headers.get("authorization")).toBeNull();
    expect(upstreamRequest?.headers.get("remote-email")).toBeNull();
    expect(upstreamRequest?.headers.get("x-edgeone-public-fallback")).toBe("edge-secret");
    expect(upstreamRequest?.headers.get("x-forwarded-host")).toBe("ivanli.cc");
    expect(upstreamRequest?.headers.get("x-forwarded-proto")).toBe("https");
    expect(await upstreamRequest?.text()).toBe('{"body":"hello"}');
  });

  test("preserves identity headers for a non-public host", async () => {
    let upstreamRequest: Request | undefined;
    globalThis.fetch = (async (input) => {
      upstreamRequest = input instanceof Request ? input : new Request(input);
      return new Response("ok");
    }) as typeof fetch;

    await createProxyHandler()(
      context(
        new Request("https://console.ivanli.cc/api/health", {
          headers: {
            authorization: "Bearer token",
            cookie: "session=existing",
            "remote-email": "admin@example.com",
          },
        })
      )
    );

    expect(upstreamRequest?.headers.get("cookie")).toBe("session=existing");
    expect(upstreamRequest?.headers.get("authorization")).toBe("Bearer token");
    expect(upstreamRequest?.headers.get("remote-email")).toBe("admin@example.com");
  });

  test("returns a generic gateway failure when the upstream configuration is invalid", async () => {
    const response = await createProxyHandler()(
      context(new Request("https://ivanli.cc/api/health"), "http://internal.example.test")
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("Bad Gateway");
  });

  test("does not expose upstream failures", async () => {
    globalThis.fetch = (async () => {
      throw new Error("private upstream address");
    }) as typeof fetch;

    const response = await createProxyHandler()(context(new Request("https://ivanli.cc/mcp")));

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Bad Gateway");
  });
});
