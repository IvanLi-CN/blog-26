"use client";

import { useState } from "react";
import { trpc } from "../../lib/trpc";
import PageLayout from "../common/PageLayout";
import BlogList from "./BlogList";
import BlogPagination from "./BlogPagination";

export default function PostsListPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = trpc.posts.list.useQuery({
    page,
    limit: 10, // 匹配旧项目的每页数量
    published: true,
  });

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
            }))}
          />
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-2xl font-bold mb-2">暂无文章</h3>
            <p className="text-base-content/70">还没有发布任何文章</p>
          </div>
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
