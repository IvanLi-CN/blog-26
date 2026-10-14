"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { ArrowUpRight, CircleSlash, RefreshCcw } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { ClippingDetail } from "@/components/memos/ClippingDetail";
import { MemoTypeBadge } from "@/components/memos/MemoTypeBadge";
import { type AdminPreviewMemo, type AdminPreviewPost, adminApi } from "@/lib/admin-api-client";
import { createClippingWebDemoModel } from "@/lib/clipping-web-demo";
import { stripMatchingLeadingTitleHeading } from "@/lib/markdown-utils";
import { getMemoPresentation } from "@/lib/memo-presentation";
import {
  getWebDemoState,
  recordWebDemoMutation,
  WEB_DEMO_ACTION_EVENT,
  WEB_DEMO_CLIPPING_SLUG,
  WEB_DEMO_STATE_EVENT,
  type WebDemoActionDetail,
  type WebDemoState,
} from "@/lib/web-demo-runtime";
import {
  buildMemoPreviewMeta,
  buildPostPreviewMeta,
  buildPreviewHero,
  PreviewArticleShell,
} from "~/components/preview-detail";
import { Button, EmptyState, Spinner } from "~/components/ui";
import { getErrorMessage, PageHeader } from "~/pages/helpers";

export type PreviewPublicPageState = {
  href: string;
  enabled: boolean;
  disabledReason?: string;
  label?: string;
  openInNewTab?: boolean;
};

const isAdminWebDemoBuild = import.meta.env.VITE_WEB_DEMO_BUILD === "true";

function getAdminPreviewWebDemoState(): WebDemoState {
  const state = getWebDemoState(
    { pathname: `/memos/${WEB_DEMO_CLIPPING_SLUG}`, search: window.location.search },
    "public"
  );
  return { ...state, persona: "admin" };
}

function AdminPreviewClippingWebDemo({
  slug,
  memoContent,
  header,
  publicMediaContext,
}: {
  slug: string;
  memoContent: string;
  header: React.ReactNode;
  publicMediaContext: Parameters<typeof ClippingDetail>[0]["publicMediaContext"];
}) {
  const [model] = useState(() =>
    createClippingWebDemoModel(getAdminPreviewWebDemoState(), recordWebDemoMutation)
  );
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const sync = () => {
      model.setState(getAdminPreviewWebDemoState());
      setRevision((current) => current + 1);
    };
    const stateChanged = () => sync();
    const locationChanged = () => sync();
    const action = (event: Event) => {
      const detail = (event as CustomEvent<WebDemoActionDetail>).detail;
      const next = getAdminPreviewWebDemoState();
      if (detail?.action === "reset-state") model.reset(next);
      if (detail?.action === "simulate-save") model.simulateSave();
      if (
        detail?.action === "reset-state" ||
        detail?.action === "refresh-data" ||
        detail?.action === "simulate-save"
      ) {
        sync();
      }
    };
    window.addEventListener(WEB_DEMO_STATE_EVENT, stateChanged);
    window.addEventListener(WEB_DEMO_ACTION_EVENT, action);
    window.addEventListener("popstate", locationChanged);
    return () => {
      window.removeEventListener(WEB_DEMO_STATE_EVENT, stateChanged);
      window.removeEventListener(WEB_DEMO_ACTION_EVENT, action);
      window.removeEventListener("popstate", locationChanged);
    };
  }, [model]);

  const article = model.getArticle();
  return (
    <ClippingDetail
      key={revision}
      slug={slug}
      surface="admin"
      memoContent={memoContent}
      header={header}
      initialArticle={article}
      live
      transport={model.transport}
      initialCanDiscuss={Boolean(article.canDiscuss)}
      publicMediaContext={publicMediaContext}
    />
  );
}

