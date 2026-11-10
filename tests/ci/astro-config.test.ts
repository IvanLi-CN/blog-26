import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const astroConfigPath = path.resolve(process.cwd(), "astro.config.mjs");
const astroConfig = readFileSync(astroConfigPath, "utf8");

describe("astro.config.mjs", () => {
  test("defines the public API base URL for runtime fallback builds", () => {
    expect(astroConfig).toContain('"process.env.PUBLIC_API_BASE_URL"');
    expect(astroConfig).toContain('JSON.stringify(process.env.PUBLIC_API_BASE_URL ?? "")');
  });

  test("delegates cross-origin API origin checks to the public API router", () => {
    expect(astroConfig).toContain("security:");
    expect(astroConfig).toContain("checkOrigin: false");
  });

  test("keeps an application origin gate for console API mutations", () => {
    const middleware = readFileSync(path.resolve(process.cwd(), "site/middleware.ts"), "utf8");
    expect(middleware).toContain("hasTrustedPublicOrigin");
    expect(middleware).toContain('url.pathname.startsWith("/api/")');
    expect(middleware).toContain('!["GET", "HEAD", "OPTIONS"].includes(request.method)');
  });
});
