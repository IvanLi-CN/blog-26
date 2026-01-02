import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { fetchIconifySsrSvgs, invalidateIconifySsrSvgCache } from "@/server/services/iconify-fetch";

const ICONIFY_BASE_URL = "https://api.iconify.design";

function getUrlString(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof input === "object" && input !== null && "url" in input) {
    const url = (input as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return String(input);
}

describe("iconify-fetch (SSR)", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls: string[] = [];

  beforeEach(() => {
    fetchCalls = [];
    invalidateIconifySsrSvgCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    invalidateIconifySsrSvgCache();
  });

  function mockBatchJsonEndpoint(): void {
    globalThis.fetch = (async (input: unknown) => {
      const url = getUrlString(input);
      fetchCalls.push(url);

      const u = new URL(url);
      const prefix = u.pathname.replace("/", "").replace(/\.json$/, "");
      const icons = (u.searchParams.get("icons") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const iconData: Record<string, { body: string; width: number; height: number }> = {};
      for (const name of icons) {
        iconData[name] = {
          body: `<path d="${prefix}:${name}"/>`,
          width: 24,
          height: 24,
        };
      }

      return new Response(JSON.stringify({ prefix, icons: iconData, width: 24, height: 24 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  it("groups mixed prefixes into separate Iconify requests", async () => {
    mockBatchJsonEndpoint();

    const out = await fetchIconifySsrSvgs(["tabler:activity", "simple-icons:docker"], {
      allowedPrefixes: ["tabler", "simple-icons"],
      iconifyBaseUrl: ICONIFY_BASE_URL,
      ttlSeconds: 3600,
      maxIconsPerRequest: 50,
      maxUrlLength: 10_000,
    });

    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls.some((url) => url.includes("/tabler.json"))).toBe(true);
    expect(fetchCalls.some((url) => url.includes("/simple-icons.json"))).toBe(true);
    expect(out["tabler:activity"]).toContain("<svg");
    expect(out["simple-icons:docker"]).toContain("<svg");
  });

  it("splits requests when maxIconsPerRequest is exceeded", async () => {
    mockBatchJsonEndpoint();

    const out = await fetchIconifySsrSvgs(["tabler:a", "tabler:b", "tabler:c"], {
      allowedPrefixes: ["tabler"],
      iconifyBaseUrl: ICONIFY_BASE_URL,
      ttlSeconds: 3600,
      maxIconsPerRequest: 2,
      maxUrlLength: 10_000,
    });

    expect(fetchCalls.length).toBe(2);
    expect(out["tabler:a"]).toContain("<svg");
    expect(out["tabler:b"]).toContain("<svg");
    expect(out["tabler:c"]).toContain("<svg");
  });

  it("splits requests when maxUrlLength is exceeded", async () => {
    mockBatchJsonEndpoint();

    const one = new URL(`${ICONIFY_BASE_URL}/tabler.json`);
    one.searchParams.set("icons", "a");

    const two = new URL(`${ICONIFY_BASE_URL}/tabler.json`);
    two.searchParams.set("icons", "a,b");

    const maxUrlLength = two.toString().length - 1;

    const out = await fetchIconifySsrSvgs(["tabler:a", "tabler:b"], {
      allowedPrefixes: ["tabler"],
      iconifyBaseUrl: ICONIFY_BASE_URL,
      ttlSeconds: 3600,
      maxIconsPerRequest: 50,
      maxUrlLength,
    });

    expect(fetchCalls.length).toBe(2);
    expect(out["tabler:a"]).toContain("<svg");
    expect(out["tabler:b"]).toContain("<svg");
  });

  it("uses in-memory cache to avoid duplicate fetch calls", async () => {
    mockBatchJsonEndpoint();

    const options = {
      allowedPrefixes: ["tabler"],
      iconifyBaseUrl: ICONIFY_BASE_URL,
      ttlSeconds: 3600,
      maxIconsPerRequest: 50,
      maxUrlLength: 10_000,
    } as const;

    const first = await fetchIconifySsrSvgs(["tabler:activity"], options);
    const second = await fetchIconifySsrSvgs(["tabler:activity"], options);

    expect(fetchCalls.length).toBe(1);
    expect(first["tabler:activity"]).toBe(second["tabler:activity"]);
  });

  it("rejects invalid iconIds safely (no fetch; null result)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch should not be called");
    }) as typeof fetch;

    const out = await fetchIconifySsrSvgs(["not-a-valid-icon-id"], {
      allowedPrefixes: ["tabler"],
      iconifyBaseUrl: ICONIFY_BASE_URL,
      ttlSeconds: 3600,
    });

    expect(fetchCalls.length).toBe(0);
    expect(out["not-a-valid-icon-id"]).toBeNull();
  });

  it("returns null for missing icons", async () => {
    globalThis.fetch = (async (input: unknown) => {
      const url = getUrlString(input);
      fetchCalls.push(url);

      const u = new URL(url);
      const prefix = u.pathname.replace("/", "").replace(/\.json$/, "");

      const iconData: Record<string, { body: string; width: number; height: number }> = {};
      iconData.a = { body: `<path d="${prefix}:a"/>`, width: 24, height: 24 };

      return new Response(
        JSON.stringify({ prefix, icons: iconData, not_found: ["missing"], width: 24, height: 24 }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch;

    const out = await fetchIconifySsrSvgs(["tabler:a", "tabler:missing"], {
      allowedPrefixes: ["tabler"],
      iconifyBaseUrl: ICONIFY_BASE_URL,
      ttlSeconds: 3600,
      maxIconsPerRequest: 50,
      maxUrlLength: 10_000,
    });

    expect(fetchCalls.length).toBe(1);
    expect(out["tabler:a"]).toContain("<svg");
    expect(out["tabler:missing"]).toBeNull();
  });
});
