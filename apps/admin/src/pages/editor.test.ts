import { describe, expect, test } from "bun:test";
import {
  buildDatabaseAuthoringDocument,
  deriveDatabaseDraftState,
  getAvailableEditorModes,
  getDefaultFileEditorMode,
  getEditorHeaderCopy,
  getEditorSurfaceKind,
  getSelectionRevealPaths,
  isPreviewableEditorTab,
  mapBatchResultsToTreeSelection,
  remapActiveTabIdForPathChange,
  remapBrowserPathForPathChange,
  remapTabPath,
  resolveActiveTabIdAfterTreeDelete,
  resolveBrowserPathAfterTreeDelete,
  shouldMarkLiveEditorContentDirty,
  supportsEditorAttachments,
} from "./editor-logic";

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

describe("database post authoring contract", () => {
  test("rebuilds an authoring document from structured fields and strips contaminated body frontmatter", () => {
    const document = buildDatabaseAuthoringDocument({
      postId: "blog/usb-c-safe-5v-sink.md",
      slug: "usb-c-safe-5v-sink",
      title: "USB-C 安全 5V Sink",
      excerpt: "面向作者态预览的摘要。",
      content:
        "---\ntitle: 脏标题\nslug: dirty-slug\ndraft: true\n---\n\n# Heading\n\n正文第一段。",
      draft: false,
      public: false,
      source: "local",
      filePath: "blog/usb-c-safe-5v-sink.md",
      category: "hardware",
      author: "Ivan Li",
      image: "./assets/cover.png",
      publishDate: Date.UTC(2026, 5, 20),
      updateDate: Date.UTC(2026, 5, 21),
      tags: ["usb-c", "power"],
    });

    expect(document.wasContaminated).toBeTrue();
    expect(document.body).toBe("\n# Heading\n\n正文第一段。");
    expect(document.content).toContain("title: USB-C 安全 5V Sink");
    expect(document.content).toContain("slug: usb-c-safe-5v-sink");
    expect(document.content).toContain("draft: false");
    expect(document.content).toContain("public: false");
    expect(document.content).toContain("category: hardware");
    expect(document.content).toContain("author: Ivan Li");
    expect(document.content).toContain("image: ./assets/cover.png");
    expect(document.content).toContain("tags:");
    expect(document.content).not.toContain("title: 脏标题");
  });

  test("preserves publish and update timestamp precision when rebuilding database authoring documents", () => {
    const publishDate = Date.parse("2026-06-20T08:15:30.000Z");
    const updateDate = Date.parse("2026-06-21T10:45:55.000Z");
    const document = buildDatabaseAuthoringDocument({
      postId: "blog/timestamp-precision.md",
      slug: "timestamp-precision",
      title: "Timestamp Precision",
      excerpt: "摘要",
      content: "\n# Timestamp Precision\n\n纯正文。",
      draft: false,
      public: true,
      source: "local",
      filePath: "blog/timestamp-precision.md",
      publishDate,
      updateDate,
    });

    const state = deriveDatabaseDraftState(
      {
        postId: "blog/timestamp-precision.md",
        slug: "timestamp-precision",
        title: "Timestamp Precision",
        excerpt: "摘要",
        content: document.content,
        draft: false,
        public: true,
        source: "local",
        filePath: "blog/timestamp-precision.md",
        publishDate,
        updateDate,
      },
      document.content
    );

    expect(document.content).toContain("publishDate: '2026-06-20T08:15:30.000Z'");
    expect(document.content).toContain("updateDate: '2026-06-21T10:45:55.000Z'");
    expect(state.publishDate).toBe(publishDate);
    expect(state.updateDate).toBe(updateDate);
  });

  test("prefers frontmatter title over a body image line when deriving database draft state", () => {
    const state = deriveDatabaseDraftState(
      {
        postId: "post-1",
        slug: "usb-c-safe-5v-sink",
        title: "Persisted title",
        excerpt: "",
        content: "",
        draft: true,
        public: false,
        source: "local",
        filePath: "blog/usb-c-safe-5v-sink.md",
      },
      `---
title: USB-C 安全 5V Sink
slug: usb-c-safe-5v-sink
excerpt: 面向作者态预览的摘要。
draft: true
public: false
---

![1.00](./assets/cover.png)

正文第一段。`
    );

    expect(state.title).toBe("USB-C 安全 5V Sink");
    expect(state.slug).toBe("usb-c-safe-5v-sink");
    expect(state.excerpt).toBe("面向作者态预览的摘要。");
    expect(state.draft).toBeTrue();
    expect(state.public).toBeFalse();
  });

  test("keeps body-only canonical data when saving a database-backed draft state", () => {
    const state = deriveDatabaseDraftState(
      {
        postId: "post-2",
        slug: "body-only-canonical",
        title: "Body Only Canonical",
        excerpt: "Persisted excerpt",
        content: "",
        draft: false,
        public: true,
        source: "local",
        filePath: "blog/body-only-canonical.md",
        category: "hardware",
        tags: ["usb-c"],
      },
      `---
title: Body Only Canonical
slug: body-only-canonical
category: hardware
tags:
  - usb-c
  - sink
---

# Body Only Canonical

纯正文段落。`
    );

    expect(state.title).toBe("Body Only Canonical");
    expect(state.tags).toEqual(["usb-c", "sink"]);
    expect(state.category).toBe("hardware");
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

  test("defaults extensionless text files to source-only mode", () => {
    const textTab = {
      id: "file:local:Hardware/plain-config",
      label: "plain-config",
      kind: "file" as const,
      mode: getDefaultFileEditorMode("text"),
      dirty: false,
      file: {
        source: "local" as const,
        path: "Hardware/plain-config",
        content: "mode=5v\n",
        contentKind: "text" as const,
      },
    };

    expect(getDefaultFileEditorMode("text")).toBe("source");
    expect(getEditorSurfaceKind(textTab)).toBe("text");
    expect(getAvailableEditorModes(textTab)).toEqual(["source"]);
    expect(isPreviewableEditorTab(textTab)).toBeFalse();
    expect(supportsEditorAttachments(textTab)).toBeFalse();
    expect(getEditorHeaderCopy(textTab)).toMatchObject({
      title: "纯文本编辑器",
      backLabel: "返回文件浏览器",
      emptyActionLabel: null,
      placeholder: "开始编辑纯文本文件...",
    });
  });

  test("keeps markdown file tabs fully editable with preview and attachments", () => {
    const markdownTab = {
      id: "file:local:Hardware/post.md",
      label: "post.md",
      kind: "file" as const,
      mode: getDefaultFileEditorMode("markdown"),
      dirty: false,
      file: {
        source: "local" as const,
        path: "Hardware/post.md",
        content: "# Post\n",
        contentKind: "markdown" as const,
      },
    };

    expect(getDefaultFileEditorMode("markdown")).toBe("wysiwyg");
    expect(getEditorSurfaceKind(markdownTab)).toBe("article");
    expect(getAvailableEditorModes(markdownTab)).toEqual(["wysiwyg", "source", "compare"]);
    expect(isPreviewableEditorTab(markdownTab)).toBeTrue();
    expect(supportsEditorAttachments(markdownTab)).toBeTrue();
    expect(getEditorHeaderCopy(markdownTab)).toMatchObject({
      title: "文章编辑器",
      backLabel: "返回文章列表",
      emptyActionLabel: "新建文章",
      placeholder: "开始写作您的文章...",
    });
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
          contentKind: "markdown",
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
          contentKind: "markdown",
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
          contentKind: "markdown",
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
          contentKind: "markdown",
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
            file: {
              source: "local",
              path: "blog/first.md",
              content: "",
              contentKind: "markdown",
            },
          },
          {
            id: "file:local:blog/second.md",
            label: "second.md",
            kind: "file",
            mode: "wysiwyg",
            dirty: false,
            file: {
              source: "local",
              path: "blog/second.md",
              content: "",
              contentKind: "markdown",
            },
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
