import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildSharedArtifactEnv,
  buildSingleProjectEnv,
  getProjectTestArgs,
  prepareProjectRuntime,
} from "../../scripts/run-e2e";
import { E2E_GATEWAY_BIND_HOST } from "../e2e/runtime";

describe("run-e2e single-project env", () => {
  it("lets Playwright derive the internal source URL from the selected web port by default", () => {
    const env = buildSingleProjectEnv("guest", {
      PATH: process.env.PATH,
      WEB_PORT: "26110",
    });

    expect(env.PLAYWRIGHT_TEST_PROJECT).toBe("guest");
    expect(env.BIND_HOST).toBe(E2E_GATEWAY_BIND_HOST);
    expect(env.WEB_PORT).toBe("26110");
    expect(env.PUBLIC_MEDIA_IMAGOR_BASE_URL).toBeUndefined();
    expect(env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL).toBeUndefined();
  });

  it("preserves explicit public media overrides when the caller provides them", () => {
    const env = buildSingleProjectEnv("admin", {
      PATH: process.env.PATH,
      PUBLIC_MEDIA_IMAGOR_BASE_URL: " http://127.0.0.1:18123 ",
      PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL: " http://host.docker.internal:26110 ",
    });

    expect(env.PLAYWRIGHT_TEST_PROJECT).toBe("admin");
    expect(env.PUBLIC_MEDIA_IMAGOR_BASE_URL).toBe("http://127.0.0.1:18123");
    expect(env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL).toBe("http://host.docker.internal:26110");
  });
});

describe("CI shard runtime isolation", () => {
  it("selects complete disjoint test sets through the production Playwright argument builder", () => {
    function discover(project: "guest" | "admin", shard?: { index: number; total: number }) {
      const result = spawnSync(
        process.execPath,
        ["x", "playwright", ...getProjectTestArgs(project, shard, ["--list", "--reporter=json"])],
        { cwd: join(import.meta.dir, "../.."), encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
      );
      expect(result.status, result.stderr).toBe(0);
      const ids = new Set<string>();
      function visit(suite: {
        specs?: Array<{ id: string }>;
        suites?: Parameters<typeof visit>[0][];
      }) {
        for (const spec of suite.specs ?? []) ids.add(spec.id);
        for (const child of suite.suites ?? []) visit(child);
      }
      for (const suite of JSON.parse(result.stdout).suites) visit(suite);
      return ids;
    }
    for (const project of ["guest", "admin"] as const) {
      const full = discover(project);
      const a = discover(project, { index: 1, total: 2 });
      const b = discover(project, { index: 2, total: 2 });
      expect(a.size).toBeGreaterThan(0);
      expect(b.size).toBeGreaterThan(0);
      expect([...a].filter((id) => b.has(id))).toEqual([]);
      expect(new Set([...a, ...b])).toEqual(full);
    }
  }, 60_000);

  it("builds browser API resolution that follows each shard origin", async () => {
    const root = await mkdtemp(join(tmpdir(), "blog-e2e-origin-"));
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    try {
      const env = buildSharedArtifactEnv("guest");
      const result = await Bun.build({
        entrypoints: [join(import.meta.dir, "../../src/lib/public-runtime-url.ts")],
        target: "browser",
        outdir: root,
        define: {
          "import.meta.env": JSON.stringify({ PUBLIC_API_BASE_URL: env.PUBLIC_API_BASE_URL }),
          "process.env.PUBLIC_API_BASE_URL": JSON.stringify(env.PUBLIC_API_BASE_URL),
        },
      });
      expect(result.success).toBe(true);
      const runtime = await import(pathToFileURL(result.outputs[0].path).href);
      for (const port of [25190, 25200]) {
        const origin = `http://localhost:${port}`;
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: { location: { origin } },
        });
        expect(runtime.toPublicApiUrl("/api/public/memos")).toBe(`${origin}/api/public/memos`);
      }
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
      await rm(root, { recursive: true, force: true });
    }
  });

  it("copies independent writable inputs and reserves distinct service ports", async () => {
    const root = await mkdtemp(join(tmpdir(), "blog-e2e-shards-"));
    try {
      const source = { dbPath: join(root, "source.db"), localContentPath: join(root, "source") };
      await mkdir(source.localContentPath);
      await writeFile(source.dbPath, "seed database bytes");
      await writeFile(join(source.localContentPath, "post.md"), "seed content");
      const [a, b] = await Promise.all([
        prepareProjectRuntime(join(root, "runtimes"), "guest", 0, { index: 1, total: 2 }, source),
        prepareProjectRuntime(join(root, "runtimes"), "guest", 1, { index: 2, total: 2 }, source),
      ]);
      const ports = [a, b].flatMap((r) => [r.port, r.sitePort, r.adminPort, r.publicMediaPort]);
      expect(new Set(ports).size).toBe(8);
      expect(a.dbPath).not.toBe(b.dbPath);
      await writeFile(a.dbPath, "mutated shard");
      await writeFile(join(a.localContentPath, "post.md"), "mutated content");
      expect(await readFile(b.dbPath, "utf8")).toBe("seed database bytes");
      expect(await readFile(source.dbPath, "utf8")).toBe("seed database bytes");
      expect(await readFile(join(b.localContentPath, "post.md"), "utf8")).toBe("seed content");
      expect(await readFile(join(source.localContentPath, "post.md"), "utf8")).toBe("seed content");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("MCP backend-only startup", () => {
  it("keeps database reset and the production gateway without frontend builds or a media sidecar", () => {
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        'import config from "./playwright.config"; console.log(JSON.stringify(config.webServer));',
      ],
      {
        cwd: join(import.meta.dir, "../.."),
        encoding: "utf8",
        env: {
          ...process.env,
          PLAYWRIGHT_TEST_PROJECT: "mcp",
          PLAYWRIGHT_DISABLE_WEBSERVER: "0",
          PLAYWRIGHT_SKIP_RESET: "0",
          PLAYWRIGHT_SKIP_BUILD: "0",
          // Even an explicit media URL must not enable the unused sidecar.
          PLAYWRIGHT_START_PUBLIC_MEDIA_SIDECAR: "1",
          PUBLIC_MEDIA_IMAGOR_BASE_URL: "http://127.0.0.1:18000",
        },
      }
    );
    expect(result.status, result.stderr).toBe(0);
    const servers = JSON.parse(result.stdout);
    expect(servers).toHaveLength(1);
    expect(servers[0].command).toContain("test-env:reset-fs-only");
    expect(servers[0].command).toContain("gateway:start");
    expect(servers[0].command).not.toContain("console:start");
    expect(servers[0].command).not.toContain("bun run build");
    expect(new URL(servers[0].url).pathname).toBe("/api/version");
  });
});
