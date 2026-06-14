import { describe, expect, test } from "bun:test";
import {
  getSelectionRevealPaths,
  mapBatchResultsToTreeSelection,
  remapActiveTabIdForPathChange,
  remapBrowserPathForPathChange,
  remapTabPath,
  resolveActiveTabIdAfterTreeDelete,
  resolveBrowserPathAfterTreeDelete,
  shouldMarkLiveEditorContentDirty,
} from "./editor";

describe("editor batch selection mapping", () => {
  test("maps pasted batch results to the new tree selection set", () => {
    expect(
      mapBatchResultsToTreeSelection("local", [
        {
          path: "blog/01-react-hooks-deep-dive.md",
          nextPath: "blog/archive/01-react-hooks-deep-dive.md",
          type: "file",
        },
        {
          path: "blog/02-typescript-advanced-types.md",
          nextPath: "blog/archive/02-typescript-advanced-types.md",
          type: "file",
        },
      ])
    ).toEqual([
      {
        source: "local",
        path: "blog/archive/01-react-hooks-deep-dive.md",
        type: "file",
      },
      {
        source: "local",
        path: "blog/archive/02-typescript-advanced-types.md",
        type: "file",
      },
    ]);
  });

  test("expands destination ancestors before applying moved or copied selection", () => {
    expect(
      getSelectionRevealPaths([
        {
          source: "local",
          path: "blog/archive/2024/post.md",
          type: "file",
        },
        {
          source: "local",
          path: "blog/archive/2024/assets",
          type: "directory",
        },
      ])
    ).toEqual(["blog", "blog/archive", "blog/archive/2024"]);
  });
});

