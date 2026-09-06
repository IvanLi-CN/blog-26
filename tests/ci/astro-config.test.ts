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
});
