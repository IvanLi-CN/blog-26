import { describe, expect, it } from "bun:test";
import {
  buildPublicErrorBody,
  createErrorRef,
  normalizePublicErrorCode,
  PUBLIC_ERROR_PRESETS,
  publicErrorCodeForStatus,
  publicErrorMessage,
  sanitizePublicErrorBody,
} from "../../src/lib/public-error-presets";

describe("public error presets", () => {
  it("groups every registered code under one of the seven semantic kinds", () => {
    const kinds = new Set(Object.values(PUBLIC_ERROR_PRESETS).map((preset) => preset.kind));

    expect([...kinds].sort()).toEqual([
      "forbidden",
      "invalid-request",
      "network",
      "not-found",
      "rate-limited",
      "unauthenticated",
      "unavailable",
    ]);
    expect(kinds.size).toBe(7);
  });

  it("gives every registered code a visitor-readable message", () => {
    for (const [code, preset] of Object.entries(PUBLIC_ERROR_PRESETS)) {
      expect(preset.message.trim().length).toBeGreaterThan(0);
      expect(preset.message).not.toContain(code);
    }
  });

  it("maps unknown codes by status instead of passing them through", () => {
    expect(normalizePublicErrorCode("some-internal-marker", 400)).toBe("INVALID_REQUEST");
    expect(normalizePublicErrorCode("some-internal-marker", 429)).toBe("RATE_LIMITED");
    expect(normalizePublicErrorCode("some-internal-marker", 503)).toBe("SERVICE_UNAVAILABLE");
    expect(normalizePublicErrorCode(null, 418)).toBe("INTERNAL_ERROR");
  });

  it("keeps registered codes and known internal markers stable", () => {
    expect(normalizePublicErrorCode("NOT_FOUND", 404)).toBe("NOT_FOUND");
    expect(normalizePublicErrorCode("GONE", 410)).toBe("GONE");
    expect(normalizePublicErrorCode("PRECONDITION_FAILED", 412)).toBe("INVALID_REQUEST");
    expect(normalizePublicErrorCode("QUOTA", 429)).toBe("QUOTA_EXCEEDED");
    expect(normalizePublicErrorCode("quota", 429)).toBe("QUOTA_EXCEEDED");
  });

  it("falls back to a status code for unlisted statuses", () => {
    expect(publicErrorCodeForStatus(401)).toBe("UNAUTHORIZED");
    expect(publicErrorCodeForStatus(403)).toBe("FORBIDDEN");
    expect(publicErrorCodeForStatus(500)).toBe("INTERNAL_ERROR");
  });

  it("emits a short opaque reference that carries no identity", () => {
    const ref = createErrorRef();

    expect(ref).toMatch(/^err_[0-9a-f]{10}$/u);
    expect(ref).not.toContain("@");
  });
});

describe("public error body sanitizing", () => {
  it("replaces upstream text with a preset and adds a reference", () => {
    const body = sanitizePublicErrorBody(
      {
        error: "GitHub reader OAuth is not configured",
        code: "SERVICE_UNAVAILABLE",
      },
      503
    );

    expect(body).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      error: publicErrorMessage("SERVICE_UNAVAILABLE"),
    });
    expect(JSON.stringify(body)).not.toContain("OAuth");
    expect(body).toHaveProperty("errorRef", expect.stringMatching(/^err_[0-9a-f]{10}$/u));
  });

  it("strips structured debug fields from visitor payloads", () => {
    const body = sanitizePublicErrorBody(
      {
        error: "Validation failed",
        code: "BAD_REQUEST",
        details: [{ message: "too_small", path: ["limit"] }],
        zodError: { fieldErrors: {} },
        stack: "Error: Validation failed",
        path: "comments.list",
      },
      400
    );

    expect(body).toEqual({
      code: "INVALID_REQUEST",
      error: publicErrorMessage("INVALID_REQUEST"),
      errorRef: expect.stringMatching(/^err_[0-9a-f]{10}$/u),
    });
  });

  it("leaves successful bodies untouched", () => {
    const success = { comments: [], total: 0, error: null };

    expect(sanitizePublicErrorBody(success, 200)).toBe(success);
  });

  it("leaves non-error-shaped bodies untouched", () => {
    const payload = { ok: true };

    expect(sanitizePublicErrorBody(payload, 500)).toBe(payload);
  });

  it("builds the documented visitor shape", () => {
    const body = buildPublicErrorBody({ code: "FORBIDDEN", status: 403 });

    expect(body).toEqual({
      error: "当前账号没有执行该操作的权限。",
      code: "FORBIDDEN",
      errorRef: expect.stringMatching(/^err_[0-9a-f]{10}$/u),
    });
  });
});
