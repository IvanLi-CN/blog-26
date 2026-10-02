import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { MemoPaginationFeedback, useMemoBidirectionalScroll } from "./MemoPagination";

type EdgeState = {
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  onLoad: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
};

export default function VirtualizedMemoList<T>({
  items,
  getKey,
  renderItem,
  newer,
  older,
  className = "memos-list nature-timeline nature-mobile-reading-stream",
  testId = "memos-timeline",
  sentinelTestIds = { newer: "memo-pagination-sentinel-newer", older: "memo-pagination-sentinel" },
}: {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number, isLast: boolean) => ReactNode;
  newer: EdgeState;
  older: EdgeState;
  className?: string;
  testId?: string;
  sentinelTestIds?: { newer: string; older: string };
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const getKeyRef = useRef(getKey);
  const [scrollMargin, setScrollMargin] = useState(0);
  itemsRef.current = items;
  getKeyRef.current = getKey;
  const getItemKey = useCallback((index: number) => {
    const item = itemsRef.current[index];
    return item ? getKeyRef.current(item) : index;
  }, []);
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 220,
    getItemKey,
    overscan: 8,
    scrollMargin,
    anchorTo: "end",
    // Keep append measurements from pinning the reader to the end; retain key anchoring for prepends.
    scrollEndThreshold: -1,
    initialRect: { width: 1280, height: 900 },
  });

  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;

    const updateScrollMargin = () => {
      const next = Math.max(0, Math.round(window.scrollY + element.getBoundingClientRect().top));
      setScrollMargin((current) => (current === next ? current : next));
    };

    updateScrollMargin();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollMargin);
    if (element.parentElement) resizeObserver?.observe(element.parentElement);
    window.addEventListener("resize", updateScrollMargin);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateScrollMargin);
    };
  }, []);

  const { newerSentinelRef, olderSentinelRef, observerSupported } = useMemoBidirectionalScroll({
    hasNewer: newer.hasMore,
    hasOlder: older.hasMore,
    isLoadingNewer: newer.isLoading,
    isLoadingOlder: older.isLoading,
    hasNewerError: Boolean(newer.error),
    hasOlderError: Boolean(older.error),
    onLoadNewer: newer.onLoad,
    onLoadOlder: older.onLoad,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (items.length === 0) {
    return (
      <>
        {newer.hasMore ? <div ref={newerSentinelRef} className="h-px" aria-hidden="true" /> : null}
        <MemoPaginationFeedback
          direction="newer"
          showEnd={false}
          hasMore={newer.hasMore}
          isLoading={newer.isLoading}
          error={newer.error}
          total={0}
          observerSupported={observerSupported}
          onLoadMore={newer.onLoad}
          onRetry={newer.onRetry}
        />
        {older.hasMore ? <div ref={olderSentinelRef} className="h-px" aria-hidden="true" /> : null}
        <MemoPaginationFeedback
          direction="older"
          hasMore={older.hasMore}
          isLoading={older.isLoading}
          error={older.error}
          total={0}
          observerSupported={observerSupported}
          onLoadMore={older.onLoad}
          onRetry={older.onRetry}
        />
      </>
    );
  }

  return (
    <>
      {newer.hasMore ? (
        <div className="memo-pagination-edge" data-direction="newer">
          <div
            ref={newerSentinelRef}
            className="h-px"
            aria-hidden="true"
            data-testid={sentinelTestIds.newer}
          />
          <MemoPaginationFeedback
            direction="newer"
            showEnd={false}
            hasMore={newer.hasMore}
            isLoading={newer.isLoading}
            error={newer.error}
            total={items.length}
            observerSupported={observerSupported}
            onLoadMore={newer.onLoad}
            onRetry={newer.onRetry}
          />
        </div>
      ) : null}

      <div
        ref={listRef}
        className={`${className} virtualized-memo-list`}
        data-testid={testId}
        data-loaded-memos={items.length}
        data-rendered-memos={virtualItems.length}
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;

          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              data-memo-virtual-key={getKey(item)}
              className="virtualized-memo-row"
              style={{
                transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              {renderItem(item, virtualItem.index, virtualItem.index === items.length - 1)}
            </div>
          );
        })}
      </div>

      {older.hasMore ? (
        <div className="memo-pagination-edge" data-direction="older">
          <div
            ref={olderSentinelRef}
            className="h-px"
            aria-hidden="true"
            data-testid={sentinelTestIds.older}
          />
          <MemoPaginationFeedback
            direction="older"
            hasMore={older.hasMore}
            isLoading={older.isLoading}
            error={older.error}
            total={items.length}
            observerSupported={observerSupported}
            onLoadMore={older.onLoad}
            onRetry={older.onRetry}
          />
        </div>
      ) : (
        <MemoPaginationFeedback
          direction="older"
          hasMore={false}
          isLoading={older.isLoading}
          error={older.error}
          total={items.length}
          showEnd={!newer.hasMore}
          observerSupported={observerSupported}
          onLoadMore={older.onLoad}
          onRetry={older.onRetry}
        />
      )}
    </>
  );
}
