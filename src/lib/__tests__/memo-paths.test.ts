import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { inferContentType } from "../../config/paths";
import { resolveImagePathLegacy } from "../image-utils";
import {
  buildMemoAssetPath,
  buildMemoRelativePath,
  DEFAULT_LOCAL_MEMO_ROOT_PATH,
  getConfiguredClientLocalMemoRootPath,
  getMemoDraftPath,
  getMemoRootDir,
  isMemoContentPath,
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

  it("rejects invalid NEXT_PUBLIC_LOCAL_MEMOS_PATH values in the strict client getter", () => {
    expect(() => getConfiguredClientLocalMemoRootPath()).not.toThrow();

    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.NEXT_PUBLIC_LOCAL_MEMOS_PATH="../outside"; try { const mod = await import("./src/lib/memo-paths.ts?client-strict-env-test"); console.log(mod.getConfiguredClientLocalMemoRootPath()); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("memo 根目录不能包含");
  });

  it("uses NEXT_PUBLIC_LOCAL_MEMOS_PATH for client-safe overrides", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.NEXT_PUBLIC_LOCAL_MEMOS_PATH="/memos"; const mod = await import("./src/lib/memo-paths.ts?public-env-test"); console.log(JSON.stringify({ root: mod.DEFAULT_LOCAL_MEMO_ROOT_PATH }));',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ root: "/memos" });
  });

  it("uses LOCAL_MEMOS_PATH for server-side helpers", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.LOCAL_MEMOS_PATH="/memos"; const mod = await import("./src/lib/memo-paths.ts?server-env-test"); console.log(JSON.stringify({ root: mod.getServerLocalMemoRootPath(), dir: mod.getServerLocalMemoRootDir() }));',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ root: "/memos", dir: "memos" });
  });

  it("normalizes slashless LOCAL_MEMOS_PATH values", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.LOCAL_MEMOS_PATH="Memos"; const mod = await import("./src/lib/memo-paths.ts?server-slashless-env-test"); console.log(JSON.stringify({ root: mod.getServerLocalMemoRootPath(), dir: mod.getServerLocalMemoRootDir() }));',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ root: "/Memos", dir: "Memos" });
  });

  it("normalizes slashless LOCAL_MEMOS_PATH values when config paths are imported", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_MEMOS_PATH="Memos"; try { const mod = await import("./src/config/paths.ts?slashless-memo-config-test"); console.log(JSON.stringify({ memos: mod.LOCAL_PATHS.memos })); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ memos: ["/Memos"] });
  });

  it("keeps shared config path parsing strict for non-memo envs", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_BLOG_PATH="../outside"; try { await import("./src/config/paths.ts?strict-path-test"); console.log("unexpected-success"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("路径必须以 '/' 开头");
  });

  it("rejects memo roots with dot segments", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_MEMOS_PATH="../outside"; process.env.NEXT_PUBLIC_LOCAL_MEMOS_PATH="../outside"; try { await import("./src/config/paths.ts?invalid-memo-root-test"); console.log("unexpected-success"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("memo 根目录不能包含");
  });

  it("ignores invalid client memo roots when the local source is disabled", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.CONTENT_SOURCES="webdav"; process.env.WEBDAV_URL="http://localhost:1"; process.env.NEXT_PUBLIC_LOCAL_MEMOS_PATH="../outside"; try { await import("./src/config/paths.ts?disabled-local-memo-root-test"); console.log("ok"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  it("ignores invalid local path envs when the local source is disabled", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.CONTENT_SOURCES="webdav"; process.env.WEBDAV_URL="http://localhost:1"; process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_BLOG_PATH="blog"; try { await import("./src/config/paths.ts?disabled-local-path-test"); console.log("ok"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  it("ignores invalid webdav path envs when the webdav source is disabled", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.CONTENT_SOURCES="local"; process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.WEBDAV_BLOG_PATH="blog"; try { await import("./src/config/paths.ts?disabled-webdav-path-test"); console.log("ok"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  it("uses the first LOCAL_MEMOS_PATH entry for server-side helpers", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.LOCAL_MEMOS_PATH="/memos,/Memos"; const mod = await import("./src/lib/memo-paths.ts?server-multi-env-test"); console.log(JSON.stringify({ root: mod.getServerLocalMemoRootPath(), dir: mod.getServerLocalMemoRootDir() }));',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ root: "/memos", dir: "memos" });
  });

  it("treats normalized memo roots as equivalent during config validation", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_MEMOS_PATH="/Memos/"; try { await import("./src/config/paths.ts?memo-root-normalized-test"); console.log("ok"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  it("fails fast when client and server memo roots diverge", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.LOCAL_CONTENT_BASE_PATH="./tmp/local"; process.env.LOCAL_MEMOS_PATH="/memos"; try { await import("./src/config/paths.ts?memo-root-mismatch-test"); console.log("unexpected-success"); process.exit(0); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("LOCAL_MEMOS_PATH");
    expect(result.stderr).toContain("NEXT_PUBLIC_LOCAL_MEMOS_PATH");
  });

  it("maps legacy memo routes to the configured local memo root", () => {
    expect(resolveImagePathLegacy("./assets/image.png", "/memos/test-note")).toBe(
      "/api/files/local/Memos/assets/image.png"
    );
  });
});
