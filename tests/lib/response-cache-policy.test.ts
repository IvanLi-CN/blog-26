import { describe, expect, it } from "bun:test";
import {
  applyPrivateResponseDefaults,
  PRIVATE_RESPONSE_CACHE_CONTROL,
  PRIVATE_RESPONSE_ROBOTS_TAG,
  PRIVATE_RESPONSE_VARY,
} from "../../src/lib/response-cache-policy";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

describe("private response defaults", () => {
  it("marks responses without an explicit policy as private and non-indexable", () => {
    const response = applyPrivateResponseDefaults(jsonResponse({ memos: [] }), "/api/public/memos");

    expect(response.headers.get("cache-control")).toBe(PRIVATE_RESPONSE_CACHE_CONTROL);
    expect(response.headers.get("vary")).toBe(PRIVATE_RESPONSE_VARY);
    expect(response.headers.get("x-robots-tag")).toBe(PRIVATE_RESPONSE_ROBOTS_TAG);
  });

  it("covers state-changing responses as well as reads", () => {
    const response = applyPrivateResponseDefaults(
      jsonResponse({ ok: true }, { status: 201 }),
      "/api/public/memos/example"
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe(PRIVATE_RESPONSE_CACHE_CONTROL);
  });

  it("keeps an explicit cache policy untouched", () => {
    const immutable = jsonResponse(
      {},
      { headers: { "cache-control": "public, max-age=31536000, immutable" } }
    );
    const runtimeConfig = jsonResponse({}, { headers: { "cache-control": "public, max-age=30" } });

    expect(
      applyPrivateResponseDefaults(
        immutable,
        "/api/public/assets/post/example/abc123/thumb.webp"
      ).headers.get("cache-control")
    ).toBe("public, max-age=31536000, immutable");
    expect(
      applyPrivateResponseDefaults(runtimeConfig, "/api/public/runtime-config").headers.get(
        "cache-control"
      )
    ).toBe("public, max-age=30");
  });

  it("does not touch non-API responses", () => {
    const response = applyPrivateResponseDefaults(jsonResponse({}), "/posts/example/");

    expect(response.headers.has("cache-control")).toBe(false);
    expect(response.headers.has("x-robots-tag")).toBe(false);
  });

  it("preserves body and status while adding headers", async () => {
    const response = applyPrivateResponseDefaults(
      jsonResponse({ error: { code: "FORBIDDEN", message: "Forbidden" } }, { status: 403 }),
      "/api/admin/session"
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });
  });

  it("treats internal asset source responses as private by default", () => {
    const response = applyPrivateResponseDefaults(
      jsonResponse({}),
      "/_internal/assets/source/memo/example/abc123"
    );

    expect(response.headers.get("cache-control")).toBe(PRIVATE_RESPONSE_CACHE_CONTROL);
  });
});
