import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

export { MEMO_PAGE_SIZE } from "../lib/memo-pagination";

function useEdgeSentinel({
  enabled,
  isLoading,
  hasError,
  scrollDirection,
  onLoad,
}: {
  enabled: boolean;
  isLoading: boolean;
  hasError: boolean;
  scrollDirection: "up" | "down";
  onLoad: () => void | Promise<void>;
}) {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => setSentinel(node), []);
  const [observerSupported, setObserverSupported] = useState(true);
  const lastScrollY = useRef<number | null>(null);
  const currentDirection = useRef<"up" | "down" | null>(null);
  const lastLoadScrollY = useRef<number | null>(null);
  const onLoadRef = useRef(onLoad);
  const canLoadRef = useRef(false);
  onLoadRef.current = onLoad;
  canLoadRef.current = enabled && !isLoading && !hasError;

  const tryLoad = useCallback(() => {
    const bounds = sentinel?.getBoundingClientRect();
    const nearEdge =
      bounds !== undefined && bounds.bottom >= -900 && bounds.top <= window.innerHeight + 900;
    if (!canLoadRef.current || !nearEdge || currentDirection.current !== scrollDirection) {
      return;
    }

    const currentY = window.scrollY;
    const movedSinceLastLoad =
      lastLoadScrollY.current === null || Math.abs(currentY - lastLoadScrollY.current) >= 80;
    if (!movedSinceLastLoad) return;

    lastLoadScrollY.current = currentY;
    void onLoadRef.current();
  }, [scrollDirection, sentinel]);

  useEffect(() => {
    setObserverSupported(typeof IntersectionObserver !== "undefined");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    lastScrollY.current = window.scrollY;
    const handleScroll = () => {
      const nextY = window.scrollY;
      const previousY = lastScrollY.current;
      if (previousY !== null && nextY !== previousY) {
        currentDirection.current = nextY < previousY ? "up" : "down";
        tryLoad();
      }
      lastScrollY.current = nextY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [enabled, tryLoad]);

  useEffect(() => {
    if (!enabled || isLoading || hasError || !sentinel) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(() => tryLoad(), {
      rootMargin: "900px 0px",
      threshold: 0.01,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasError, isLoading, sentinel, tryLoad]);

  return { sentinelRef, observerSupported };
}

export function useMemoBidirectionalScroll({
  hasNewer,
  hasOlder,
  isLoadingNewer,
  isLoadingOlder,
  hasNewerError,
  hasOlderError,
  onLoadNewer,
  onLoadOlder,
}: {
  hasNewer: boolean;
  hasOlder: boolean;
  isLoadingNewer: boolean;
  isLoadingOlder: boolean;
  hasNewerError: boolean;
  hasOlderError: boolean;
  onLoadNewer: () => void | Promise<void>;
  onLoadOlder: () => void | Promise<void>;
}) {
  const newer = useEdgeSentinel({
    enabled: hasNewer,
    isLoading: isLoadingNewer,
    hasError: hasNewerError,
    scrollDirection: "up",
    onLoad: onLoadNewer,
  });
  const older = useEdgeSentinel({
    enabled: hasOlder,
    isLoading: isLoadingOlder,
    hasError: hasOlderError,
    scrollDirection: "down",
    onLoad: onLoadOlder,
  });

  return {
    newerSentinelRef: newer.sentinelRef,
    olderSentinelRef: older.sentinelRef,
    observerSupported: newer.observerSupported && older.observerSupported,
  };
}

export function useMemoInfiniteScroll({
  hasMore,
  isLoading,
  hasError,
  onLoadMore,
}: {
  hasMore: boolean;
  isLoading: boolean;
  hasError: boolean;
  onLoadMore: () => void | Promise<void>;
}) {
  const scroll = useMemoBidirectionalScroll({
    hasNewer: false,
    hasOlder: hasMore,
    isLoadingNewer: false,
    isLoadingOlder: isLoading,
    hasNewerError: false,
    hasOlderError: hasError,
    onLoadNewer: () => undefined,
    onLoadOlder: onLoadMore,
  });

  return { sentinelRef: scroll.olderSentinelRef, observerSupported: scroll.observerSupported };
}

export function MemoPaginationFeedback({
  hasMore,
  isLoading,
  error,
  total,
  direction = "older",
  showEnd = true,
  observerSupported = true,
  onLoadMore,
  onRetry,
}: {
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  total: number;
  direction?: "newer" | "older";
  showEnd?: boolean;
  observerSupported?: boolean;
  onLoadMore: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
}) {
  const showManualFallback = hasMore && !observerSupported && !isLoading && !error;
  const showAccessibleLoadMore = hasMore && observerSupported && !isLoading && !error;

  if (!hasMore && !isLoading && !error && (!showEnd || total === 0)) return null;

  return (
    <div
      className="memo-pagination-feedback"
      data-direction={direction}
      data-testid={`memo-pagination-feedback-${direction}`}
    >
      {isLoading ? (
        <span
          className="memo-pagination-loading"
          role="status"
          aria-label={`正在加载${direction === "newer" ? "较新" : "较旧"}的 Memo`}
          data-testid={
            direction === "older" ? "memo-pagination-loading" : "memo-pagination-loading-newer"
          }
        >
          <span className="memo-pagination-dots" aria-hidden="true">
            <span className="memo-pagination-wave-dot" />
            <span className="memo-pagination-wave-dot" />
            <span className="memo-pagination-wave-dot" />
          </span>
        </span>
      ) : null}

      {error ? (
        <button
          type="button"
          className="memo-pagination-error"
          onClick={onRetry}
          aria-label={`重试加载${direction === "newer" ? "较新" : "较旧"}的 Memo：${error}`}
          data-testid={
            direction === "older" ? "memo-pagination-retry" : "memo-pagination-retry-newer"
          }
        >
          <span>重试</span>
          <Icon name="tabler:refresh" className="h-3.5 w-3.5 shrink-0" />
        </button>
      ) : null}

      {showManualFallback ? (
        <button
          type="button"
          className="memo-pagination-fallback"
          onClick={onLoadMore}
          data-testid={`memo-pagination-fallback-${direction}`}
        >
          <Icon
            name={direction === "newer" ? "tabler:arrow-up" : "tabler:arrow-down"}
            className="h-3.5 w-3.5"
          />
          {direction === "newer" ? "加载更新内容" : "加载更多"}
        </button>
      ) : null}

      {showAccessibleLoadMore ? (
        <button
          type="button"
          className="memo-pagination-accessible"
          onClick={onLoadMore}
          aria-label={direction === "newer" ? "加载较新的 Memo" : "加载较旧的 Memo"}
          data-testid={
            direction === "older"
              ? "memo-pagination-accessible"
              : "memo-pagination-accessible-newer"
          }
        >
          {direction === "newer" ? "加载更新内容" : "加载更多"}
        </button>
      ) : null}

      {showEnd && direction === "older" && !hasMore && !isLoading && !error && total > 0 ? (
        <p className="memo-pagination-end" data-testid="memo-pagination-end">
          已到尽头（共 {total} 条）
        </p>
      ) : null}
    </div>
  );
}
