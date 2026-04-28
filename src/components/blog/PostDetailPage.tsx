"use client";

import type { inferRouterOutputs } from "@trpc/server";
import Image from "next/image";
import Link from "next/link";
import { SITE } from "../../config/site";
import { detectContentAnomalies } from "../../lib/content-anomalies";
import { resolveImagePath } from "../../lib/image-utils";
import { trpc } from "../../lib/trpc";
import type { AppRouter } from "../../server/router";
import CommentSectionWithProvider from "../comments/CommentSectionWithProvider";
import { useUserInfo } from "../comments/hooks";
import MarkdownRenderer from "../common/MarkdownRenderer";
import PageLayout from "../common/PageLayout";
import StructuredData from "../seo/StructuredData";
import type { TagIconMap } from "../tag-icons/tag-icon-client";
import Icon from "../ui/Icon";
import ArticleLicense from "./ArticleLicense";
import PostReactions from "./PostReactions";
import PostStatus from "./PostStatus";
import PostTags from "./PostTags";
import ReadingTime from "./ReadingTime";
import RelatedPosts from "./RelatedPosts";
import SocialShare from "./SocialShare";
import ToBlogLink from "./ToBlogLink";
import { resolvePostTiming } from "./time-utils";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type PostGetOutput = RouterOutputs["posts"]["get"];
type PostsRelatedOutput = RouterOutputs["posts"]["related"];

interface PostDetailPageProps {
  slug: string;
  initialPost?: PostGetOutput;
  initialRelatedPosts?: PostsRelatedOutput;
  tagIconMap?: TagIconMap;
  tagIconSvgMap?: Record<string, string | null>;
}

