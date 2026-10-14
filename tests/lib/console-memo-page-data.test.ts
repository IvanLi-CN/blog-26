import { describe, expect, test } from "bun:test";
import { selectMemoForRender } from "../../site/lib/page-data/memo";
import type { PublicMemoRecord } from "../../src/public-site/snapshot";

describe("Console Memo page data source selection", () => {
  test("does not fall back to a stale public snapshot in Console runtime", () => {
    const staleSnapshotMemo = {
      slug: "published-then-private",
      title: "撤回后的私有内容",
      content: "这段正文不应从滞后公开快照渲染。",
    } as PublicMemoRecord;

    expect(
      selectMemoForRender({
        isConsoleRuntime: true,
        snapshotMemo: staleSnapshotMemo,
      })
    ).toBeUndefined();
  });

  test("keeps the public snapshot fallback for public site requests", () => {
    const publicSnapshotMemo = {
      slug: "published-memo",
      title: "公开内容",
      content: "公开正文。",
    } as PublicMemoRecord;

    expect(
      selectMemoForRender({
        isConsoleRuntime: false,
        snapshotMemo: publicSnapshotMemo,
      })
    ).toBe(publicSnapshotMemo);
  });
});
