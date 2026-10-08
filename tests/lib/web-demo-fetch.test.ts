import { afterEach, describe, expect, it } from "bun:test";
import { setupAdminDemoApiMocks } from "../../apps/admin/src/demo/mock-admin-api";
import { webDemoFetch } from "../../src/lib/web-demo-fetch";
import { cancelWebDemoRequests } from "../../src/lib/web-demo-runtime";

const originalFetch = globalThis.fetch;
function mockFetch(handler: () => Promise<Response>): typeof fetch {
  return Object.assign(handler, { preconnect: originalFetch.preconnect });
}
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;

function installBrowser(search: string, enabled = true) {
  const dataset: Record<string, string> = {
    webDemoBuild: enabled ? "true" : "false",
  };
  const storage = new Map<string, string>();
  const fakeWindow = {
    location: new URL(`http://127.0.0.1:38110/posts/${search}`),
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    setTimeout,
    clearTimeout,
    fetch: originalFetch.bind(globalThis),
  };
  const fakeDocument = { documentElement: { dataset } };

  (globalThis as { window?: unknown }).window = fakeWindow;
  (globalThis as { document?: unknown }).document = fakeDocument;
}

afterEach(() => {
  cancelWebDemoRequests();
  globalThis.fetch = originalFetch;
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe("webDemoFetch", () => {
  it("admits only online route data reads through the fixture server boundary", async () => {
    installBrowser("?d_connection=offline&d_delay=normal");
    let calls = 0;
    globalThis.fetch = mockFetch(async () => {
      calls += 1;
      return Response.json({ kind: "posts", data: { source: "fixture" } });
    });
    await expect(webDemoFetch("/api/public/page?path=%2Fposts%2F")).rejects.toThrow(
      "Failed to fetch"
    );
    expect(calls).toBe(0);
    installBrowser("?d_connection=online&d_delay=normal");
    expect(await (await webDemoFetch("/api/public/page?path=%2Fposts%2F")).json()).toMatchObject({
      kind: "posts",
    });
    expect(calls).toBe(1);
  });
  it("cancels a delayed route read before contacting the fixture server", async () => {
    installBrowser("?d_connection=online&d_delay=custom&d_delay_ms=2300");
    let calls = 0;
    globalThis.fetch = mockFetch(async () => {
      calls += 1;
      return Response.json({});
    });
    const controller = new AbortController();
    const pending = webDemoFetch("/api/public/page?path=%2Fposts%2F", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(0);
  });
  it("short-circuits public requests when the simulated connection is offline", async () => {
    installBrowser("?d_persona=admin&d_connection=offline&d_delay=normal");
    let fetchCalls = 0;
    globalThis.fetch = mockFetch(async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    });

    await expect(webDemoFetch("/api/public/auth/me")).rejects.toThrow("Failed to fetch");
    expect(fetchCalls).toBe(0);
  });

  it("returns simulated public identity without reaching the real API", async () => {
    installBrowser("?d_persona=admin&d_connection=online&d_delay=normal");
    let fetchCalls = 0;
    globalThis.fetch = mockFetch(async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    });

    const response = await webDemoFetch("/api/public/auth/me");

    expect(await response.json()).toMatchObject({ id: "demo-admin", isAdmin: true });
    expect(fetchCalls).toBe(0);
  });

  it("does not fall back to a real public API for unknown endpoints", async () => {
    installBrowser("?d_persona=admin&d_connection=online&d_delay=normal");
    let fetchCalls = 0;
    globalThis.fetch = mockFetch(async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    });

    const response = await webDemoFetch("/api/public/unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "该公共接口未接入 Web Demo 模拟。" });
    expect(fetchCalls).toBe(0);
  });

  it("preserves the live fetch path when the build flag is absent", async () => {
    installBrowser("?d_persona=admin&d_connection=offline&d_delay=slow", false);
    let fetchCalls = 0;
    globalThis.fetch = mockFetch(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ source: "live" }));
    });

    const response = await webDemoFetch("/api/public/auth/me");

    expect(await response.json()).toEqual({ source: "live" });
    expect(fetchCalls).toBe(1);
  });

  it("returns online search results and suggestions through the fixture boundary", async () => {
    installBrowser("?d_connection=online");
    const response = await webDemoFetch("/api/public/search?q=fixture");
    expect(response.ok).toBe(true);
    expect(await response.json()).toContainEqual(
      expect.objectContaining({ slug: "code-block-fixture" })
    );
    const suggestions = await webDemoFetch("/api/public/search/suggestions?q=fixture");
    expect(await suggestions.json()).toHaveProperty("items");
  });

  it("rejects unauthenticated comment mutations and non-admin moderation", async () => {
    installBrowser("?d_persona=guest");
    expect((await webDemoFetch("/api/public/comments/missing", { method: "DELETE" })).status).toBe(
      401
    );
    installBrowser("?d_persona=user");
    expect((await webDemoFetch("/api/public/comments/missing", { method: "PATCH" })).status).toBe(
      404
    );
    expect(
      (await webDemoFetch("/api/public/comments/missing/moderate", { method: "POST" })).status
    ).toBe(403);
    installBrowser("?d_persona=admin");
    expect(
      (await webDemoFetch("/api/public/comments/missing/moderate", { method: "POST" })).ok
    ).toBe(true);
  });

  it("cancels direct admin uploads even when the caller supplies no signal", async () => {
    installBrowser("?d_persona=admin&d_delay=custom&d_delay_ms=2300");
    setupAdminDemoApiMocks();
    const pending = window.fetch("/api/files/local/blog/upload.png", {
      method: "POST",
      body: "fixture",
    });
    cancelWebDemoRequests();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("honors an AbortSignal carried by a Request object", async () => {
    installBrowser("?d_delay=custom&d_delay_ms=2300");
    const controller = new AbortController();
    const pending = webDemoFetch(
      new Request("http://127.0.0.1:38110/api/public/auth/me", { signal: controller.signal })
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels zero-delay responses before they leave the request boundary", async () => {
    installBrowser("?d_persona=admin&d_connection=online&d_delay=normal");
    const pending = webDemoFetch("/api/public/auth/me");
    cancelWebDemoRequests();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
