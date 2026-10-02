import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicMemoRecord } from "@/public-site/snapshot";
import {
  getMemoListWebDemoCursorPage,
  MEMO_LIST_WEB_DEMO_DELAY_MS,
} from "../lib/memo-list-web-demo";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";
import MemoCard, { type MemoCardRecord } from "./MemoCard";
import { MEMO_PAGE_SIZE } from "./MemoPagination";
import VirtualizedMemoList from "./VirtualizedMemoList";

export type MemoPageDirection = "newer" | "older";

export type MemoPageResponse = {
  memos?: MemoCardRecord[];
  items?: MemoCardRecord[];
  hasMore?: boolean;
  nextCursor?: string | null;
  previousCursor?: string | null;
};

export type MemoPageLoader = (input: {
  cursor: string;
  direction: MemoPageDirection;
}) => Promise<MemoPageResponse>;

function uniqueMemos(memos: MemoCardRecord[]) {
  const seen = new Set<string>();
  return memos.filter((memo) => {
    const key = memo.id || memo.slug;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function MemoTimeline({
  source,
  initialMemos,
  initialHasMore,
  initialNextCursor,
  initialHasNewer = false,
  initialPreviousCursor = null,
  initialError,
  snapshotVersion,
  pageLoader,
  iconMap,
  iconSvgMap,
}: {
  source: "snapshot" | "database" | "demo";
  initialMemos: MemoCardRecord[];
  initialHasMore: boolean;
  initialNextCursor: string | null;
  initialHasNewer?: boolean;
  initialPreviousCursor?: string | null;
  initialError?: string | null;
  snapshotVersion?: string;
  pageLoader?: MemoPageLoader;
  iconMap: Record<string, string | null>;
  iconSvgMap: Record<string, string | null>;
}) {
  const [memos, setMemos] = useState(initialMemos);
  const [hasOlder, setHasOlder] = useState(initialHasMore);
  const [olderCursor, setOlderCursor] = useState(initialNextCursor);
  const [hasNewer, setHasNewer] = useState(initialHasNewer);
  const [newerCursor, setNewerCursor] = useState(initialPreviousCursor);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isLoadingNewer, setIsLoadingNewer] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(initialError ?? null);
  const [newerError, setNewerError] = useState<string | null>(null);
  const [renderedMemos, setRenderedMemos] = useState(0);
  const inFlightRef = useRef({ newer: false, older: false });

  useEffect(() => {
    if (source !== "demo") return;
    const list = document.querySelector<HTMLElement>('[data-testid="memos-timeline"]');
    if (!list) return;

    const updateRenderedCount = () => {
      setRenderedMemos(Number(list.dataset.renderedMemos ?? 0));
    };
    updateRenderedCount();
    const observer = new MutationObserver(updateRenderedCount);
    observer.observe(list, { attributes: true, attributeFilter: ["data-rendered-memos"] });
    return () => observer.disconnect();
  }, [source]);

  const loadPage = useCallback(
    async (direction: MemoPageDirection, cursor: string | null) => {
      if (!cursor || inFlightRef.current[direction]) return;
      inFlightRef.current[direction] = true;
      if (direction === "newer") {
        setIsLoadingNewer(true);
        setNewerError(null);
      } else {
        setIsLoadingOlder(true);
        setOlderError(null);
      }

      try {
        let payload: MemoPageResponse;
        if (pageLoader) {
          payload = await pageLoader({ cursor, direction });
        } else if (source === "demo" && import.meta.env.DEV) {
          await new Promise((resolve) => setTimeout(resolve, MEMO_LIST_WEB_DEMO_DELAY_MS));
          const page = getMemoListWebDemoCursorPage(cursor, direction);
          payload = {
            ...page,
            memos: page.memos.map(toMemoCardRecord),
          };
        } else if (source === "demo") {
          throw new Error("Memo list Web Demo is only available in development.");
        } else if (source === "snapshot") {
          if (direction !== "older") throw new Error("公开快照不支持加载更新的页面。");
          const url = toPublicSitePath(
            `/memos/data/${cursor}.json${snapshotVersion ? `?v=${encodeURIComponent(snapshotVersion)}` : ""}`
          );
          const response = await fetch(url ?? "");
          payload = (await response.json()) as MemoPageResponse;
        } else {
          const params = new URLSearchParams({
            publicOnly: "true",
            limit: String(MEMO_PAGE_SIZE),
            cursor,
            direction,
          });
          const response = await fetch(
            toPublicApiUrl(`/api/public/memos?${params.toString()}`) ?? "",
            {
              credentials: "include",
            }
          );
          const result = (await response.json().catch(() => null)) as MemoPageResponse | null;
          if (!response.ok) throw new Error(`请求失败（${response.status}）`);
          payload = result ?? {};
        }

        const pageMemos = Array.isArray(payload.memos)
          ? payload.memos
          : Array.isArray(payload.items)
            ? payload.items
            : [];
        if (direction === "newer") {
          setMemos((current) => uniqueMemos([...pageMemos, ...current]));
          setHasNewer(payload.hasMore === true);
          setNewerCursor(payload.previousCursor ?? null);
        } else {
          setMemos((current) => uniqueMemos([...current, ...pageMemos]));
          setHasOlder(payload.hasMore === true);
          setOlderCursor(payload.nextCursor ?? null);
          if (payload.hasPrevious !== undefined) {
            setHasNewer(payload.hasPrevious);
            setNewerCursor(payload.previousCursor ?? null);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (direction === "newer") setNewerError(message);
        else setOlderError(message);
      } finally {
        inFlightRef.current[direction] = false;
        if (direction === "newer") setIsLoadingNewer(false);
        else setIsLoadingOlder(false);
      }
    },
    [pageLoader, snapshotVersion, source]
  );

  const loadNewer = useCallback(() => loadPage("newer", newerCursor), [loadPage, newerCursor]);
  const loadOlder = useCallback(() => loadPage("older", olderCursor), [loadPage, olderCursor]);
  const retryNewer = useCallback(() => loadPage("newer", newerCursor), [loadPage, newerCursor]);
  const retryOlder = useCallback(() => loadPage("older", olderCursor), [loadPage, olderCursor]);

  return (
    <>
      {source === "demo" ? (
        <p
          className="nature-muted mb-4 text-center text-sm"
          data-testid="memo-list-demo-status"
          aria-live="polite"
        >
          Web Demo · 已加载 {memos.length} / 2,400 条 · 当前挂载 {renderedMemos} 条
        </p>
      ) : null}
      {memos.length === 0 ? (
        <div className="nature-empty" data-testid="memos-empty">
          <p>
            {isLoadingOlder || isLoadingNewer
              ? "正在加载公开 Memos…"
              : olderError || newerError
                ? "暂时无法加载公开 Memos。"
                : "暂无公开 Memos"}
          </p>
        </div>
      ) : null}
      {source === "snapshot" ? (
        <div data-public-memos-static-list="true">
          <VirtualizedMemoList
            items={memos}
            getKey={(memo) => memo.id || memo.slug}
            renderItem={(memo, _index, isLast) => (
              <MemoCard memo={memo} isLast={isLast} iconMap={iconMap} iconSvgMap={iconSvgMap} />
            )}
            newer={{
              hasMore: hasNewer,
              isLoading: isLoadingNewer,
              error: newerError,
              onLoad: loadNewer,
              onRetry: retryNewer,
            }}
            older={{
              hasMore: hasOlder,
              isLoading: isLoadingOlder,
              error: olderError,
              onLoad: loadOlder,
              onRetry: retryOlder,
            }}
          />
        </div>
      ) : (
        <VirtualizedMemoList
          items={memos}
          getKey={(memo) => memo.id || memo.slug}
          renderItem={(memo, _index, isLast) => (
            <MemoCard
              memo={memo}
              isLast={isLast}
              disablePrefetch={source === "demo"}
              iconMap={iconMap}
              iconSvgMap={iconSvgMap}
            />
          )}
          newer={{
            hasMore: hasNewer,
            isLoading: isLoadingNewer,
            error: newerError,
            onLoad: loadNewer,
            onRetry: retryNewer,
          }}
          older={{
            hasMore: hasOlder,
            isLoading: isLoadingOlder,
            error: olderError,
            onLoad: loadOlder,
            onRetry: retryOlder,
          }}
        />
      )}
    </>
  );
}

export function toMemoCardRecord(memo: PublicMemoRecord): MemoCardRecord {
  return {
    id: memo.id,
    slug: memo.slug,
    title: memo.title,
    excerpt: memo.excerpt,
    tags: memo.tags,
    createdAt: memo.createdAt,
    publishedAt: memo.publishedAt,
  };
}
