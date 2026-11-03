import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../..");

test("Console mode is selected at build time and never injected at startup", async () => {
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const [astroConfig, consoleStart, dockerfile, entrypoint, preview] = await Promise.all([
    readFile(resolve(repoRoot, "astro.config.mjs"), "utf8"),
    readFile(resolve(repoRoot, "scripts/start-console.ts"), "utf8"),
    readFile(resolve(repoRoot, "Dockerfile"), "utf8"),
    readFile(resolve(repoRoot, "docker-entrypoint.sh"), "utf8"),
    readFile(resolve(repoRoot, "scripts/preview-web-demo.ts"), "utf8"),
  ]);
  const legacyRuntimeVariable = ["CONSOLE", "RUNTIME"].join("_");

  expect(packageJson.scripts?.["console:build"]).toContain("BLOG_BUILD_TARGET=console");
  expect(packageJson.scripts?.["console:start"]).toBe(
    "NODE_ENV=production bun scripts/start-console.ts"
  );
  expect(packageJson.scripts?.["web-demo:start"]).not.toContain("BLOG_BUILD_TARGET");
  expect(JSON.stringify(packageJson)).not.toContain(legacyRuntimeVariable);
  expect(astroConfig).toContain('const buildTarget = process.env.BLOG_BUILD_TARGET || "public";');
  expect(astroConfig).toContain('"process.env.BLOG_BUILD_TARGET"');
  expect(consoleStart).not.toContain("BLOG_BUILD_TARGET");
  expect(dockerfile).not.toContain(legacyRuntimeVariable);
  expect(entrypoint).not.toContain(legacyRuntimeVariable);
  expect(entrypoint).not.toContain("BLOG_BUILD_TARGET");
  expect(preview).not.toContain("BLOG_BUILD_TARGET");
});
