"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { trpc } from "../../lib/trpc";
import type { AppRouter } from "../../server/router";
import PageLayout from "../common/PageLayout";
import type { TagIconMap } from "../tag-icons/tag-icon-client";
import EmptyState from "../ui/EmptyState";
import BlogList from "./BlogList";
import BlogPagination from "./BlogPagination";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type PostsListOutput = RouterOutputs["posts"]["list"];

export default function PostsListPage({
  initialIsAdmin = false,
  initialPosts,
  tagIconMap,
  tagIconSvgMap,
}: {
  initialIsAdmin?: boolean;
  initialPosts?: PostsListOutput;
  tagIconMap?: TagIconMap;
  tagIconSvgMap?: Record<string, string | null>;
}) {
  const initialPage = initialPosts?.pagination?.page ?? 1;
  const [page, setPage] = useState(initialPage);

  const { data, isLoading, error, refetch } = trpc.posts.list.useQuery(
    {
      page,
      limit: 10, // 匹配旧项目的每页数量
      published: true,
    },
    {
      initialData: page === initialPage ? initialPosts : undefined,
    }
  );

  const { isAdmin, isLoading: authLoading } = useAuth();
  const effectiveIsAdmin = authLoading ? initialIsAdmin : isAdmin;
  const router = useRouter();

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading && !data) {
    return (
      <PageLayout>
        <div className="nature-container py-20">
          <div className="nature-panel flex items-center justify-center gap-3 px-6 py-8 text-[color:var(--nature-text-soft)]">
            <span className="nature-spinner h-5 w-5" />
            <span>正在加载文章...</span>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <div className="nature-container py-20">
          <div className="nature-alert nature-alert-error items-center justify-between">
            <span>加载文章失败</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="nature-button nature-button-outline min-h-9 px-3 py-2 text-sm"
            >
              重试
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section className="nature-container px-6 py-12 sm:py-16 lg:py-20">
        <div className="mb-8 text-center sm:mb-12">
          <span className="nature-kicker justify-center">Archive</span>
          <h1 className="nature-title mt-4 text-4xl sm:text-5xl lg:text-6xl">文章</h1>
          <p className="nature-muted mx-auto mt-4 max-w-2xl text-base sm:text-lg">
            一些想法、记录、分享
          </p>
        </div>

        {data?.posts && data.posts.length > 0 ? (
          <BlogList
            posts={data.posts.map((post) => ({
              ...post,
              published: !post.draft && post.public,
              excerpt: post.excerpt ?? undefined,
              image: post.image ?? undefined,
              category: post.category ?? undefined,
              updateDate: post.updateDate ?? undefined,
              tags: post.tags ?? undefined,
              author: post.author ?? undefined,
              dataSource: post.dataSource ?? undefined,
              isVectorized:
                "isVectorized" in post
                  ? Boolean((post as { isVectorized?: unknown }).isVectorized)
                  : false,
            }))}
            isAdmin={effectiveIsAdmin}
            tagIconMap={tagIconMap}
            tagIconSvgMap={tagIconSvgMap}
          />
        ) : (
          <EmptyState
            icon={effectiveIsAdmin ? "tabler:article" : "tabler:inbox"}
            title={effectiveIsAdmin ? "还没有文章" : "暂无公开文章"}
            description={effectiveIsAdmin ? "开始写下你的第一篇文章吧！" : "这里暂时没有公开的内容"}
            size={effectiveIsAdmin ? "lg" : "md"}
            tone={effectiveIsAdmin ? "brand" : "neutral"}
            variant={effectiveIsAdmin ? "plain" : "panel"}
            links={
              effectiveIsAdmin
                ? undefined
                : [
                    { label: "去看闪念", href: "/memos", icon: "tabler:bulb" },
                    { label: "浏览标签", href: "/tags", icon: "tabler:tags" },
                    { label: "订阅 RSS", href: "/rss.xml", icon: "tabler:rss" },
                  ]
            }
            action={
              effectiveIsAdmin
                ? {
                    label: "新建文章",
                    onClick: () => router.push("/admin/posts/editor"),
                    variant: "default",
                  }
                : undefined
            }
            className="mt-2"
          />
        )}

        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="mt-12 md:mt-16">
            <BlogPagination
              currentPage={page}
              totalPages={data.pagination.totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </section>
    </PageLayout>
  );
}
