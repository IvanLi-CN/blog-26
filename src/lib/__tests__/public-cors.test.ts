import { describe, expect, it } from "bun:test";
import {
  appendPublicCorsHeaders,
  createPublicCorsPreflightResponse,
  resolveRequestOrigin,
} from "@/lib/public-cors";
import { createSessionCookieHeader } from "@/lib/session-cookie";

describe("public-cors helpers", () => {
  it("allows configured public frontend origins", async () => {
    process.env.PUBLIC_SITE_URL = "https://pages.example.test";
    const request = new Request("https://api.example.test/api/public/posts", {
      headers: {
        origin: "https://pages.example.test",
        "access-control-request-headers": "content-type",
      },
    });

    const headers = appendPublicCorsHeaders(new Headers(), request, ["GET", "POST", "OPTIONS"]);
    expect(headers.get("access-control-allow-origin")).toBe("https://pages.example.test");
    expect(headers.get("access-control-allow-credentials")).toBe("true");
    expect(headers.get("vary")).toContain("Origin");

    const preflight = createPublicCorsPreflightResponse(request, ["GET", "POST", "OPTIONS"]);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://pages.example.test");
  });

  it("rejects unrelated cross-origin requests", () => {
    process.env.PUBLIC_SITE_URL = "https://pages.example.test";
    const request = new Request("https://api.example.test/api/public/posts", {
      headers: {
        origin: "https://evil.example.test",
      },
    });

    const headers = appendPublicCorsHeaders(new Headers(), request, ["GET"]);
    expect(headers.get("access-control-allow-origin")).toBeNull();
    expect(createPublicCorsPreflightResponse(request, ["GET"]).status).toBe(403);
  });

  it("derives request origin from trusted forwarded headers only", () => {
    process.env.TRUST_PROXY_FORWARD_HEADERS = "true";
    const request = new Request("http://127.0.0.1/api/public/posts", {
      headers: {
        "x-forwarded-host": "api.example.test",
        "x-forwarded-proto": "https",
      },
    });

    expect(resolveRequestOrigin(request)).toBe("https://api.example.test");
  });

  it("ignores forwarded headers unless trusted proxy mode is enabled", () => {
    delete process.env.TRUST_PROXY_FORWARD_HEADERS;
    const request = new Request("http://127.0.0.1/api/public/posts", {
      headers: {
        "x-forwarded-host": "api.example.test",
        "x-forwarded-proto": "https",
      },
    });

    expect(resolveRequestOrigin(request)).toBe("http://127.0.0.1");
  });
});

describe("session-cookie helper", () => {
  it("uses SameSite=None; Secure for cross-site requests", () => {
    const request = new Request("https://api.example.test/api/public/auth/me", {
      headers: {
        origin: "https://pages.example.test",
      },
    });

    const cookie = createSessionCookieHeader(request, "blog_session", {
      value: "session-123",
      maxAge: 3600,
    });

    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
  });

  it("keeps SameSite=Lax for same-origin requests", () => {
    const request = new Request("http://localhost:25090/api/public/auth/me", {
      headers: {
        origin: "http://localhost:25090",
      },
    });

    const cookie = createSessionCookieHeader(request, "blog_session", {
      value: "session-123",
      maxAge: 3600,
    });

    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });
});