function MemoPreviewClippingDetail({
  memo,
  body,
  header,
}: {
  memo: AdminPreviewMemo;
  body: string;
  header: React.ReactNode;
}) {
  const clipping = memo.clipping;
  if (!clipping) return null;
  const publicMediaContext = {
    kind: "memo" as const,
    slug: memo.slug,
    filePath: memo.filePath || memo.slug,
    assetScope: "admin-preview" as const,
  };
  if (isAdminWebDemoBuild) {
    return (
      <AdminPreviewClippingWebDemo
        slug={memo.slug}
        memoContent={body}
        header={header}
        publicMediaContext={publicMediaContext}
      />
    );
  }
  return (
    <ClippingDetail
      key={memo.slug}
      slug={memo.slug}
      surface="admin"
      memoContent={body}
      header={header}
      initialArticle={{ reading: clipping, source: null, translation: null }}
      live
      initialCanDiscuss
      publicMediaContext={publicMediaContext}
    />
  );
}

export function PreviewChrome({
  title,
  description,
  children,
  publicPage,
  onRefresh,
  refreshing,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  publicPage?: PreviewPublicPageState | undefined;
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
            {publicPage?.enabled ? (
              <Button asChild variant="outline">
                <a
                  href={publicPage.href}
                  {...(publicPage.openInNewTab === false
                    ? {}
                    : { target: "_blank", rel: "noreferrer" })}
                >
                  <ArrowUpRight className="size-4" />
                  {publicPage.label ?? "打开公开页"}
                </a>
              </Button>
            ) : publicPage ? (
              <Button
                variant="outline"
                disabled
                title={publicPage.disabledReason}
                aria-label={publicPage.disabledReason ?? "当前文章尚未公开"}
              >
                <CircleSlash className="size-4" />
                {publicPage.disabledReason ?? "当前文章尚未公开"}
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

export function PostPreviewArticle({ post }: { post: AdminPreviewPost }) {
  const publicPage = post.draft || post.public === false;

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
      leadingControls={
        publicPage ? (
          <div
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-950"
            data-testid="admin-preview-public-state"
          >
            <CircleSlash className="size-3.5" />
            当前文章仍为草稿或未公开，公开页入口已禁用。
          </div>
        ) : null
      }
      publicMediaContext={{
        kind: "post",
        slug: post.slug,
        filePath: post.filePath || post.slug,
        assetScope: "admin-preview",
      }}
    />
  );
}

export function MemoPreviewArticle({ memo }: { memo: AdminPreviewMemo }) {
  const body = stripMatchingLeadingTitleHeading(memo.content || "", memo.title || memo.slug);
  const presentation = getMemoPresentation(memo);
  const clipping = memo.clipping;

  return (
    <PreviewArticleShell
      modeLabel={presentation.kind === "clipping" ? "公开剪藏预览" : "公开 Memo 预览"}
      title={memo.title}
      tags={presentation.tags}
      meta={buildMemoPreviewMeta({
        createdAt: memo.createdAt,
        publishedAt: memo.publishedAt,
        updatedAt: memo.updatedAt,
        isPublic: memo.isPublic,
      })}
      contentType={
        presentation.kind === "clipping" ? <MemoTypeBadge record={memo} surface="admin" /> : null
      }
      bodyTestId="admin-preview-memo-body"
      body={body}
      bodyContent={
        clipping
          ? (header: React.ReactNode) => (
              <MemoPreviewClippingDetail memo={memo} body={body} header={header} />
            )
          : undefined
      }
      articlePath={memo.filePath || memo.slug}
      publicMediaContext={{
        kind: "memo",
        slug: memo.slug,
        filePath: memo.filePath || memo.slug,
        assetScope: "admin-preview",
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
      publicPage={
        query.data
          ? query.data.draft || query.data.public === false
            ? {
                href: `/posts/${slug}`,
                enabled: false,
                disabledReason: "当前文章仍为草稿或未公开",
              }
            : {
                href: `/posts/${slug}`,
                enabled: true,
              }
          : undefined
      }
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
      publicPage={{
        href: `/memos/${slug}`,
        enabled: true,
        label: "打开详情",
        openInNewTab: false,
      }}
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
