import { z } from "zod";
import type { PublicMemoRecord } from "@/public-site/snapshot";

export const MEMO_PAGE_SIZE = 10;

export type MemoPaginationDirection = "newer" | "older";

export const publicMemoCardSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string().nullable(),
    excerpt: z.string().nullable(),
    tags: z.array(z.string()),
    isPublic: z.literal(true),
    createdAt: z.string().min(1),
    publishedAt: z.string().nullable(),
  })
  .passthrough();

export const adminMemoRecordSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string().nullable().optional(),
    content: z.string(),
    excerpt: z.string().nullable().optional(),
    isPublic: z.boolean(),
    tags: z.array(z.string()),
    filePath: z.string().optional(),
    source: z.string().optional(),
  })
  .passthrough();

const memoPageEnvelopeSchema = z
  .object({
    memos: z.array(z.unknown()).optional(),
    items: z.array(z.unknown()).optional(),
    hasMore: z.boolean(),
    hasPrevious: z.boolean().optional(),
    nextCursor: z.string().nullable().optional(),
    previousCursor: z.string().nullable().optional(),
  })
  .passthrough()
  .refine((page) => page.memos !== undefined || page.items !== undefined);

export function parseMemoPage<T>(
  value: unknown,
  direction: MemoPaginationDirection,
  recordSchema: z.ZodType<T>,
  allowLegacyArray = false
) {
  let memos: T[];
  let hasMore: boolean;
  let hasPrevious = false;
  let nextCursor: string | null = null;
  let previousCursor: string | null = null;

  if (Array.isArray(value) && allowLegacyArray) {
    const parsedMemos = z.array(recordSchema).safeParse(value);
    if (!parsedMemos.success) throw new Error("Memo 分页响应格式无效。");
    memos = parsedMemos.data;
    hasMore = false;
  } else {
    const parsedPage = memoPageEnvelopeSchema.safeParse(value);
    if (!parsedPage.success) throw new Error("Memo 分页响应格式无效。");

    const page = parsedPage.data;
    const parsedMemos = z.array(recordSchema).safeParse(page.memos ?? page.items);
    if (!parsedMemos.success) throw new Error("Memo 分页响应格式无效。");

    memos = parsedMemos.data;
    hasMore = page.hasMore;
    hasPrevious = page.hasPrevious === true;
    nextCursor = page.nextCursor ?? null;
    previousCursor = page.previousCursor ?? null;

    const edgeCursor = direction === "newer" ? previousCursor : nextCursor;
    if (hasMore && (memos.length === 0 || !edgeCursor)) {
      throw new Error("Memo 分页响应格式无效。");
    }
    if (hasPrevious && (memos.length === 0 || !previousCursor)) {
      throw new Error("Memo 分页响应格式无效。");
    }
  }

  return { memos, hasMore, hasPrevious, nextCursor, previousCursor };
}

export function parseConsoleInitialMemoPage(value: unknown, isAdmin: boolean) {
  return isAdmin
    ? parseMemoPage(value, "older", adminMemoRecordSchema)
    : parseMemoPage(value, "older", publicMemoCardSchema);
}

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
