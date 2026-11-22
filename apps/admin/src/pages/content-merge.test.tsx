import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import type { ContentRepoDiffPayload } from "@/lib/admin-api-client";
import { ContentRepoDiffView } from "./content-merge";

GlobalRegistrator.register();

afterEach(() => {
  cleanup();
});

function diffPayload(overrides: Partial<ContentRepoDiffPayload> = {}): ContentRepoDiffPayload {
  return {
    status: "ready",
    path: "blog/merge-demo.md",
    state: "merge-conflict",
    baseText: "base line",
    localText: "local line",
    remoteText: "remote line",
    mergedText: null,
    fields: [],
    conflictingFields: [],
    bodyConflicts: 0,
    ...overrides,
  };
}

describe("ContentRepoDiffView", () => {
  test("renders the side-by-side diff and the shared ancestor", () => {
    const { getByTestId, getByText } = render(<ContentRepoDiffView diff={diffPayload()} />);
    expect(getByTestId("content-repo-diff")).toBeTruthy();
    expect(getByTestId("content-merge-editor")).toBeTruthy();
    expect(getByText("采用远端本处")).toBeTruthy();
    expect(getByText("保存到内容库")).toBeTruthy();
    expect(getByText("base line")).toBeTruthy();
  });

  test("names the conflicting frontmatter fields and body conflicts", () => {
    const { getByText } = render(
      <ContentRepoDiffView
        diff={diffPayload({ conflictingFields: ["title", "tags"], bodyConflicts: 2 })}
      />
    );
    expect(getByText(/title、tags/u)).toBeTruthy();
    expect(getByText(/正文冲突 2 处/u)).toBeTruthy();
  });

  test("shows the merge preview when the sides merged cleanly", () => {
    const { getByText } = render(
      <ContentRepoDiffView diff={diffPayload({ mergedText: "merged result" })} />
    );
    expect(getByText("合并预览")).toBeTruthy();
    expect(getByText("merged result")).toBeTruthy();
  });

  test("explains why no comparison is available", () => {
    const { getByText } = render(
      <ContentRepoDiffView
        diff={{ status: "failed", path: "blog/x.md", message: "Attachment is unavailable" }}
      />
    );
    expect(getByText("Attachment is unavailable")).toBeTruthy();
  });
});
