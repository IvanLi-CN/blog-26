"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "../../lib/trpc";
import PageLayout from "../common/PageLayout";

interface PostDetailPageProps {
  slug: string;
}

export default function PostDetailPage({ slug }: PostDetailPageProps) {
  const [showCommentForm, setShowCommentForm] = useState(false);

  const { data: post, isLoading, error } = trpc.posts.get.useQuery({ slug });
  const { data: relatedPosts } = trpc.posts.related.useQuery({ slug, limit: 5 });

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

  if (error || !post) {
    return (
      <PageLayout>
        <div className="container mx-auto px-4 py-20">
          <div className="text-center">
            <div className="text-6xl mb-4">😵</div>
            <h1 className="text-4xl font-bold mb-4">文章不存在</h1>
            <p className="text-base-content/70 mb-8">抱歉，您访问的文章不存在或已被删除。</p>
            <Link href="/" className="btn btn-primary">
              返回首页
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Article Content */}
          <article className="lg:col-span-3">
            {/* Breadcrumb */}
            <div className="breadcrumbs text-sm mb-6">
              <ul>
                <li>
                  <Link href="/">首页</Link>
                </li>
                <li>
                  <Link href="/posts">文章</Link>
                </li>
                <li>{post.title}</li>
              </ul>
            </div>

            {/* Article Header */}
            <header className="mb-8">
              <h1 className="text-4xl font-bold mb-4">{post.title}</h1>

              <div className="flex flex-wrap items-center gap-4 text-sm text-base-content/70 mb-6">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    ></path>
                  </svg>
                  <span>发布于 {new Date(post.publishDate).toLocaleDateString()}</span>
                </div>

                {post.updateDate && post.updateDate !== post.publishDate && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      ></path>
                    </svg>
                    <span>更新于 {new Date(post.updateDate).toLocaleDateString()}</span>
                  </div>
                )}

                {post.author && (
                  <div className="flex items-center gap-2">
                    <div className="avatar placeholder">
                      <div className="bg-neutral text-neutral-content rounded-full w-6">
                        <span className="text-xs">{post.author.charAt(0)}</span>
                      </div>
                    </div>
                    <span>作者：{post.author}</span>
                  </div>
                )}
              </div>

              {/* Tags and Category */}
              <div className="flex flex-wrap gap-2 mb-6">
                {post.category && <span className="badge badge-primary">{post.category}</span>}
                {post.tags &&
                  post.tags.split(",").map((tag, index) => (
                    <span key={index} className="badge badge-outline">
                      #{tag.trim()}
                    </span>
                  ))}
              </div>

              {/* Featured Image */}
              {post.image && (
                <div className="mb-8">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-64 object-cover rounded-lg shadow-lg"
                  />
                </div>
              )}
            </header>

            {/* Article Body */}
            <div className="prose prose-lg max-w-none mb-12">
              {/* 这里应该渲染 Markdown 内容，暂时显示纯文本 */}
              <div className="whitespace-pre-wrap">{post.body}</div>
            </div>

            {/* Article Footer */}
            <footer className="border-t pt-8 mb-12">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-base-content/70">
                    如果您觉得这篇文章有用，请分享给更多人！
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-outline btn-sm">👍 点赞</button>
                  <button className="btn btn-outline btn-sm">📤 分享</button>
                </div>
              </div>
            </footer>

            {/* Comments Section */}
            <section className="border-t pt-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">评论</h3>
                <button
                  onClick={() => setShowCommentForm(!showCommentForm)}
                  className="btn btn-primary btn-sm"
                >
                  💬 发表评论
                </button>
              </div>

              {/* Comment Form */}
              {showCommentForm && (
                <div className="card bg-base-100 shadow-xl mb-8">
                  <div className="card-body">
                    <h4 className="card-title">发表评论</h4>
                    <form className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="label">
                            <span className="label-text">姓名 *</span>
                          </label>
                          <input type="text" className="input input-bordered w-full" required />
                        </div>
                        <div>
                          <label className="label">
                            <span className="label-text">邮箱 *</span>
                          </label>
                          <input type="email" className="input input-bordered w-full" required />
                        </div>
                      </div>
                      <div>
                        <label className="label">
                          <span className="label-text">评论内容 *</span>
                        </label>
                        <textarea
                          className="textarea textarea-bordered w-full h-32"
                          placeholder="请输入您的评论..."
                          required
                        ></textarea>
                      </div>
                      <div className="card-actions justify-end">
                        <button
                          type="button"
                          onClick={() => setShowCommentForm(false)}
                          className="btn btn-ghost"
                        >
                          取消
                        </button>
                        <button type="submit" className="btn btn-primary">
                          提交评论
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Comments List */}
              <div className="space-y-6">
                {/* 暂时显示占位评论 */}
                <div className="text-center py-12 text-base-content/50">
                  <div className="text-4xl mb-2">💬</div>
                  <p>暂无评论，成为第一个评论者吧！</p>
                </div>
              </div>
            </section>
          </article>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="space-y-6">
              {/* Table of Contents */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h3 className="card-title">目录</h3>
                  <div className="text-sm">
                    <p className="text-base-content/50">目录功能开发中...</p>
                  </div>
                </div>
              </div>

              {/* Related Posts */}
              {relatedPosts && relatedPosts.length > 0 && (
                <div className="card bg-base-100 shadow-xl">
                  <div className="card-body">
                    <h3 className="card-title">相关文章</h3>
                    <div className="space-y-3">
                      {relatedPosts.map((relatedPost) => (
                        <div key={relatedPost.id}>
                          <Link
                            href={`/posts/${relatedPost.slug}`}
                            className="text-sm hover:text-primary transition-colors line-clamp-2"
                          >
                            {relatedPost.title}
                          </Link>
                          <div className="text-xs text-base-content/50 mt-1">
                            {new Date(relatedPost.publishDate).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Back to Top */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="btn btn-outline w-full"
                  >
                    ⬆️ 回到顶部
                  </button>
                  <Link href="/" className="btn btn-primary w-full">
                    🏠 返回首页
                  </Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </PageLayout>
  );
}
