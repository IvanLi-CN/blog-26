import { afterEach, describe, expect, it } from "bun:test";
import { resolveRuntimeContext } from "@/lib/runtime-context";
import { withoutIdentity } from "../../../site/pages/api/[...path]";

afterEach(() => {
  delete process.env.PUBLIC_HOST;
  delete process.env.EDGEONE_PUBLIC_FALLBACK_SECRET;
  delete process.env.SSO_EMAIL_HEADER_NAME;
});

describe("runtime context", () => {
  it("treats the public host and its forwarded fallback as public", () => {
    process.env.PUBLIC_HOST = "ivanli.cc";
    expect(
      resolveRuntimeContext(
        new Request("https://console.ivanli.cc/memos", {
          headers: { host: "ivanli.cc" },
        })
      ).mode
    ).toBe("public");

    process.env.EDGEONE_PUBLIC_FALLBACK_SECRET = "edge-secret";
    const context = resolveRuntimeContext(
      new Request("https://console.ivanli.cc/memos", {
        headers: {
          host: "console.ivanli.cc",
          "x-edgeone-public-fallback": "edge-secret",
        },
      })
    );
    expect(context.mode).toBe("public");
    expect(context.isTrustedPublicFallback).toBe(true);
  });

  it("keeps the console host private", () => {
    process.env.PUBLIC_HOST = "ivanli.cc";
    process.env.EDGEONE_PUBLIC_FALLBACK_SECRET = "edge-secret";
    expect(
      resolveRuntimeContext(
        new Request("https://console.ivanli.cc/memos", {
          headers: {
            host: "console.ivanli.cc",
            "x-forwarded-host": "ivanli.cc",
            "x-edgeone-public-fallback": "wrong-secret",
          },
        })
      ).mode
    ).toBe("console");

    expect(
      resolveRuntimeContext(
        new Request("https://console.ivanli.cc/memos", {
          headers: {
            host: "console.ivanli.cc",
            "x-forwarded-host": "ivanli.cc",
            "x-edgeone-public-fallback": "edge-secret",
          },
        })
      ).mode
    ).toBe("public");
  });

  it("removes the configured SSO header from public API requests", () => {
    process.env.SSO_EMAIL_HEADER_NAME = "X-SSO-Email";
    const sanitized = withoutIdentity(
      new Request("https://ivanli.cc/api/health", {
        headers: {
          "x-sso-email": "admin@example.com",
          "remote-email": "admin@example.com",
          cookie: "session=private",
        },
      })
    );

    expect(sanitized.headers.get("x-sso-email")).toBeNull();
    expect(sanitized.headers.get("remote-email")).toBeNull();
    expect(sanitized.headers.get("cookie")).toBeNull();
  });
});
