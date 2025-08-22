"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { SITE } from "../../config/site";
import { resolveImagePath } from "../../lib/image-utils";
import { trpc } from "../../lib/trpc";
import { toMsTimestamp } from "../../lib/utils";
import CommentSectionWithProvider from "../comments/CommentSectionWithProvider";
import { useUserInfo } from "../comments/hooks";
import MarkdownRenderer from "../common/MarkdownRenderer";
import PageLayout from "../common/PageLayout";
import StructuredData from "../seo/StructuredData";
import ArticleLicense from "./ArticleLicense";
import PostReactions from "./PostReactions";
import PostStatus from "./PostStatus";
import PostTags from "./PostTags";
import ReadingTime from "./ReadingTime";
import RelatedPosts from "./RelatedPosts";
import SocialShare from "./SocialShare";
import ToBlogLink from "./ToBlogLink";

interface PostDetailPageProps {
  slug: string;
}

export default function PostDetailPage({ slug }: PostDetailPageProps) {
  const { data: post, isLoading, error } = trpc.posts.get.useQuery({ slug });
  const { data: relatedPosts } = trpc.posts.related.useQuery({ slug, limit: 5 });
  const { userInfo } = useUserInfo();

  // 检查是否为管理员
  const isUserAdmin = userInfo?.isAdmin || false;

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

  // 格式化日期（兼容秒/毫秒）
  const getFormattedDate = (timestamp: number) => {
    return new Date(toMsTimestamp(timestamp)).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // 转换 post 对象以匹配 Post 类型
  const postForStructuredData = {
    ...post,
    excerpt: post.excerpt ?? undefined,
    image: post.image ?? undefined,
    category: post.category ?? undefined,
    updateDate: post.updateDate ?? undefined,
    author: post.author ?? undefined,
    tags: post.tags ?? undefined,
  };

  return (
    <PageLayout>
      {/* SEO 结构化数据 */}
      <StructuredData post={postForStructuredData} />

      <section className="py-8 sm:py-16 lg:py-20 mx-auto">
        <article>
          <header className={post.image ? "mb-6" : "mb-6"}>
            <div className="flex justify-between flex-col sm:flex-row max-w-3xl mx-auto mt-0 mb-2 px-4 sm:px-6 sm:items-center">
              <p>
                <Icon
                  icon="tabler:clock"
                  className="w-4 h-4 inline-block -mt-0.5 dark:text-gray-400"
                />
                <time
                  dateTime={new Date(toMsTimestamp(post.publishDate)).toISOString()}
                  className="inline-block"
                >
                  {getFormattedDate(post.publishDate)}
                </time>
                {post.author && (
                  <>
                    {" "}
                    ·{" "}
                    <Icon
                      icon="tabler:user"
                      className="w-4 h-4 inline-block -mt-0.5 dark:text-gray-400"
                    />
                    <span className="inline-block">{post.author}</span>
                  </>
                )}
                {post.category && (
                  <>
                    {" "}
                    ·{" "}
                    <Link
                      className="hover:underline inline-block"
                      href={`/category/${post.category.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {post.category}
                    </Link>
                  </>
                )}
                &nbsp;· <ReadingTime content={post.body} />
              </p>

              {/* 向量化状态已移除，因为 post 对象中没有 vectorizationStatus 属性 */}
            </div>

            <div className="px-4 sm:px-6 max-w-3xl mx-auto">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h1 className="text-4xl md:text-5xl font-bold leading-tighter tracking-tighter font-heading flex-grow">
                  {post.title}
                </h1>
                <PostStatus
                  post={post}
                  size="md"
                  className="flex-shrink-0 mt-2"
                  isAdmin={isUserAdmin}
                />
              </div>
            </div>

            {isUserAdmin && (
              <div className="max-w-3xl mx-auto mt-4 px-4 sm:px-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 mb-6 rounded-r-lg">
                  <div className="flex items-center gap-3">
                    <Icon
                      icon="tabler:shield-check"
                      className="w-5 h-5 text-blue-600 dark:text-blue-400"
                    />
                    <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                      管理员视图
                    </span>
                    <div className="ml-auto flex items-center gap-3">
                      {post.draft ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border border-yellow-300 dark:border-yellow-700">
                          草稿
                        </span>
                      ) : post.public === false ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border border-orange-300 dark:border-orange-700">
                          私有
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-300 dark:border-green-700">
                          已发布
                        </span>
                      )}
                      <Link
                        href={`/admin/posts/edit?id=${encodeURIComponent(post.id)}`}
                        className="inline-flex items-center gap-2 px-3 py-1 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-800 hover:bg-blue-200 dark:hover:bg-blue-700 rounded-md transition-colors duration-200"
                        title="编辑文章"
                      >
                        <Icon icon="tabler:edit" className="w-4 h-4" />
                        编辑
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <p className="max-w-3xl mx-auto mt-4 mb-8 px-4 sm:px-6 text-md font-serif font-light text-justify">
              {post.excerpt}
            </p>

            {post.image ? (
              <div className="max-w-full lg:max-w-[900px] mx-auto mb-6">
                {/* biome-ignore lint/performance/noImgElement: Next/Image is not necessary for this use-case */}
                <img
                  src={
                    resolveImagePath(
                      post.image || undefined,
                      (post.dataSource === "local" ? "local" : "webdav") as "local" | "webdav",
                      post.id
                    ) || ""
                  }
                  className="max-w-full mx-auto mb-6 sm:rounded-md bg-gray-400 dark:bg-slate-700 content-image cursor-pointer max-h-[50vh] sm:max-h-[60vh] md:max-w-2xl md:max-h-96 lg:max-h-[506px] xl:max-h-[50vh] h-auto object-contain"
                  alt={post.excerpt || ""}
                  width={900}
                  height={506}
                  loading="eager"
                />
              </div>
            ) : (
              <div className="max-w-3xl mx-auto px-4 sm:px-6">
                <div className="border-t dark:border-slate-700" />
              </div>
            )}
          </header>

          <div className="mx-auto px-6 sm:px-6 max-w-3xl mt-8">
            <MarkdownRenderer
              content={post.body}
              variant="article"
              enableMath={true}
              enableMermaid={true}
              enableCodeFolding={true}
              enableImageLightbox={true}
              maxCodeLines={30}
              previewCodeLines={20}
              articlePath={post.id}
              className="prose prose-md xl:text-lg dark:prose-invert dark:prose-headings:text-slate-300 prose-headings:font-heading prose-headings:leading-tighter prose-headings:tracking-tighter prose-headings:font-bold prose-a:text-primary dark:prose-a:text-blue-400 prose-img:rounded-md prose-img:shadow-lg prose-headings:scroll-mt-[80px] prose-li:my-0"
            />
          </div>

          <div className="mx-auto px-6 sm:px-6 max-w-3xl mt-8">
            {/* 许可证信息 */}
            <ArticleLicense
              author={post.author || SITE.author.name}
              year={new Date(toMsTimestamp(post.publishDate)).getFullYear()}
            />

            {/* 标签单独一行 */}
            <div className="mb-4 mt-6">
              <PostTags tags={post.tags || undefined} className="flex gap-1 flex-wrap" />
            </div>

            {/* 表态和分享在同一行，两端对齐 */}
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <PostReactions postSlug={post.slug} />
              </div>
              <div className="flex items-center">
                <SocialShare
                  url={typeof window !== "undefined" ? window.location.href : ""}
                  text={post.title}
                  className="text-gray-500 dark:text-slate-600"
                />
              </div>
            </div>
          </div>
        </article>

        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <CommentSectionWithProvider postSlug={slug} />
        </div>
      </section>

      <ToBlogLink />
      {relatedPosts && relatedPosts.length > 0 && (
        <RelatedPosts
          posts={relatedPosts.map((p) => ({
            ...p,
            excerpt: p.excerpt ?? undefined,
            category: p.category ?? undefined,
            tags: p.tags ?? undefined,
            author: p.author ?? undefined,
            image: p.image ?? undefined,
          }))}
          currentPostCategory={post.category || undefined}
          currentPostTags={post.tags || undefined}
        />
      )}
    </PageLayout>
  );
}
