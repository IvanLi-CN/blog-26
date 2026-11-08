import { describe, expect, it } from "bun:test";
import { runBun } from "../../../tests/helpers/run-bun";
import { inferContentType } from "../../config/paths";
import {
  buildMemoAssetPath,
  buildMemoRelativePath,
  DEFAULT_LOCAL_MEMO_ROOT_PATH,
  getConfiguredClientLocalMemoRootPath,
  getMemoDraftPath,
  getMemoEditorContentSource,
  getMemoRootDir,
  isMemoContentPath,
  resolveClientMemoRootPath,
} from "../memo-paths";

describe("memo-paths", () => {
  it("uses the uppercase Memos root by default", () => {
    expect(DEFAULT_LOCAL_MEMO_ROOT_PATH).toBe("/Memos");
    expect(getMemoRootDir()).toBe("Memos");
    expect(getMemoDraftPath()).toBe("/Memos/__draft__.md");
    expect(buildMemoRelativePath("note.md")).toBe("Memos/note.md");
    expect(buildMemoAssetPath("inline.png")).toBe("Memos/assets/inline.png");
  });

  it("keeps custom memo roots configurable", () => {
    expect(getMemoRootDir("/memos")).toBe("memos");
    expect(buildMemoRelativePath("note.md", "/memos")).toBe("memos/note.md");
    expect(buildMemoAssetPath("inline.png", "/memos")).toBe("memos/assets/inline.png");
  });

  it("matches memo paths case-insensitively", () => {
    expect(isMemoContentPath("memos/test.md")).toBeTrue();
    expect(isMemoContentPath("Memos/test.md")).toBeTrue();
    expect(isMemoContentPath("/Memos/test.md")).toBeTrue();
    expect(isMemoContentPath("blog/test.md")).toBeFalse();
  });

  it("infers memo content type for uppercase relative paths", () => {
    expect(inferContentType("Memos/test.md")).toBe("memo");
    expect(inferContentType("/Memos/test.md")).toBe("memo");
  });

  it("rejects invalid PUBLIC_LOCAL_MEMOS_PATH values in the strict client getter", async () => {
    expect(() => getConfiguredClientLocalMemoRootPath()).not.toThrow();

    const result = await runBun([
      "-e",
      'process.env.PUBLIC_LOCAL_MEMOS_PATH="../outside"; try { const mod = await import("./src/lib/memo-paths.ts?client-strict-env-test"); console.log(mod.getConfiguredClientLocalMemoRootPath()); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("memo 根目录不能包含");
  });

  it("falls back to the default client memo root when local source is disabled", async () => {
    expect(
      resolveClientMemoRootPath({
        localSourceEnabled: false,
        memoRoot: "/memos",
      })
    ).toBe("/Memos");

    const result = await runBun([
      "-e",
      'process.env.PUBLIC_LOCAL_MEMOS_PATH="/memos"; const mod = await import("./src/lib/memo-paths.ts?client-disabled-fallback-test"); console.log(mod.resolveClientMemoRootPath({ localSourceEnabled: false }));',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("/Memos");
  });

  it("keeps strict validation when local source stays enabled", async () => {
    const result = await runBun([
      "-e",
      'process.env.PUBLIC_LOCAL_MEMOS_PATH="../outside"; try { const mod = await import("./src/lib/memo-paths.ts?client-enabled-fallback-test"); console.log(mod.resolveClientMemoRootPath({ localSourceEnabled: true })); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("memo 根目录不能包含");
  });

  it("keeps memo editor uploads on local", () => {
    expect(getMemoEditorContentSource(true)).toBe("local");
    expect(getMemoEditorContentSource(false)).toBe("local");
  });

  it("uses PUBLIC_LOCAL_MEMOS_PATH for client-safe overrides", async () => {
    const result = await runBun([
      "-e",
      'process.env.PUBLIC_LOCAL_MEMOS_PATH="/memos"; const mod = await import("./src/lib/memo-paths.ts?public-env-test"); console.log(JSON.stringify({ root: mod.DEFAULT_LOCAL_MEMO_ROOT_PATH }));',
    ]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ root: "/memos" });
  });

  it("uses LOCAL_MEMOS_PATH for server-side helpers", async () => {
    const result = await runBun([
      "-e",
      'process.env.LOCAL_MEMOS_PATH="/memos"; const mod = await import("./src/lib/memo-paths.ts?server-env-test"); console.log(JSON.stringify({ root: mod.getServerLocalMemoRootPath(), dir: mod.getServerLocalMemoRootDir() }));',
    ]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ root: "/memos", dir: "memos" });
  });

  it("normalizes slashless LOCAL_MEMOS_PATH values", async () => {
    const result = await runBun([
      "-e",
      'process.env.LOCAL_MEMOS_PATH="Memos"; const mod = await import("./src/lib/memo-paths.ts?server-slashless-env-test"); console.log(JSON.stringify({ root: mod.getServerLocalMemoRootPath(), dir: mod.getServerLocalMemoRootDir() }));',
    ]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ root: "/Memos", dir: "Memos" });
  });

  it("normalizes slashless LOCAL_MEMOS_PATH values when config paths are imported", async () => {
    const result = await runBun([
      "-e",
      'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_MEMOS_PATH="Memos"; try { const mod = await import("./src/config/paths.ts?slashless-memo-config-test"); console.log(JSON.stringify({ memos: mod.LOCAL_PATHS.memos })); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ memos: ["/Memos"] });
  });

  it("keeps shared config path parsing strict for non-memo envs", async () => {
    const result = await runBun([
      "-e",
      'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_BLOG_PATH="../outside"; try { await import("./src/config/paths.ts?strict-path-test"); console.log("unexpected-success"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("路径必须以 '/' 开头");
  });

  it("rejects memo roots with dot segments", async () => {
    const result = await runBun([
      "-e",
      'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_MEMOS_PATH="../outside"; process.env.PUBLIC_LOCAL_MEMOS_PATH="../outside"; try { await import("./src/config/paths.ts?invalid-memo-root-test"); console.log("unexpected-success"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("memo 根目录不能包含");
  });

  it("rejects invalid client memo roots during local-only config validation", async () => {
    const result = await runBun([
      "-e",
      'process.env.CONTENT_SOURCES="local"; process.env.LOCAL_CONTENT_BASE_PATH="http://localhost:1"; process.env.PUBLIC_LOCAL_MEMOS_PATH="../outside"; try { await import("./src/config/paths.ts?disabled-local-memo-root-test"); console.log("ok"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("memo 根目录不能包含");
  });

  it("rejects invalid local path envs during local-only config validation", async () => {
    const result = await runBun([
      "-e",
      'process.env.CONTENT_SOURCES="local"; process.env.LOCAL_CONTENT_BASE_PATH="http://localhost:1"; process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_BLOG_PATH="blog"; try { await import("./src/config/paths.ts?disabled-local-path-test"); console.log("ok"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("路径必须以 '/' 开头");
  });

  it("accepts valid local path envs when local parsing continues", async () => {
    const result = await runBun([
      "-e",
      'process.env.CONTENT_SOURCES="local"; process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_BLOG_PATH="/blog"; try { await import("./src/config/paths.ts?local-path-test"); console.log("ok"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  it("falls back to local content when CONTENT_SOURCES has no supported values", async () => {
    const result = await runBun([
      "-e",
      'process.env.CONTENT_SOURCES="webdav"; process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; const mod = await import("./src/config/paths.ts?unsupported-source-fallback-test"); console.log(JSON.stringify({ enabled: mod.isLocalContentEnabled(), sources: mod.SYSTEM_CONFIG.supportedSources }));',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"enabled":true');
    expect(result.stdout).toContain('"local"');
  });

  it("uses the first LOCAL_MEMOS_PATH entry for server-side helpers", async () => {
    const result = await runBun([
      "-e",
      'process.env.LOCAL_MEMOS_PATH="/memos,/Memos"; const mod = await import("./src/lib/memo-paths.ts?server-multi-env-test"); console.log(JSON.stringify({ root: mod.getServerLocalMemoRootPath(), dir: mod.getServerLocalMemoRootDir() }));',
    ]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ root: "/memos", dir: "memos" });
  });

  it("treats normalized memo roots as equivalent during config validation", async () => {
    const result = await runBun([
      "-e",
      'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_MEMOS_PATH="/Memos/"; try { await import("./src/config/paths.ts?memo-root-normalized-test"); console.log("ok"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  it("fails fast when client and server memo roots diverge", async () => {
    const result = await runBun([
      "-e",
      'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_MEMOS_PATH="/memos"; try { await import("./src/config/paths.ts?memo-root-mismatch-test"); console.log("unexpected-success"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("LOCAL_MEMOS_PATH");
    expect(result.stderr).toContain("PUBLIC_LOCAL_MEMOS_PATH");
  });
});
