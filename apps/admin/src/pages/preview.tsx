"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { ArrowUpRight, RefreshCcw } from "lucide-react";
import type React from "react";
import { type AdminPreviewMemo, type AdminPreviewPost, adminApi } from "@/lib/admin-api-client";
import { stripMatchingLeadingTitleHeading } from "@/lib/markdown-utils";
import {
  buildMemoPreviewMeta,
  buildPostPreviewMeta,
  buildPreviewHero,
  PreviewArticleShell,
} from "~/components/preview-detail";
import { Button, EmptyState, Spinner } from "~/components/ui";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

function PreviewChrome({
  title,
  description,
  children,
  publicHref,
  onRefresh,
  refreshing,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  publicHref?: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {publicHref ? (
              <Button asChild variant="outline">
                <a href={publicHref} target="_blank" rel="noreferrer">
                  <ArrowUpRight className="size-4" />
                  打开公开页
                </a>
              </Button>
            ) : null}
            <Button variant="outline" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? <Spinner /> : <RefreshCcw className="size-4" />}
              刷新
            </Button>
          </>
        }
      />
      {children}
    </div>
  );
}

function PreviewState({
  isLoading,
  error,
  onRetry,
}: {
  isLoading: boolean;
  error?: unknown;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="预览加载失败"
        description={getErrorMessage(error)}
        action={
          <Button variant="outline" onClick={onRetry}>
            <RefreshCcw className="size-4" />
            重试
          </Button>
        }
      />
    );
  }

  return null;
}

function PostPreviewArticle({ post }: { post: AdminPreviewPost }) {
  return (
    <PreviewArticleShell
      modeLabel="公开文章预览"
      title={post.title}
      description={post.excerpt}
      tags={post.tags}
      meta={buildPostPreviewMeta({
        publishDate: post.publishDate,
        updateDate: post.updateDate,
        author: post.author,
        category: post.category,
        body: post.body,
      })}
      hero={buildPreviewHero(post.image, post.title)}
      bodyTestId="admin-preview-post-body"
      body={post.body || ""}
      articlePath={post.filePath || post.slug}
      publicMediaContext={{
        kind: "post",
        slug: post.slug,
        filePath: post.filePath || post.slug,
      }}
    />
  );
}

function MemoPreviewArticle({ memo }: { memo: AdminPreviewMemo }) {
  const body = stripMatchingLeadingTitleHeading(memo.content || "", memo.title || memo.slug);

  return (
    <PreviewArticleShell
      modeLabel="公开 Memo 预览"
      title={memo.title}
      tags={memo.tags}
      meta={buildMemoPreviewMeta({
        createdAt: memo.createdAt,
        publishedAt: memo.publishedAt,
        updatedAt: memo.updatedAt,
        isPublic: memo.isPublic,
      })}
      bodyTestId="admin-preview-memo-body"
      body={body}
      articlePath={memo.filePath || memo.slug}
      publicMediaContext={{
        kind: "memo",
        slug: memo.slug,
        filePath: memo.filePath || memo.slug,
      }}
    />
  );
}

export function PostPreviewPage() {
  const { slug } = useParams({ from: "/preview/posts/$slug" });
  const query = useQuery({
    queryKey: ["admin-preview-post", slug],
    queryFn: () => adminApi.previewPost(slug),
  });

  return (
    <PreviewChrome
      title="文章预览"
      description="检查文章在公开站中的阅读效果。"
      publicHref={`/posts/${slug}`}
      onRefresh={() => void query.refetch()}
      refreshing={query.isFetching}
    >
      {query.isLoading || query.error ? (
        <PreviewState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <PostPreviewArticle post={query.data} />
      ) : null}
    </PreviewChrome>
  );
}

export function MemoPreviewPage() {
  const { slug } = useParams({ from: "/preview/memos/$slug" });
  const query = useQuery({
    queryKey: ["admin-preview-memo", slug],
    queryFn: () => adminApi.previewMemo(slug),
  });

  return (
    <PreviewChrome
      title="Memo 预览"
      description="检查 Memo 在公开站中的阅读效果。"
      publicHref={`/memos/${slug}`}
      onRefresh={() => void query.refetch()}
      refreshing={query.isFetching}
    >
      {query.isLoading || query.error ? (
        <PreviewState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <MemoPreviewArticle memo={query.data} />
      ) : null}
    </PreviewChrome>
  );
}
