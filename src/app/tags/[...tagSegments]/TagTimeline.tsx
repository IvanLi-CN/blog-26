"use client";

import { useMemo } from "react";
import TimelineItem from "@/components/home/TimelineItem";
import Icon from "@/components/ui/Icon";
import { trpc as api } from "@/lib/trpc";

const PAGE_SIZE = 20;

type TimelineUiItem = Parameters<typeof TimelineItem>[0]["item"];

export default function TagTimeline({ tagPath }: { tagPath: string }) {
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.tags.timeline.useInfiniteQuery(
      { tagPath, limit: PAGE_SIZE },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const timelineItems = useMemo<TimelineUiItem[]>(() => {
    const seen = new Set<string>();
    const pages = data?.pages ?? [];

    const items: TimelineUiItem[] = [];
    for (const page of pages) {
      for (const raw of page.items) {
        const key = `${raw.type}-${raw.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          type: raw.type,
          id: raw.id,
          slug: raw.slug,
          title: raw.title || undefined,
          excerpt: raw.excerpt || undefined,
          content: raw.content || undefined,
          publishDate: new Date(raw.publishDate),
          tags: raw.tags ?? [],
          image: raw.image || undefined,
          dataSource: raw.dataSource || undefined,
          permalink: raw.type === "post" ? `/posts/${raw.slug}` : undefined,
        });
      }
    }

    return items;
  }, [data]);

  const showInitialSkeleton = isLoading && timelineItems.length === 0;

  return (
    <>
      <div className="timeline flex flex-col">
        {showInitialSkeleton ? (
          Array.from({ length: 6 }).map((_, index) => (
            <TimelineItem
              // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton list
              key={`skeleton-${index}`}
              item={{
                type: "post",
                id: `skeleton-${index}`,
                slug: "loading",
                title: "",
                excerpt: "",
                publishDate: new Date(),
                tags: [],
              }}
              isLast={index === 5}
              loading={true}
            />
          ))
        ) : timelineItems.length > 0 ? (
          timelineItems.map((item, index) => (
            <TimelineItem
              key={`${item.type}-${item.id}`}
              item={item}
              isLast={index === timelineItems.length - 1 && !hasNextPage}
            />
          ))
        ) : (
          <div className="text-center py-10 text-muted">
            <Icon name="tabler:timeline" className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>暂无内容</p>
          </div>
        )}
      </div>

      {isError && (
        <div className="alert alert-error max-w-2xl mx-auto my-8">
          <Icon name="tabler:alert-triangle" className="h-5 w-5" />
          <span>{error?.message || "加载失败，请稍后重试"}</span>
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="btn btn-outline btn-primary gap-2"
            type="button"
            aria-label="加载更多"
          >
            {isFetchingNextPage ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                加载中...
              </>
            ) : (
              <>
                <Icon name="tabler:arrow-down" className="h-4 w-4" />
                加载更多
              </>
            )}
          </button>
        </div>
      )}

      {!hasNextPage && timelineItems.length > 0 && !showInitialSkeleton && (
        <div className="text-center py-8">
          <div className="text-base-content/60">已显示所有 {timelineItems.length} 条内容</div>
        </div>
      )}
    </>
  );
}
