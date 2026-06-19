"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { ArrowUpRight, PencilLine, RefreshCcw, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useState } from "react";
import { QuickMemoEditModal } from "@/components/memos/QuickMemoEditModal";
import { type AdminPreviewMemo, type AdminPreviewPost, adminApi } from "@/lib/admin-api-client";
import { stripMatchingLeadingTitleHeading } from "@/lib/markdown-utils";
import { toPublicApiUrl, toPublicSitePath } from "@/lib/public-runtime-url";
import {
  buildMemoPreviewMeta,
  buildPostPreviewMeta,
  buildPreviewHero,
  PreviewArticleShell,
} from "~/components/preview-detail";
import { Alert, Button, EmptyState, Spinner } from "~/components/ui";
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

type PublicMemoMutationResult = {
  id: string;
  slug: string;
  title?: string;
  content: string;
  isPublic: boolean;
  tags?: string[];
  attachments?: Array<{ filename?: string; path: string; isImage?: boolean }>;
  createdAt?: string;
  publishedAt?: string;
  updatedAt?: string;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string | { message?: string } }
    | T
    | null;
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : typeof payload === "object" &&
            payload &&
            "error" in payload &&
            payload.error &&
            typeof payload.error === "object" &&
            typeof payload.error.message === "string"
          ? payload.error.message
          : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function buildPreviewMemoNextState(
  current: AdminPreviewMemo,
  result: PublicMemoMutationResult,
  content: string
): AdminPreviewMemo {
  return {
    ...current,
    slug: result.slug || current.slug,
    title: result.title || current.title,
    content,
    isPublic: result.isPublic,
    tags: result.tags ?? current.tags,
    attachments: result.attachments ?? current.attachments,
    createdAt: result.createdAt ?? current.createdAt,
    publishedAt: result.publishedAt ?? current.publishedAt,
    updatedAt: result.updatedAt ?? current.updatedAt,
  };
}

function MemoPreviewControls({
  memo,
  onMemoChange,
  onRefresh,
}: {
  memo: AdminPreviewMemo;
  onMemoChange: (next: AdminPreviewMemo) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      await onRefresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  const handleSave = useCallback(
    async (values: { content: string; isPublic: boolean }) => {
      setIsSaving(true);
      setErrorMessage(null);
      try {
        const result = await readJson<PublicMemoMutationResult>(
          toPublicApiUrl(`/api/public/memos/${encodeURIComponent(memo.slug)}`),
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              id: memo.id,
              content: values.content,
              isPublic: values.isPublic,
              title: memo.title,
              tags: memo.tags ?? [],
              attachments: memo.attachments ?? [],
            }),
          }
        );
        onMemoChange(buildPreviewMemoNextState(memo, result, values.content));
        await onRefresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [memo, onMemoChange, onRefresh]
  );

  const handleDelete = useCallback(async () => {
    if (isDeleting) return;
    const confirmed = window.confirm(`确认删除 “${memo.title || memo.slug}” 吗？此操作不可撤销。`);
    if (!confirmed) return;

    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await readJson<{ success: boolean }>(
        toPublicApiUrl(`/api/public/memos/${encodeURIComponent(memo.slug)}`),
        {
          method: "DELETE",
        }
      );
      window.location.href = toPublicSitePath("/memos") ?? "/memos";
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, memo.slug, memo.title]);

  return (
    <>
      <section className="space-y-3" data-testid="public-memo-detail-controls">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-border/56 bg-muted/46 px-4 py-3 shadow-inner shadow-shadow-inset">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">作者操作</p>
            <p className="text-sm text-muted-foreground">
              当前路由仍是后台 preview，只保留作者编辑与删除操作，不再重复渲染详情标题。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing || isSaving || isDeleting}
            >
              {isRefreshing ? <Spinner /> : <RefreshCcw className="size-4" />}
              刷新当前内容
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              disabled={isRefreshing || isSaving || isDeleting}
            >
              <PencilLine className="size-4" />
              编辑 Memo
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="admin-live-memo-delete"
              onClick={() => void handleDelete()}
              disabled={isRefreshing || isSaving || isDeleting}
            >
              {isDeleting ? <Spinner className="text-current" /> : <Trash2 className="size-4" />}
              删除 Memo
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <div data-testid="admin-preview-memo-controls-error">
            <Alert tone="danger" className="w-full">
              {errorMessage}
            </Alert>
          </div>
        ) : null}
      </section>

      <QuickMemoEditModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        memoTitle={memo.title}
        initialContent={memo.content}
        initialIsPublic={memo.isPublic}
        articlePath={memo.filePath || memo.slug}
        contentSource="local"
        isSaving={isSaving}
        errorMessage={errorMessage ?? undefined}
      />
    </>
  );
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

function MemoPreviewArticle({
  memo,
  onMemoChange,
  onRefresh,
}: {
  memo: AdminPreviewMemo;
  onMemoChange: (next: AdminPreviewMemo) => void;
  onRefresh: () => Promise<unknown>;
}) {
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
      leadingControls={
        <MemoPreviewControls memo={memo} onMemoChange={onMemoChange} onRefresh={onRefresh} />
      }
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
  const [overrideMemo, setOverrideMemo] = useState<AdminPreviewMemo | null>(null);

  const memo = overrideMemo && overrideMemo.slug === slug ? overrideMemo : (query.data ?? null);

  const handleRefresh = useCallback(async () => {
    const result = await query.refetch();
    if (result.data) {
      setOverrideMemo(result.data);
    }
    return result;
  }, [query]);

  return (
    <PreviewChrome
      title="Memo 预览"
      description="检查 Memo 在公开站中的阅读效果。"
      publicHref={`/memos/${slug}`}
      onRefresh={() => void handleRefresh()}
      refreshing={query.isFetching}
    >
      {query.isLoading || query.error ? (
        <PreviewState
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => void handleRefresh()}
        />
      ) : memo ? (
        <MemoPreviewArticle memo={memo} onMemoChange={setOverrideMemo} onRefresh={handleRefresh} />
      ) : null}
    </PreviewChrome>
  );
}
