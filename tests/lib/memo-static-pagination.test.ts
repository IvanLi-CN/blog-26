import { describe, expect, it } from "bun:test";
import { buildPublicMemoStaticPages } from "../../site/lib/memo-pagination";

function createMemo(id: number, isPublic = true) {
  return {
    id: `memo-${id}`,
    slug: `memo-${id}`,
    title: `Memo ${id}`,
    excerpt: null,
    content: `Content ${id}`,
    tags: [],
    inlineTags: [],
    isPublic,
    createdAt: new Date(Date.UTC(2026, 0, id + 1)).toISOString(),
    publishedAt: null,
    updatedAt: null,
    dataSource: null,
    filePath: `memos/${id}.md`,
    image: null,
    media: { primary: null, cover: null, content: [], attachments: [] },
  };
}

describe("public static Memo pagination", () => {
  it("generates public-only pages after the ten Memo SSR snapshot", () => {
    const memos = [
      ...Array.from({ length: 21 }, (_, index) => createMemo(index)),
      createMemo(21, false),
    ];

    const pages = buildPublicMemoStaticPages(memos);

    expect(pages.map((page) => page.page)).toEqual(["2", "3"]);
    expect(pages[0]?.memos.map((memo) => memo.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `memo-${index + 10}`)
    );
    expect(pages[0]?.hasMore).toBe(true);
    expect(pages[0]?.nextCursor).toBe("3");
    expect(pages[1]?.memos.map((memo) => memo.id)).toEqual(["memo-20"]);
    expect(pages[1]?.hasMore).toBe(false);
    expect(pages[1]?.nextCursor).toBeNull();
    expect(pages.flatMap((page) => page.memos).every((memo) => memo.isPublic)).toBe(true);
  });

  it("does not emit pagination routes when the first page is the entire snapshot", () => {
    expect(
      buildPublicMemoStaticPages(Array.from({ length: 10 }, (_, index) => createMemo(index)))
    ).toEqual([]);
  });
});
