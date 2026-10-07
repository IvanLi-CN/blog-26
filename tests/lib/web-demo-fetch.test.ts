import { afterEach, describe, expect, it } from "bun:test";
import { webDemoFetch } from "../../src/lib/web-demo-fetch";
import { cancelWebDemoRequests } from "../../src/lib/web-demo-runtime";

const originalFetch = globalThis.fetch;
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
  it("short-circuits public requests when the simulated connection is offline", async () => {
    installBrowser("?d_persona=admin&d_connection=offline&d_delay=normal");
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    await expect(webDemoFetch("/api/public/auth/me")).rejects.toThrow("Failed to fetch");
    expect(fetchCalls).toBe(0);
  });

  it("returns simulated public identity without reaching the real API", async () => {
    installBrowser("?d_persona=admin&d_connection=online&d_delay=normal");
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    const response = await webDemoFetch("/api/public/auth/me");

    expect(await response.json()).toMatchObject({ id: "demo-admin", isAdmin: true });
    expect(fetchCalls).toBe(0);
  });

  it("does not fall back to a real public API for unknown endpoints", async () => {
    installBrowser("?d_persona=admin&d_connection=online&d_delay=normal");
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    const response = await webDemoFetch("/api/public/unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "该公共接口未接入 Web Demo 模拟。" });
    expect(fetchCalls).toBe(0);
  });

  it("preserves the live fetch path when the build flag is absent", async () => {
    installBrowser("?d_persona=admin&d_connection=offline&d_delay=slow", false);
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ source: "live" }));
    };

    const response = await webDemoFetch("/api/public/auth/me");

    expect(await response.json()).toEqual({ source: "live" });
    expect(fetchCalls).toBe(1);
  });
});
