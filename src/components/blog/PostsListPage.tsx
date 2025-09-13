"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { trpc } from "../../lib/trpc";
import PageLayout from "../common/PageLayout";
import EmptyState from "../ui/EmptyState";
import BlogList from "./BlogList";
import BlogPagination from "./BlogPagination";

export default function PostsListPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = trpc.posts.list.useQuery({
    page,
    limit: 10, // 匹配旧项目的每页数量
    published: true,
  });

  const { isAdmin } = useAuth();
  const router = useRouter();

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex justify-center items-center py-20">
          <span className="loading loading-spinner loading-lg"></span>
          <span className="ml-2">正在加载文章...</span>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-20">
          <div className="alert alert-error">
            <span>加载文章失败</span>
            <button type="button" onClick={() => refetch()} className="btn btn-sm">
              重试
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <section className="px-6 sm:px-6 py-12 sm:py-16 lg:py-20 mx-auto max-w-4xl">
        {/* 页面标题 - 匹配首页和闪念页面的样式 */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-base-content mb-4">
            文章
          </h1>
          <p className="text-base sm:text-lg text-base-content/70 max-w-2xl mx-auto">
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
            }))}
          />
        ) : (
          <EmptyState
            icon={isAdmin ? "tabler:article" : "tabler:inbox"}
            title={isAdmin ? "还没有文章" : "暂无公开文章"}
            description={isAdmin ? "开始写下你的第一篇文章吧！" : "这里暂时没有公开的内容"}
            size={isAdmin ? "lg" : "md"}
            tone={isAdmin ? "brand" : "neutral"}
            variant={isAdmin ? "plain" : "card"}
            links={
              isAdmin
                ? undefined
                : [
                    { label: "去看闪念", href: "/memos", icon: "tabler:bulb" },
                    { label: "浏览标签", href: "/tags", icon: "tabler:tags" },
                    { label: "订阅 RSS", href: "/rss.xml", icon: "tabler:rss" },
                  ]
            }
            action={
              isAdmin
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
