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
    expect(getByText("行内")).toBeTruthy();
    expect(getByText("base line")).toBeTruthy();
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
  test("switches between inline, split and three-way comparison", () => {
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
    fireEvent.click(getByText("三路"));
    expect(seen).toEqual(["split", "three"]);
    rerender(<ContentRepoDiffView diff={diffPayload()} mode="split" onModeChange={noop} />);
    expect(queryByTestId("content-split-merge")).toBeTruthy();
    expect(getByText("整篇采用远端")).toBeTruthy();
    rerender(
      <ContentRepoDiffView
        diff={diffPayload({
          regions: [
            { kind: "stable", text: "base line" },
            { kind: "conflict", base: "base line", local: "local line", remote: "remote line" },
          ],
        })}
        mode="three"
        onModeChange={noop}
      />
    );
    expect(queryByTestId("content-three-way-merge")).toBeTruthy();
    expect(getByText(/已解决 0\/1/u)).toBeTruthy();
  });
});
