import { afterEach, describe, expect, test } from "bun:test";
import { createProxyHandler } from "../../edge-functions/_lib/proxy.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function context(request: Request, backendOrigin = "https://api.ivanli.cc") {
  return {
    request,
    env: { BLOG_BACKEND_ORIGIN: backendOrigin },
  };
}

describe("EdgeOne Makers API proxy", () => {
  test("forwards the method, path, query, cookie, and forwarding headers", async () => {
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
            cookie: "session=existing",
          },
          body: '{"body":"hello"}',
        })
      )
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("session=updated");
    expect(upstreamRequest?.url).toBe("https://api.ivanli.cc/api/public/comments?slug=hello");
    expect(upstreamRequest?.method).toBe("POST");
    expect(upstreamRequest?.headers.get("cookie")).toBe("session=existing");
    expect(upstreamRequest?.headers.get("x-forwarded-host")).toBe("ivanli.cc");
    expect(upstreamRequest?.headers.get("x-forwarded-proto")).toBe("https");
    expect(await upstreamRequest?.text()).toBe('{"body":"hello"}');
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
