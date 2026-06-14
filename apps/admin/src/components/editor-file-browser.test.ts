import { describe, expect, test } from "bun:test";
import type { FileItem } from "@/lib/admin-api-client";
import {
  getConfiguredRootForPath,
  getConfiguredRootPathSet,
  isConfiguredRootPath,
  isSameConfiguredRootDestination,
  selectionContainsConfiguredRoot,
  type TreeSelection,
} from "./editor-file-browser";

const ROOT_ITEMS: FileItem[] = [
  { name: "blog", path: "blog", type: "directory" },
  { name: "Hardware", path: "Hardware", type: "directory" },
  { name: "README.md", path: "README.md", type: "file", extension: "md" },
];

function selection(path: string, type: TreeSelection["type"] = "file"): TreeSelection {
  return { source: "local", path, type };
}

describe("editor file browser configured roots", () => {
  test("derives configured roots from top-level directory items only", () => {
    const roots = getConfiguredRootPathSet(ROOT_ITEMS);

    expect([...roots].sort()).toEqual(["Hardware", "blog"]);
    expect(isConfiguredRootPath("blog", roots)).toBe(true);
    expect(isConfiguredRootPath("blog/post.md", roots)).toBe(false);
    expect(isConfiguredRootPath("README.md", roots)).toBe(false);
  });

  test("matches nested paths to the nearest configured root", () => {
    const roots = getConfiguredRootPathSet(ROOT_ITEMS);

    expect(getConfiguredRootForPath("blog/archive/post.md", roots)).toBe("blog");
    expect(getConfiguredRootForPath("Hardware/guides/setup.md", roots)).toBe("Hardware");
    expect(getConfiguredRootForPath("", roots)).toBeNull();
    expect(getConfiguredRootForPath("unknown/post.md", roots)).toBeNull();
  });

  test("detects selections that include configured root directories", () => {
    const roots = getConfiguredRootPathSet(ROOT_ITEMS);

    expect(selectionContainsConfiguredRoot([selection("blog", "directory")], roots)).toBe(true);
    expect(selectionContainsConfiguredRoot([selection("blog/post.md")], roots)).toBe(false);
  });

  test("allows move destinations only inside the same configured root", () => {
    const roots = getConfiguredRootPathSet(ROOT_ITEMS);

    expect(
      isSameConfiguredRootDestination(
        [selection("blog/post.md"), selection("blog/assets/cover.png")],
        "blog/archive",
        roots
      )
    ).toBe(true);
    expect(isSameConfiguredRootDestination([selection("blog/post.md")], "Hardware", roots)).toBe(
      false
    );
    expect(isSameConfiguredRootDestination([selection("blog/post.md")], "", roots)).toBe(false);
  });
});
