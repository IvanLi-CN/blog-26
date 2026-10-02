import type { PublicMemoRecord } from "../../src/public-site/snapshot";

export const MEMO_LIST_WEB_DEMO_TOTAL = 2400;
export const MEMO_LIST_WEB_DEMO_INITIAL_START = 1180;
export const MEMO_LIST_WEB_DEMO_INITIAL_COUNT = 40;
export const MEMO_LIST_WEB_DEMO_PAGE_SIZE = 10;
export const MEMO_LIST_WEB_DEMO_DELAY_MS = 600;

export type MemoListWebDemoDirection = "newer" | "older";

export type MemoListWebDemoPage = {
  memos: PublicMemoRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  hasPrevious: boolean;
  previousCursor: string | null;
};

function clampStart(start: number) {
  return Math.max(0, Math.min(MEMO_LIST_WEB_DEMO_TOTAL, Math.trunc(start)));
}

function createMemo(index: number): PublicMemoRecord {
  const number = index + 1;
  const suffix = String(number).padStart(4, "0");
  const excerpts = [
    `这是第 ${suffix} 条本地模拟闪念，用来观察靠近列表边界时页面如何自动读取下一页。`,
    `第 ${suffix} 条记录有更长一些的正文，用于模拟不同卡片高度。虚拟列表会测量真实内容高度，并在向上插入较新记录时保持正在阅读的卡片位置。这里的数据固定生成，不会写入数据库。`,
    `Web Demo 样例 ${suffix}：游标页之间保持连续顺序，卡片高度、标签数量与正文长度会按记录编号变化。\n\n第二段内容用于让滚动距离更接近日常浏览。`,
    `第 ${suffix} 条模拟记录。列表继续使用正式页面中的闪念卡片与主题样式。`,
  ];
  const createdAt = new Date(Date.UTC(2026, 8, 30, 12) - index * 60 * 60 * 1000).toISOString();
  const tags = ["Web Demo", `列表/样例-${(index % 9) + 1}`];

  return {
    id: `memo-web-demo-${suffix}`,
    slug: `memo-web-demo-${suffix}`,
    title: `时间线样例 ${suffix}`,
    excerpt: excerpts[index % excerpts.length] ?? excerpts[0] ?? "",
    content: excerpts[index % excerpts.length] ?? "",
    tags,
    inlineTags: tags,
    isPublic: true,
    createdAt,
    publishedAt: null,
    updatedAt: null,
    dataSource: "web-demo",
    filePath: `demo/memos/${suffix}.md`,
    image: null,
    media: { primary: null, cover: null, content: [], attachments: [] },
  };
}

function createPage(start: number, count: number): PublicMemoRecord[] {
  const first = clampStart(start);
  const end = Math.min(MEMO_LIST_WEB_DEMO_TOTAL, first + count);
  return Array.from({ length: end - first }, (_, offset) => createMemo(first + offset));
}

export function getMemoListWebDemoInitialPage(): MemoListWebDemoPage {
  const start = MEMO_LIST_WEB_DEMO_INITIAL_START;
  const end = start + MEMO_LIST_WEB_DEMO_INITIAL_COUNT;

  return {
    memos: createPage(start, MEMO_LIST_WEB_DEMO_INITIAL_COUNT),
    hasMore: end < MEMO_LIST_WEB_DEMO_TOTAL,
    nextCursor: end < MEMO_LIST_WEB_DEMO_TOTAL ? String(end) : null,
    hasPrevious: start > 0,
    previousCursor: start > 0 ? String(Math.max(0, start - MEMO_LIST_WEB_DEMO_PAGE_SIZE)) : null,
  };
}

export function getMemoListWebDemoCursorPage(
  cursor: string | null,
  direction: MemoListWebDemoDirection
) {
  const parsedStart = cursor === null ? Number.NaN : Number(cursor);
  const start = Number.isSafeInteger(parsedStart)
    ? clampStart(parsedStart)
    : MEMO_LIST_WEB_DEMO_TOTAL;
  const end = Math.min(MEMO_LIST_WEB_DEMO_TOTAL, start + MEMO_LIST_WEB_DEMO_PAGE_SIZE);
  const memos = createPage(start, MEMO_LIST_WEB_DEMO_PAGE_SIZE);

  if (direction === "newer") {
    return {
      memos,
      hasMore: start > 0,
      previousCursor: start > 0 ? String(Math.max(0, start - MEMO_LIST_WEB_DEMO_PAGE_SIZE)) : null,
    };
  }

  return {
    memos,
    hasMore: end < MEMO_LIST_WEB_DEMO_TOTAL,
    nextCursor: end < MEMO_LIST_WEB_DEMO_TOTAL ? String(end) : null,
  };
}