describe("editor tab path remapping", () => {
  test("marks live editor content dirty when it diverges from persisted tab state", () => {
    expect(shouldMarkLiveEditorContentDirty("changed", "original")).toBeTrue();
    expect(shouldMarkLiveEditorContentDirty("same", "same")).toBeFalse();
  });

  test("can preserve clean-tab state while syncing serialized editor content", () => {
    expect(
      shouldMarkLiveEditorContentDirty("normalized content", "persisted content", {
        preserveCurrentDirtyState: true,
      })
    ).toBeFalse();
  });

  test("rebases open markdown tab content when moving or renaming the file", () => {
    const tab = remapTabPath(
      {
        id: "file:local:blog/drafts/post.md",
        label: "post.md",
        kind: "file",
        mode: "wysiwyg",
        dirty: false,
        file: {
          source: "local",
          path: "blog/drafts/post.md",
          content:
            "---\nimage: ./assets/cover.png\n---\n\n![cover](./assets/cover.png)\n![absolute](/blog/drafts/assets/absolute.png)\n[feed](/feed.xml)",
        },
      },
      "local",
      "blog/drafts/post.md",
      "blog/archive/post.md"
    );

    expect(tab).toMatchObject({
      id: "file:local:blog/archive/post.md",
      file: {
        path: "blog/archive/post.md",
        content:
          "---\nimage: ../drafts/assets/cover.png\n---\n\n![cover](../drafts/assets/cover.png)\n![absolute](../drafts/assets/absolute.png)\n[feed](/feed.xml)",
      },
    });
  });

  test("rebases open MDX tab content when moving or renaming the file", () => {
    const tab = remapTabPath(
      {
        id: "file:local:blog/drafts/post.mdx",
        label: "post.mdx",
        kind: "file",
        mode: "wysiwyg",
        dirty: false,
        file: {
          source: "local",
          path: "blog/drafts/post.mdx",
          content: "---\nimage: ./assets/cover.png\n---\n\n![cover](./assets/cover.png)",
        },
      },
      "local",
      "blog/drafts/post.mdx",
      "blog/archive/post.mdx"
    );

    expect(tab).toMatchObject({
      id: "file:local:blog/archive/post.mdx",
      file: {
        path: "blog/archive/post.mdx",
        content:
          "---\nimage: ../drafts/assets/cover.png\n---\n\n![cover](../drafts/assets/cover.png)",
      },
    });
  });

  test("rebases open markdown tab references when moving or renaming linked assets", () => {
    const tab = remapTabPath(
      {
        id: "file:local:blog/post.md",
        label: "post.md",
        kind: "file",
        mode: "wysiwyg",
        dirty: true,
        file: {
          source: "local",
          path: "blog/post.md",
          content: "---\nimage: ./assets/cover.png\n---\n\n![cover](./assets/cover.png)",
        },
      },
      "local",
      "blog/assets/cover.png",
      "blog/archive/cover.png"
    );

    expect(tab).toMatchObject({
      id: "file:local:blog/post.md",
      dirty: true,
      file: {
        path: "blog/post.md",
        content: "---\nimage: ./archive/cover.png\n---\n\n![cover](./archive/cover.png)",
      },
    });
  });

  test("rebases open MDX tab references when moving or renaming linked assets", () => {
    const tab = remapTabPath(
      {
        id: "file:local:blog/post.mdx",
        label: "post.mdx",
        kind: "file",
        mode: "wysiwyg",
        dirty: true,
        file: {
          source: "local",
          path: "blog/post.mdx",
          content: "---\nimage: ./assets/cover.png\n---\n\n![cover](./assets/cover.png)",
        },
      },
      "local",
      "blog/assets/cover.png",
      "blog/archive/cover.png"
    );

    expect(tab).toMatchObject({
      id: "file:local:blog/post.mdx",
      dirty: true,
      file: {
        path: "blog/post.mdx",
        content: "---\nimage: ./archive/cover.png\n---\n\n![cover](./archive/cover.png)",
      },
    });
  });

  test("updates database-backed tab identity when moving or renaming its local file", () => {
    const tab = remapTabPath(
      {
        id: "post:blog/drafts/post.md",
        label: "Draft Post",
        kind: "database",
        mode: "wysiwyg",
        dirty: false,
        database: {
          postId: "blog/drafts/post.md",
          slug: "draft-post",
          title: "Draft Post",
          excerpt: "",
          content: "---\nslug: draft-post\n---\n\n# Draft Post\n\n![cover](./assets/cover.png)",
          draft: false,
          public: true,
          source: "local",
          filePath: "blog/drafts/post.md",
        },
      },
      "local",
      "blog/drafts/post.md",
      "blog/archive/post.md"
    );

    expect(tab).toMatchObject({
      id: "post:blog/archive/post.md",
      database: {
        postId: "blog/archive/post.md",
        filePath: "blog/archive/post.md",
        content:
          "---\nslug: draft-post\n---\n\n# Draft Post\n\n![cover](../drafts/assets/cover.png)",
      },
    });
  });

  test("keeps active file tabs selected after rename or move operations", () => {
    expect(
      remapActiveTabIdForPathChange(
        "file:local:blog/drafts/post.md",
        "local",
        "blog/drafts/post.md",
        "blog/archive/post.md"
      )
    ).toBe("file:local:blog/archive/post.md");

    expect(
      remapActiveTabIdForPathChange(
        "file:local:blog/drafts/nested/post.md",
        "local",
        "blog/drafts",
        "blog/archive"
      )
    ).toBe("file:local:blog/archive/nested/post.md");
  });

  test("keeps active database tabs selected after rename or move operations", () => {
    expect(
      remapActiveTabIdForPathChange(
        "post:blog/drafts/post.md",
        "local",
        "blog/drafts/post.md",
        "blog/archive/post.md"
      )
    ).toBe("post:blog/archive/post.md");

    expect(
      remapActiveTabIdForPathChange(
        "post:blog/drafts/nested/post.md",
        "local",
        "blog/drafts",
        "blog/archive"
      )
    ).toBe("post:blog/archive/nested/post.md");
  });

  test("selects a fallback tab after deleting the active file", () => {
    expect(
      resolveActiveTabIdAfterTreeDelete(
        [
          {
            id: "file:local:blog/first.md",
            label: "first.md",
            kind: "file",
            mode: "wysiwyg",
            dirty: false,
            file: { source: "local", path: "blog/first.md", content: "" },
          },
          {
            id: "file:local:blog/second.md",
            label: "second.md",
            kind: "file",
            mode: "wysiwyg",
            dirty: false,
            file: { source: "local", path: "blog/second.md", content: "" },
          },
        ],
        "file:local:blog/deleted.md",
        "local",
        [{ path: "blog/deleted.md", type: "file" }]
      )
    ).toBe("file:local:blog/second.md");
  });
});

describe("editor browser path remapping", () => {
  test("keeps the current directory selected after directory rename or move operations", () => {
    expect(
      remapBrowserPathForPathChange(
        "blog/drafts/nested",
        "blog/drafts",
        "blog/archive",
        "directory"
      )
    ).toBe("blog/archive/nested");

    expect(
      remapBrowserPathForPathChange("blog/drafts", "blog/drafts", "blog/archive", "directory")
    ).toBe("blog/archive");

    expect(
      remapBrowserPathForPathChange(
        "blog/drafts",
        "blog/drafts/post.md",
        "blog/archive/post.md",
        "file"
      )
    ).toBe("blog/drafts");
  });

  test("falls back to the nearest parent after deleting the current directory", () => {
    expect(
      resolveBrowserPathAfterTreeDelete("blog/archive/nested", [
        { path: "blog/archive", type: "directory" },
      ])
    ).toBe("blog");

    expect(
      resolveBrowserPathAfterTreeDelete("blog/archive", [
        { path: "blog/archive/post.md", type: "file" },
      ])
    ).toBe("blog/archive");
  });
});
