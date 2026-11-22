import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";

const noop = () => undefined;

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
    conflictingFields: [],
    bodyConflicts: 0,
    ...overrides,
  };
}

describe("ContentRepoDiffView", () => {
  test("renders the side-by-side diff and the shared ancestor", () => {
    const { getByTestId, getByText } = render(
      <ContentRepoDiffView diff={diffPayload()} mode="inline" onModeChange={noop} />
    );
    expect(getByTestId("content-repo-diff")).toBeTruthy();
    expect(getByTestId("content-merge-editor")).toBeTruthy();
    expect(getByText("整篇采用远端")).toBeTruthy();
    expect(getByText("保存到内容库")).toBeTruthy();
    expect(getByText("base line")).toBeTruthy();
  });

  test("summarizes every conflict in one hint", () => {
    const { getByText, getAllByText } = render(
      <ContentRepoDiffView
        diff={diffPayload({ conflictingFields: ["title", "tags"], bodyConflicts: 2 })}
        mode="inline"
        onModeChange={noop}
      />
    );
    expect(getAllByText(/需要人工裁决/u)).toHaveLength(1);
    expect(getByText(/title（frontmatter）、tags（frontmatter）、正文 2 处/u)).toBeTruthy();
  });

  test("shows the merge preview when the sides merged cleanly", () => {
    const { getByText } = render(
      <ContentRepoDiffView
        diff={diffPayload({ mergedText: "merged result" })}
        mode="inline"
        onModeChange={noop}
      />
    );
    expect(getByText("合并预览")).toBeTruthy();
    expect(getByText("merged result")).toBeTruthy();
  });

  test("explains why no comparison is available", () => {
    const { getByText } = render(
      <ContentRepoDiffView
        diff={{ status: "failed", path: "blog/x.md", message: "Attachment is unavailable" }}
        mode="inline"
        onModeChange={noop}
      />
    );
    expect(getByText("Attachment is unavailable")).toBeTruthy();
  });
});

describe("ContentRepoDiffView modes", () => {
  test("switches between inline and split comparison", () => {
    const seen: string[] = [];
    const { getByText, queryByTestId, rerender } = render(
      <ContentRepoDiffView
        diff={diffPayload()}
        mode="inline"
        onModeChange={(mode) => seen.push(mode)}
      />
    );
    expect(queryByTestId("content-merge-editor")).toBeTruthy();
    fireEvent.click(getByText("双栏"));
    expect(seen).toEqual(["split"]);
    rerender(<ContentRepoDiffView diff={diffPayload()} mode="split" onModeChange={noop} />);
    expect(queryByTestId("content-split-merge")).toBeTruthy();
    expect(getByText("整篇采用远端")).toBeTruthy();
  });
});