export default function PostDetailPage({
  slug,
  initialPost,
  initialRelatedPosts,
  tagIconMap,
  tagIconSvgMap,
}: PostDetailPageProps) {
  const {
    data: post,
    isLoading,
    error,
  } = trpc.posts.get.useQuery({ slug }, { initialData: initialPost });
  const { data: relatedPosts } = trpc.posts.related.useQuery(
    { slug, limit: 5 },
    { initialData: initialRelatedPosts }
  );
  const { userInfo } = useUserInfo();
  const isUserAdmin = userInfo?.isAdmin || false;

  if (isLoading && !post) {
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

  if (error || !post) {
    return (
      <PageLayout>
        <div className="nature-reading-container py-20 text-center">
          <div className="nature-empty">
            <div className="nature-empty-icon text-2xl">∿</div>
            <h1 className="font-heading text-4xl font-semibold text-[color:var(--nature-text)]">
              文章不存在
            </h1>
            <p className="text-[color:var(--nature-text-soft)]">
              抱歉，您访问的文章不存在或已被删除。
            </p>
            <Link href="/" className="nature-button nature-button-primary">
              返回首页
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  const authorName = post.author?.trim() || SITE.author.name;
  const postForStructuredData = {
    ...post,
    excerpt: post.excerpt ?? undefined,
    image: post.image ?? undefined,
    category: post.category ?? undefined,
    updateDate: post.updateDate ?? undefined,
    author: authorName,
    tags: post.tags ?? undefined,
  };

  const timing = resolvePostTiming(post);
  const publishDateTimeAttr = timing.publishDateTimeAttr ?? undefined;
  const publishTitle = timing.publishTitle ?? undefined;
  const relativePublish = timing.relativePublish;
  const relativeUpdate = timing.relativeUpdate;
  const shouldShowUpdateHint =
    Boolean(isUserAdmin) && Boolean(relativeUpdate) && timing.shouldShowUpdateHint;
  const fallbackLabel = isUserAdmin && timing.fallbackLabel ? timing.fallbackLabel : null;
  const publishDateForLicense = timing.publishDate ?? new Date();
  const anomalies = detectContentAnomalies(post.body || "");

  return (
    <PageLayout>
      <StructuredData post={postForStructuredData} />

      <section className="nature-reading-container py-10 lg:py-14">
        <article>
          <header className="space-y-6">
            <div className="nature-surface px-6 py-7 sm:px-8">
              <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
                <span className="nature-chip nature-chip-info gap-1">
                  <Icon name="tabler:clock" className="h-3.5 w-3.5" />
                  <time dateTime={publishDateTimeAttr} title={publishTitle}>
                    {relativePublish}
                  </time>
                </span>
                {shouldShowUpdateHint && relativeUpdate && (
                  <span className="text-xs italic text-[color:var(--nature-text-faint)]">
                    编辑于 {relativeUpdate}
                  </span>
                )}
                {fallbackLabel && (
                  <span className="text-xs text-[color:var(--nature-danger)]">{fallbackLabel}</span>
                )}
                <span className="nature-chip gap-1">
                  <Icon name="tabler:user" className="h-3.5 w-3.5" />
                  {authorName}
                </span>
                {post.category && (
                  <Link
                    className="nature-chip nature-chip-accent"
                    href={`/category/${post.category.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {post.category}
                  </Link>
                )}
                <span className="nature-chip gap-1">
                  <Icon name="tabler:hourglass" className="h-3.5 w-3.5" />
                  <ReadingTime content={post.body} />
                </span>
              </div>

              <div className="mt-5 flex items-start justify-between gap-4">
                <h1 className="flex-grow font-heading text-4xl font-semibold leading-tight tracking-[-0.05em] text-[color:var(--nature-text)] md:text-5xl">
                  {post.title}
                </h1>
                <PostStatus
                  post={post}
                  size="md"
                  className="mt-1 flex-shrink-0"
                  isAdmin={isUserAdmin}
                />
              </div>

              {isUserAdmin && anomalies.hasInlineDataImages && (
                <div className="mt-4">
                  <span
                    className="nature-chip nature-chip-warning gap-1"
                    title={
                      (anomalies.details || []).join("；") || "检测到异常数据：包含 base64 内嵌图片"
                    }
                  >
                    <Icon name="tabler:alert-triangle" className="h-3.5 w-3.5" />
                    异常数据
                  </span>
                </div>
              )}

              {isUserAdmin && (
                <div className="nature-panel-soft mt-5 flex flex-wrap items-center gap-3 px-4 py-4">
                  <span className="nature-chip nature-chip-info gap-1">
                    <Icon name="tabler:shield-check" className="h-3.5 w-3.5" />
                    管理员视图
                  </span>
                  {post.draft ? (
                    <span className="nature-chip nature-chip-warning">草稿</span>
                  ) : post.public === false ? (
                    <span className="nature-chip nature-chip-danger">私有</span>
                  ) : (
                    <span className="nature-chip nature-chip-success">已发布</span>
                  )}
                  <Link
                    href={`/admin/posts/editor?slug=${encodeURIComponent(post.slug)}`}
                    className="nature-button nature-button-outline ml-auto"
                    title="编辑文章"
                  >
                    <Icon name="tabler:edit" className="h-4 w-4" />
                    编辑
                  </Link>
                </div>
              )}

              {post.excerpt && (
                <p className="nature-muted mt-5 max-w-3xl text-base sm:text-lg">{post.excerpt}</p>
              )}
            </div>

            {post.image ? (
              <div className="overflow-hidden rounded-[2rem] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.78)] p-3 shadow-[0_18px_40px_rgba(8,21,16,0.12)]">
                <Image
                  src={
                    resolveImagePath(
                      post.image || undefined,
                      (post.dataSource === "local" ? "local" : "webdav") as "local" | "webdav",
                      (post.filePath as string | undefined) ||
                        (post.slug ? `blog/${post.slug}.md` : undefined)
                    ) || ""
                  }
                  className="max-h-[60vh] w-full rounded-[1.5rem] object-contain"
                  alt={post.excerpt || ""}
                  width={900}
                  height={506}
                  priority
                />
              </div>
            ) : (
              <div className="nature-divider" />
            )}
          </header>

          <div className="nature-panel mt-8 px-6 py-7 sm:px-8">
            <MarkdownRenderer
              content={post.body}
              variant="article"
              enableMath={true}
              enableMermaid={true}
              enableCodeFolding={true}
              enableImageLightbox={true}
              maxCodeLines={30}
              previewCodeLines={20}
              articlePath={post.filePath || (post.slug ? `blog/${post.slug}.md` : undefined)}
              contentSource={post.dataSource === "local" ? "local" : "webdav"}
              className="nature-prose max-w-none prose-headings:scroll-mt-[90px]"
            />
          </div>

          <div className="nature-panel mt-8 px-6 py-6 sm:px-8">
            <ArticleLicense
              author={post.author || SITE.author.name}
              year={publishDateForLicense.getFullYear()}
            />

            <div className="mt-6">
              <PostTags
                tags={post.tags || undefined}
                className="flex flex-wrap gap-1.5"
                iconMap={tagIconMap}
                iconSvgMap={tagIconSvgMap}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center">
                <PostReactions postSlug={post.slug} />
              </div>
              <div className="flex items-center">
                <SocialShare
                  url={typeof window !== "undefined" ? window.location.href : ""}
                  text={post.title}
                />
              </div>
            </div>
          </div>
        </article>

        <div className="mt-10">
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
            dataSource: "dataSource" in p ? (p as { dataSource?: string }).dataSource : undefined,
          }))}
          currentPostCategory={post.category || undefined}
          currentPostTags={post.tags || undefined}
        />
      )}
    </PageLayout>
  );
}
