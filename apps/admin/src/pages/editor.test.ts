import { describe, expect, test } from "bun:test";
import {
  mapBatchResultsToTreeSelection,
  remapActiveTabIdForPathChange,
  resolveActiveTabIdAfterTreeDelete,
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
});

describe("editor tab path remapping", () => {
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
