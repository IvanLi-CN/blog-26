import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { inferContentType } from "../../config/paths";
import { resolveImagePathLegacy } from "../image-utils";
import {
  buildMemoAssetPath,
  buildMemoRelativePath,
  DEFAULT_LOCAL_MEMO_ROOT_PATH,
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

  it("falls back to LOCAL_MEMOS_PATH when no public override is provided", () => {
    const result = spawnSync(
      "bun",
      [
        "-e",
        'process.env.LOCAL_MEMOS_PATH="/memos"; const mod = await import("./src/lib/memo-paths.ts?local-env-test"); console.log(JSON.stringify({ root: mod.DEFAULT_LOCAL_MEMO_ROOT_PATH }));',
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ root: "/memos" });
  });

  it("maps legacy memo routes to the configured local memo root", () => {
    expect(resolveImagePathLegacy("./assets/image.png", "/memos/test-note")).toBe(
      "/api/files/local/Memos/assets/image.png"
    );
  });
});
