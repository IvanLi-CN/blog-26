"use client";

import type { InfiniteData } from "@tanstack/react-query";
import { useMemo } from "react";
import TimelineItem from "@/components/home/TimelineItem";
import type { TagIconMap } from "@/components/tag-icons/tag-icon-client";
import Icon from "@/components/ui/Icon";
import { trpc as api } from "@/lib/trpc";

const PAGE_SIZE = 20;

type TimelineUiItem = Parameters<typeof TimelineItem>[0]["item"];

type TimelinePage = {
  items: Array<{
    type: "post" | "memo";
    id: string;
    slug: string;
    title: string;
    excerpt?: string;
    content?: string;
    publishDate: string;
    tags: string[];
    image?: string;
    dataSource?: string;
  }>;
  nextCursor?: string;
  hasMore: boolean;
};

export default function TagTimeline({
  tagPath,
  initialPage,
  tagIconMap,
  tagIconSvgMap,
}: {
  tagPath: string;
  initialPage?: TimelinePage;
  tagIconMap?: TagIconMap;
  tagIconSvgMap?: Record<string, string | null>;
}) {
  const initialData: InfiniteData<TimelinePage, string | undefined> | undefined = useMemo(() => {
    if (!initialPage) return undefined;
    return { pages: [initialPage], pageParams: [undefined] };
  }, [initialPage]);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    api.tags.timeline.useInfiniteQuery(
      { tagPath, limit: PAGE_SIZE },
      { getNextPageParam: (lastPage) => lastPage.nextCursor, initialData }
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
      <div className="timeline nature-timeline flex flex-col">
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
              tagIconMap={tagIconMap}
              tagIconSvgMap={tagIconSvgMap}
              isLast={index === timelineItems.length - 1 && !hasNextPage}
            />
          ))
        ) : (
          <div className="nature-empty py-10">
            <Icon
              name="tabler:timeline"
              className="mx-auto mb-2 h-8 w-8 text-[color:var(--nature-text-faint)]"
            />
            <p>暂无内容</p>
          </div>
        )}
      </div>

      {isError && (
        <div className="nature-alert nature-alert-error mx-auto my-8 max-w-2xl">
          <Icon name="tabler:alert-triangle" className="h-5 w-5" />
          <span>{error?.message || "加载失败，请稍后重试"}</span>
        </div>
      )}

      {hasNextPage && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="nature-button nature-button-outline min-h-11 gap-2 px-5 py-3"
            type="button"
            aria-label="加载更多"
          >
            {isFetchingNextPage ? (
              <>
                <span className="nature-spinner h-4 w-4" />
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
          <div className="text-[color:var(--nature-text-soft)]">
            已显示所有 {timelineItems.length} 条内容
          </div>
        </div>
      )}
    </>
  );
}
