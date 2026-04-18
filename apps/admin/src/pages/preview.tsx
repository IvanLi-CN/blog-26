"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { ArrowUpRight, Eye, RefreshCcw } from "lucide-react";
import type React from "react";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import { type AdminPreviewMemo, type AdminPreviewPost, adminApi } from "@/lib/admin-api-client";
import { Button, EmptyState, Spinner } from "~/components/ui";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

function PreviewTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground"
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}

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
    <article className="space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
          <Eye className="size-3.5" />
          预览模式
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
          {post.excerpt ? <p className="text-sm text-muted-foreground">{post.excerpt}</p> : null}
        </div>
        {post.tags && post.tags.length > 0 ? <PreviewTags tags={post.tags} /> : null}
      </header>

      <div className="rounded-2xl border border-border bg-background px-5 py-6">
        <MarkdownRenderer
          content={post.body || ""}
          articlePath={post.filePath || post.slug}
          contentSource={post.source === "local" ? "local" : "webdav"}
          enableImageLightbox
          enableMath
          enableMermaid
        />
      </div>
    </article>
  );
}

function MemoPreviewArticle({ memo }: { memo: AdminPreviewMemo }) {
  return (
    <article className="space-y-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
      <header className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
          <Eye className="size-3.5" />
          预览模式
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{memo.title}</h1>
          <p className="text-sm text-muted-foreground">
            {memo.isPublic ? "公开 Memo" : "私有 Memo"} · {memo.updatedAt}
          </p>
        </div>
        {memo.tags && memo.tags.length > 0 ? <PreviewTags tags={memo.tags} /> : null}
      </header>

      <div className="rounded-2xl border border-border bg-background px-5 py-6">
        <MarkdownRenderer
          content={memo.content || ""}
          articlePath={memo.filePath || memo.slug}
          contentSource={memo.source === "local" ? "local" : "webdav"}
          enableImageLightbox
          enableMath
          enableMermaid
        />
      </div>
    </article>
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
      description="使用新的 `/admin/preview/posts/:slug` 契约渲染。"
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
      description="使用新的 `/admin/preview/memos/:slug` 契约渲染。"
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
