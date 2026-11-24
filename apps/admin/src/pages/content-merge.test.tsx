import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";

const noop = () => undefined;

import type {
  ContentRepoDiffPayload,
  ContentRepoSyncItem,
  ContentTaskItem,
} from "@/lib/admin-api-client";
import {
  ContentRepoDiffView,
  eligibleContentIds,
  FileTaskChip,
  pruneActionableSelection,
} from "./content-merge";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

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

function repoItem(overrides: Partial<ContentRepoSyncItem> = {}): ContentRepoSyncItem {
  return {
    path: "blog/a.md",
    contentId: "content-a",
    kind: "post",
    state: "to-push",
    localHash: "local-a",
    baselineHash: "base-a",
    remoteSha: "remote-a",
    baselineSha: "base-a",
    changedMedia: [],
    missingMedia: [],
    ...overrides,
  };
}

describe("batch selection helpers", () => {
  test("selects only document rows whose state matches and drops media rows", () => {
    const rows = [
      { key: "blog/a.md", path: "blog/a.md", label: "文章" as const, item: repoItem() },
      {
        key: "blog/b.md",
        path: "blog/b.md",
        label: "文章" as const,
        item: repoItem({ path: "blog/b.md", contentId: "content-b", state: "to-pull" }),
      },
      {
        key: "blog/c.md",
        path: "blog/c.md",
        label: "文章" as const,
        item: repoItem({ path: "blog/c.md", contentId: null, state: "remote-new" }),
      },
      {
        key: "blog/assets/a.png",
        path: "blog/assets/a.png",
        label: "附件" as const,
        item: repoItem({ path: "blog/assets/a.png", contentId: "content-a", state: "to-push" }),
        media: { path: "blog/assets/a.png", missing: false },
      },
    ];
    expect(eligibleContentIds(rows, "to-push")).toEqual(["content-a"]);
    expect(eligibleContentIds(rows, "to-pull")).toEqual(["content-b"]);
    expect(eligibleContentIds(rows, "merge-conflict")).toEqual([]);
  });

  test("keeps only still-actionable content ids after a refresh", () => {
    const next = pruneActionableSelection(
      ["content-a", "content-b", "content-c", "content-d"],
      [
        repoItem({ contentId: "content-a", state: "to-push" }),
        repoItem({ path: "blog/b.md", contentId: "content-b", state: "to-pull" }),
        repoItem({ path: "blog/c.md", contentId: "content-c", state: "synced" }),
        repoItem({ path: "blog/d.md", contentId: "content-d", state: "remote-deleted" }),
      ]
    );
    expect([...next]).toEqual(["content-a", "content-b"]);
  });
});

describe("FileTaskChip", () => {
  const item = (overrides: Partial<ContentTaskItem> = {}): ContentTaskItem => ({
    path: "blog/a.md",
    contentId: "content-a",
    kind: "post",
    status: "running",
    reason: null,
    error: null,
    mediaTotal: 0,
    mediaProcessed: 0,
    mediaFailed: 0,
    retryable: false,
    updatedAt: Date.now(),
    ...overrides,
  });

  for (const [status, label] of [
    ["uploaded", "已上传"],
    ["success", "成功"],
    ["skipped", "跳过"],
    ["blocked", "需处理"],
    ["conflict", "冲突"],
    ["failed", "失败"],
  ] as const) {
    test(`renders the ${status} file status in Chinese`, () => {
      const { getByTestId, getByText } = render(<FileTaskChip item={item({ status })} />);
      expect(getByTestId("file-card-task-status").getAttribute("data-task-item-status")).toBe(
        status
      );
      expect(getByText(label)).toBeTruthy();
    });
  }

  test("shows media progress only when the item carries attachments", () => {
    const { getByTestId, rerender } = render(
      <FileTaskChip item={item({ status: "success", mediaTotal: 3, mediaProcessed: 2 })} />
    );
    expect(getByTestId("file-card-task-status").textContent).toContain("附件 2/3");
    rerender(<FileTaskChip item={item({ status: "success" })} />);
    expect(getByTestId("file-card-task-status").textContent).not.toContain("附件");
  });
});
