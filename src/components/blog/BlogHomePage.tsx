"use client";

import Link from "next/link";
import { useState } from "react";
import { SITE } from "@/config/site";
import { useAuth } from "../../hooks/useAuth";
import { trpc } from "../../lib/trpc";
import PageLayout from "../common/PageLayout";
import PostTags from "./PostTags";
import { resolvePostTiming } from "./time-utils";

export default function BlogHomePage() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string>("all");
  const { isAdmin } = useAuth();

  const { data, isLoading, error } = trpc.posts.list.useQuery({
    page,
    limit: 10,
    category: category === "all" ? undefined : category,
    published: true,
  });

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
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Hero Section */}
      <div className="hero bg-gradient-to-r from-primary to-secondary text-primary-content py-16">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="mb-5 text-5xl font-bold">Ivan&apos;s Blog</h1>
            <p className="mb-5">分享技术见解、编程经验和生活感悟</p>
            <Link href="/posts" className="btn btn-accent btn-lg">
              浏览文章
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Category Filter */}
            <div className="mb-8">
              <div className="tabs tabs-boxed">
                <button
                  type="button"
                  className={`tab ${category === "all" ? "tab-active" : ""}`}
                  onClick={() => setCategory("all")}
                >
                  全部
                </button>
                <button
                  type="button"
                  className={`tab ${category === "tech" ? "tab-active" : ""}`}
                  onClick={() => setCategory("tech")}
                >
                  技术
                </button>
                <button
                  type="button"
                  className={`tab ${category === "life" ? "tab-active" : ""}`}
                  onClick={() => setCategory("life")}
                >
                  生活
                </button>
                <button
                  type="button"
                  className={`tab ${category === "thoughts" ? "tab-active" : ""}`}
                  onClick={() => setCategory("thoughts")}
                >
                  思考
                </button>
              </div>
            </div>

            {/* Posts List */}
            <div className="space-y-8">
              {data?.posts && data.posts.length > 0 ? (
                data.posts.map((post) => {
                  const authorName = post.author?.trim() || SITE.author.name;
                  const authorInitial = authorName.charAt(0).toUpperCase();

                  const timing = resolvePostTiming(post);
                  const publishDateTimeAttr = timing.publishDateTimeAttr ?? undefined;
                  const publishTitle = timing.publishTitle ?? undefined;
                  const relativePublish = timing.relativePublish;
                  const relativeUpdate = timing.relativeUpdate;
                  const shouldShowUpdateHint =
                    Boolean(isAdmin) && Boolean(relativeUpdate) && timing.shouldShowUpdateHint;
                  const fallbackLabel =
                    Boolean(isAdmin) && timing.fallbackLabel ? timing.fallbackLabel : null;

                  return (
                    <article key={post.id} className="card bg-base-100 shadow-xl">
                      <div className="card-body">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <h2 className="card-title text-2xl mb-2">
                              <Link
                                href={`/posts/${post.slug}`}
                                className="hover:text-primary transition-colors"
                              >
                                {post.title}
                              </Link>
                            </h2>
                            <div className="flex items-center gap-3 text-sm text-base-content/70 flex-wrap">
                              <span className="inline-flex items-center gap-1">
                                <span role="img" aria-label="时间">
                                  🕒
                                </span>
                                <time dateTime={publishDateTimeAttr} title={publishTitle}>
                                  {relativePublish}
                                </time>
                                {shouldShowUpdateHint && relativeUpdate && (
                                  <span className="whitespace-nowrap text-xs text-base-content/50 italic">
                                    (编辑于 {relativeUpdate})
                                  </span>
                                )}
                                {fallbackLabel && (
                                  <span className="text-warning/80 flex-shrink-0">
                                    {fallbackLabel}
                                  </span>
                                )}
                              </span>
                              {post.category && (
                                <span className="badge badge-outline">{post.category}</span>
                              )}
                              {Array.isArray(post.tags) && post.tags.length > 0 && (
                                <PostTags tags={post.tags} className="flex gap-1 flex-wrap" />
                              )}
                            </div>
                          </div>
                        </div>

                        <p className="text-base-content/80 mb-4">
                          {post.excerpt || `${post.body.substring(0, 200)}...`}
                        </p>

                        <div className="card-actions justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="avatar placeholder">
                              <div className="bg-neutral text-neutral-content rounded-full w-8">
                                <span className="text-xs">{authorInitial}</span>
                              </div>
                            </div>
                            <span className="text-sm">{authorName}</span>
                          </div>
                          <Link href={`/posts/${post.slug}`} className="btn btn-primary btn-sm">
                            阅读更多
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-2xl font-bold mb-2">暂无文章</h3>
                  <p className="text-base-content/70">
                    {category === "all" ? "还没有发布任何文章" : `${category} 分类下暂无文章`}
                  </p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {data?.pagination && data.pagination.totalPages > 1 && (
              <div className="flex justify-center mt-12">
                <div className="join">
                  <button
                    type="button"
                    className="join-item btn"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    «
                  </button>
                  <button type="button" className="join-item btn btn-active">
                    第 {page} 页，共 {data.pagination.totalPages} 页
                  </button>
                  <button
                    type="button"
                    className="join-item btn"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
              {/* About Card */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">关于我</h3>
                  <p className="text-sm">
                    全栈开发者，热爱技术分享和开源贡献。专注于 Web 开发、云原生技术和人工智能。
                  </p>
                  <div className="card-actions">
                    <Link href="/about" className="btn btn-outline btn-sm">
                      了解更多
                    </Link>
                  </div>
                </div>
              </div>

              {/* Recent Posts */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">最新文章</h3>
                  <div className="space-y-3">
                    {data?.posts?.slice(0, 5).map((post) => (
                      <div key={post.id}>
                        <Link
                          href={`/posts/${post.slug}`}
                          className="text-sm hover:text-primary transition-colors line-clamp-2"
                        >
                          {post.title}
                        </Link>
                        <div className="text-xs text-base-content/50 mt-1">
                          {new Date(post.publishDate).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags Cloud */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">标签云</h3>
                  <div className="flex flex-wrap gap-2">
                    {/* 这里可以从 API 获取所有标签 */}
                    <span className="badge badge-outline">Next.js</span>
                    <span className="badge badge-outline">React</span>
                    <span className="badge badge-outline">TypeScript</span>
                    <span className="badge badge-outline">Node.js</span>
                    <span className="badge badge-outline">数据库</span>
                    <span className="badge badge-outline">前端</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
