import type { PublicMemoRecord } from "@/public-site/snapshot";

export const MEMO_PAGE_SIZE = 10;

export type PublicMemoStaticPage = {
  page: string;
  memos: PublicMemoRecord[];
  hasMore: boolean;
  nextCursor: string | null;
};

export function buildPublicMemoStaticPages(
  snapshotMemos: PublicMemoRecord[],
  pageSize = MEMO_PAGE_SIZE
): PublicMemoStaticPage[] {
  const publicMemos = snapshotMemos.filter((memo) => memo.isPublic);
  const pageCount = Math.ceil(publicMemos.length / pageSize);

  return Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => {
    const page = index + 2;
    const start = (page - 1) * pageSize;
    const memos = publicMemos.slice(start, start + pageSize);
    const hasMore = page < pageCount;

    return {
      page: String(page),
      memos,
      hasMore,
      nextCursor: hasMore ? String(page + 1) : null,
    };
  });
}
