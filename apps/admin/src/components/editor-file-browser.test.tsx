import { afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { FileItem } from "@/lib/admin-api-client";
import {
  canCreateInTreePath,
  canTriggerInlineRename,
  EditorFileBrowser,
  getConfiguredRootForPath,
  getConfiguredRootPathSet,
  isConfiguredRootPath,
  isSameConfiguredRootDestination,
  normalizePendingStates,
  selectionContainsConfiguredRoot,
  type TreeRenameTarget,
  type TreeSelection,
} from "./editor-file-browser";

GlobalRegistrator.register();

const noop = () => {
  // Test double for side-effect callbacks.
};

mock.module("~/components/admin-toast", () => ({
  dismissAdminToast: noop,
  showAdminToast: () => "toast-id",
}));

mock.module("~/components/app-shell", () => ({
  useAppShellSidebarFloatingFooter: noop,
}));

const ROOT_ITEMS: FileItem[] = [
  { name: "blog", path: "blog", type: "directory" },
  { name: "Hardware", path: "Hardware", type: "directory" },
  { name: "README.md", path: "README.md", type: "file", extension: "md" },
];

function selection(path: string, type: TreeSelection["type"] = "file"): TreeSelection {
  return { source: "local", path, type };
}

afterEach(() => {
  cleanup();
});

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

  test("disallows creating entries at the configured-roots landing view", () => {
    const roots = getConfiguredRootPathSet(ROOT_ITEMS);

    expect(canCreateInTreePath("", roots)).toBe(false);
  });

  test("allows creating entries inside a configured root", () => {
    const roots = getConfiguredRootPathSet(ROOT_ITEMS);

    expect(canCreateInTreePath("blog", roots)).toBe(true);
    expect(canCreateInTreePath("blog/archive", roots)).toBe(true);
  });
});

describe("editor file browser pending helpers", () => {
  test("normalizes pending states by path and keeps the latest operation", () => {
    const normalized = normalizePendingStates([
      { path: "/blog/post.md/", operation: "copy" },
      { path: "blog/post.md", operation: "rename" },
      { path: "", operation: "delete" },
    ]);

    expect([...normalized.values()]).toEqual([
      {
        path: "blog/post.md",
        operation: "rename",
      },
    ]);
  });

  test("only allows keyboard inline rename when a target exists and nothing is already editing", () => {
    const target = selection("blog/post.md");
    const editingTarget: TreeRenameTarget = {
      ...target,
      parentPath: "blog",
      value: "post.md",
    };
    const editingTargetWithError: TreeRenameTarget = {
      ...editingTarget,
      errorMessage: "目标已存在",
    };

    expect(canTriggerInlineRename(target, null)).toBe(true);
    expect(canTriggerInlineRename(target, editingTarget)).toBe(false);
    expect(canTriggerInlineRename(target, editingTargetWithError)).toBe(false);
    expect(canTriggerInlineRename(null, null)).toBe(false);
  });
});

describe("EditorFileBrowser pending menu guards", () => {
  test("does not open the row context menu for pending entries", () => {
    const onMoveEntries = async () => undefined;
    const onCopyEntries = async () => undefined;
    const onDeleteEntries = async () => undefined;
    const { getByRole, queryByRole } = render(
      <EditorFileBrowser
        selectedSource="local"
        browserPath="blog"
        onNavigateUp={noop}
        onRefresh={noop}
        sourcesLoading={false}
        treeLoading={false}
        rootItems={[{ name: "blog", path: "blog", type: "directory" }]}
        directoryItemsByPath={{
          blog: [{ name: "post.md", path: "blog/post.md", type: "file", extension: "md" }],
        }}
        loadingPaths={[]}
        expandedPaths={["blog"]}
        selectionOverride={null}
        onSelectionOverrideApplied={noop}
        activeItemPath={null}
        activeItemType={null}
        activeItemSource={null}
        editingItem={null}
        pendingStates={[{ path: "blog/post.md", operation: "rename" }]}
        onEditingValueChange={noop}
        onEditingCommit={noop}
        onEditingCancel={noop}
        onDirectoryExpand={noop}
        onFileOpen={noop}
        onFilePermanentOpen={noop}
        onCreateFile={noop}
        onCreateDirectory={noop}
        onStartRename={noop}
        onMoveEntries={onMoveEntries}
        onCopyEntries={onCopyEntries}
        onDeleteEntries={onDeleteEntries}
      />
    );

    const rowButton = getByRole("button", { name: "post.md" });
    fireEvent.contextMenu(rowButton);

    expect(queryByRole("menuitem", { name: "重命名" })).toBeNull();
  });
});
