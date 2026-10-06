import { describe, expect, it } from "bun:test";
import {
  getMemoListWebDemoCursorPage,
  getMemoListWebDemoInitialPage,
  getMemoListWebDemoInitialPageForState,
  getMemoListWebDemoRecord,
  getMemoListWebDemoRecords,
  MEMO_LIST_WEB_DEMO_TOTAL,
} from "../../site/lib/memo-list-web-demo";

describe("memo list Web Demo data", () => {
  it("starts in the middle with adjacent cursors in both directions", () => {
    const page = getMemoListWebDemoInitialPage();

    expect(page.memos).toHaveLength(40);
    expect(page.memos[0]?.id).toBe("memo-web-demo-1181");
    expect(page.memos.at(-1)?.id).toBe("memo-web-demo-1220");
    expect(page.hasPrevious).toBe(true);
    expect(page.previousCursor).toBe("1170");
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe("1220");
  });

  it("returns adjacent pages in service order without gaps", () => {
    const newer = getMemoListWebDemoCursorPage("1170", "newer");
    const older = getMemoListWebDemoCursorPage("1220", "older");

    expect(newer.memos.map((memo) => memo.id)).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `memo-web-demo-${String(1171 + index).padStart(4, "0")}`
      )
    );
    expect(newer.hasMore).toBe(true);
    expect(newer.previousCursor).toBe("1160");
    expect(older.memos[0]?.id).toBe("memo-web-demo-1221");
    expect(older.memos.at(-1)?.id).toBe("memo-web-demo-1230");
    expect(older.hasMore).toBe(true);
    expect(older.nextCursor).toBe("1230");
  });

  it("supports newest, oldest, dense, and empty inspector states", () => {
    const newest = getMemoListWebDemoInitialPageForState({
      scene: "memo-newest",
      data: "fixture",
    });
    const oldest = getMemoListWebDemoInitialPageForState({
      scene: "memo-oldest",
      data: "fixture",
    });
    const dense = getMemoListWebDemoInitialPageForState({
      scene: "memo-middle",
      data: "dense",
    });
    const empty = getMemoListWebDemoInitialPageForState({
      scene: "memo-middle",
      data: "empty",
    });

    expect(newest.memos[0]?.id).toBe("memo-web-demo-0001");
    expect(newest.hasPrevious).toBe(false);
    expect(oldest.memos[0]?.id).toBe("memo-web-demo-2361");
    expect(oldest.hasMore).toBe(false);
    expect(dense.memos).toHaveLength(80);
    expect(empty.memos).toHaveLength(0);
    expect(empty.hasMore).toBe(false);
  });

  it("stops at either end of the finite mock dataset", () => {
    const newest = getMemoListWebDemoCursorPage("0", "newer");
    const oldest = getMemoListWebDemoCursorPage(String(MEMO_LIST_WEB_DEMO_TOTAL - 10), "older");

    expect(newest.hasMore).toBe(false);
    expect(newest.previousCursor).toBeNull();
    expect(oldest.memos).toHaveLength(10);
    expect(oldest.memos.at(-1)?.id).toBe(`memo-web-demo-${MEMO_LIST_WEB_DEMO_TOTAL}`);
    expect(oldest.hasMore).toBe(false);
    expect(oldest.nextCursor).toBeNull();
  });

  it("provides official detail records for every generated demo slug", () => {
    const records = getMemoListWebDemoRecords();

    expect(records).toHaveLength(MEMO_LIST_WEB_DEMO_TOTAL);
    expect(getMemoListWebDemoRecord("memo-web-demo-0001")?.title).toBe("时间线样例 0001");
    expect(getMemoListWebDemoRecord("memo-web-demo-2400")?.title).toBe("时间线样例 2400");
    expect(getMemoListWebDemoRecord("memo-web-demo-0000")).toBeNull();
    expect(getMemoListWebDemoRecord("memo-web-demo-invalid")).toBeNull();
  });
});
