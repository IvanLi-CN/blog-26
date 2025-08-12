"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "../../lib/trpc";
import PageLayout from "../common/PageLayout";

export default function PostsListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const { data, isLoading, error, refetch } = trpc.posts.list.useQuery({
    page,
    limit: 12,
    search: search || undefined,
    category: category === "all" ? undefined : category,
    published: true,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    refetch();
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
            <button onClick={() => refetch()} className="btn btn-sm">
              重试
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-secondary text-primary-content py-16">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold mb-4">📚 文章列表</h1>
          <p className="text-xl opacity-90">探索技术见解、编程经验和生活感悟</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Search and Filter */}
            <div className="card bg-base-100 shadow-xl mb-8">
              <div className="card-body">
                <form onSubmit={handleSearch} className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-64">
                    <label className="label">
                      <span className="label-text">搜索文章</span>
                    </label>
                    <input
                      type="text"
                      placeholder="搜索标题或内容..."
                      className="input input-bordered w-full"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">
                      <span className="label-text">分类</span>
                    </label>
                    <select
                      className="select select-bordered"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="all">全部</option>
                      <option value="tech">技术</option>
                      <option value="life">生活</option>
                      <option value="thoughts">思考</option>
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary">
                    🔍 搜索
                  </button>
                </form>
              </div>
            </div>

            {/* Posts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {data?.posts && data.posts.length > 0 ? (
                data.posts.map((post) => (
                  <article
                    key={post.id}
                    className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow"
                  >
                    {post.image && (
                      <figure>
                        <img
                          src={post.image}
                          alt={post.title}
                          className="w-full h-48 object-cover"
                        />
                      </figure>
                    )}
                    <div className="card-body">
                      <h2 className="card-title">
                        <Link
                          href={`/posts/${post.slug}`}
                          className="hover:text-primary transition-colors"
                        >
                          {post.title}
                        </Link>
                      </h2>

                      <div className="flex items-center gap-4 text-sm text-base-content/70 mb-3">
                        <span>📅 {new Date(post.publishDate).toLocaleDateString()}</span>
                        {post.category && (
                          <span className="badge badge-outline">{post.category}</span>
                        )}
                      </div>

                      <p className="text-base-content/80 mb-4">
                        {post.excerpt || `${post.body.substring(0, 150)}...`}
                      </p>

                      {post.tags && (
                        <div className="flex flex-wrap gap-1 mb-4">
                          {post.tags
                            .split(",")
                            .slice(0, 3)
                            .map((tag, index) => (
                              <span key={index} className="badge badge-ghost badge-sm">
                                #{tag.trim()}
                              </span>
                            ))}
                        </div>
                      )}

                      <div className="card-actions justify-between items-center">
                        <div className="flex items-center gap-2">
                          {post.author && (
                            <div className="flex items-center gap-2">
                              <div className="avatar placeholder">
                                <div className="bg-neutral text-neutral-content rounded-full w-6">
                                  <span className="text-xs">{post.author.charAt(0)}</span>
                                </div>
                              </div>
                              <span className="text-sm">{post.author}</span>
                            </div>
                          )}
                        </div>
                        <Link href={`/posts/${post.slug}`} className="btn btn-primary btn-sm">
                          阅读更多
                        </Link>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="col-span-2 text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-2xl font-bold mb-2">暂无文章</h3>
                  <p className="text-base-content/70">
                    {search
                      ? `没有找到包含"${search}"的文章`
                      : category !== "all"
                        ? `${category} 分类下暂无文章`
                        : "还没有发布任何文章"}
                  </p>
                  {(search || category !== "all") && (
                    <button
                      onClick={() => {
                        setSearch("");
                        setCategory("all");
                        setPage(1);
                      }}
                      className="btn btn-outline mt-4"
                    >
                      查看所有文章
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Pagination */}
            {data?.pagination && data.pagination.totalPages > 1 && (
              <div className="flex justify-center">
                <div className="join">
                  <button
                    className="join-item btn"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    «
                  </button>
                  <button className="join-item btn btn-active">
                    第 {page} 页，共 {data.pagination.totalPages} 页
                  </button>
                  <button
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
              {/* Categories */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">📂 分类</h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => setCategory("all")}
                      className={`btn btn-sm w-full justify-start ${
                        category === "all" ? "btn-primary" : "btn-ghost"
                      }`}
                    >
                      全部文章
                    </button>
                    <button
                      onClick={() => setCategory("tech")}
                      className={`btn btn-sm w-full justify-start ${
                        category === "tech" ? "btn-primary" : "btn-ghost"
                      }`}
                    >
                      技术分享
                    </button>
                    <button
                      onClick={() => setCategory("life")}
                      className={`btn btn-sm w-full justify-start ${
                        category === "life" ? "btn-primary" : "btn-ghost"
                      }`}
                    >
                      生活感悟
                    </button>
                    <button
                      onClick={() => setCategory("thoughts")}
                      className={`btn btn-sm w-full justify-start ${
                        category === "thoughts" ? "btn-primary" : "btn-ghost"
                      }`}
                    >
                      思考随笔
                    </button>
                  </div>
                </div>
              </div>

              {/* Popular Tags */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">🏷️ 热门标签</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-outline cursor-pointer hover:badge-primary">
                      Next.js
                    </span>
                    <span className="badge badge-outline cursor-pointer hover:badge-primary">
                      React
                    </span>
                    <span className="badge badge-outline cursor-pointer hover:badge-primary">
                      TypeScript
                    </span>
                    <span className="badge badge-outline cursor-pointer hover:badge-primary">
                      Node.js
                    </span>
                    <span className="badge badge-outline cursor-pointer hover:badge-primary">
                      数据库
                    </span>
                    <span className="badge badge-outline cursor-pointer hover:badge-primary">
                      前端
                    </span>
                    <span className="badge badge-outline cursor-pointer hover:badge-primary">
                      后端
                    </span>
                    <span className="badge badge-outline cursor-pointer hover:badge-primary">
                      全栈
                    </span>
                  </div>
                </div>
              </div>

              {/* Archive */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">📅 归档</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span>2024年8月</span>
                      <span className="badge badge-ghost">{data?.posts?.length || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Back to Home */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <Link href="/" className="btn btn-primary w-full">
                    🏠 返回首页
                  </Link>
                  <Link href="/about" className="btn btn-outline w-full">
                    👤 关于我
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
