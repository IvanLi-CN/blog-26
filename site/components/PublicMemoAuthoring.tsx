"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import { QuickMemoEditModal } from "@/components/memos/QuickMemoEditModal";
import { type QuickMemoData, QuickMemoEditor } from "@/components/memos/QuickMemoEditor";
import Icon from "@/components/ui/Icon";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";

type PublicMemoRecord = {
  id: string;
  slug: string;
  title?: string;
  content: string;
  excerpt?: string;
  isPublic: boolean;
  tags: string[];
  filePath?: string;
  source?: string;
};

type PublicMemoListResponse = {
  items?: PublicMemoRecord[];
  memos?: PublicMemoRecord[];
};

type PublicAuthUser = {
  id: string;
  nickname: string;
  email: string;
  avatarUrl: string;
  isAdmin: boolean;
};

async function readJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload = payload as { error?: string | { message?: string } } | null;
    const message =
      typeof errorPayload?.error === "string"
        ? errorPayload.error
        : errorPayload?.error &&
            typeof errorPayload.error === "object" &&
            typeof errorPayload.error.message === "string"
          ? errorPayload.error.message
          : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function usePublicAuth() {
  const [user, setUser] = useState<PublicAuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(() => {
    setIsLoading(true);
    void readJson<PublicAuthUser | null>(toPublicApiUrl("/api/public/auth/me"))
      .then((nextUser) => {
        setUser(nextUser);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    isAdmin: user?.isAdmin || false,
    isLoading,
    refetch,
  };
}

function buildPreviewHref(slug: string) {
  return toPublicApiUrl(`/admin/preview/memos/${encodeURIComponent(slug)}`);
}

function useHideStaticSnapshot(selector: string, active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") {
      return undefined;
    }

    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const previous = elements.map((element) => element.style.display);
    for (const element of elements) {
      element.style.display = "none";
    }

    return () => {
      elements.forEach((element, index) => {
        element.style.display = previous[index] ?? "";
      });
    };
  }, [active, selector]);
}

function normalizeMemoList(
  payload: PublicMemoListResponse | PublicMemoRecord[] | null | undefined
) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.memos)) {
    return payload.memos;
  }
  return Array.isArray(payload?.items) ? payload.items : [];
}

function PublicMemoList({
  memos,
  emptyMessage,
}: {
  memos: PublicMemoRecord[];
  emptyMessage: string;
}) {
  if (memos.length === 0) {
    return (
      <div className="nature-empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {memos.map((memo) => (
        <article
          key={memo.id || memo.slug}
          className="nature-panel flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--nature-text-soft)]">
              <span className="nature-chip gap-1">
                <Icon name="tabler:bulb" className="h-3.5 w-3.5" />
                Memo
              </span>
              <span
                className={`nature-chip ${memo.isPublic ? "nature-chip-info" : "nature-chip-warn"}`}
              >
                {memo.isPublic ? "Public" : "Draft / Private"}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--nature-text-strong)]">
                {memo.title || memo.slug}
              </h2>
              {memo.excerpt ? (
                <p className="mt-2 text-sm leading-6 text-[color:var(--nature-text-soft)]">
                  {memo.excerpt}
                </p>
              ) : null}
            </div>
            {memo.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {memo.tags.map((tag) => (
                  <span key={`${memo.id}-${tag}`} className="nature-chip">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <a className="nature-button nature-button-outline" href={buildPreviewHref(memo.slug)}>
              预览
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}

export function PublicMemoComposerIsland({
  localSourceEnabled = true,
  localMemoRootPath,
}: {
  localSourceEnabled?: boolean;
  localMemoRootPath?: string;
}) {
  const { isAdmin, isLoading } = usePublicAuth();
  const [memos, setMemos] = useState<PublicMemoRecord[]>([]);
  const [isListLoading, setIsListLoading] = useState(false);
  const [createdMemo, setCreatedMemo] = useState<PublicMemoRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadLiveMemos = useCallback(async () => {
    setIsListLoading(true);
    setErrorMessage(null);
    try {
      const result = await readJson<PublicMemoListResponse>(
        toPublicApiUrl("/api/public/memos?publicOnly=false&limit=50")
      );
      setMemos(normalizeMemoList(result));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void loadLiveMemos();
  }, [isAdmin, loadLiveMemos]);

  const handleSave = useCallback(async (data: QuickMemoData) => {
    setErrorMessage(null);
    try {
      const result = await readJson<PublicMemoRecord>(toPublicApiUrl("/api/public/memos"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(data),
      });
      setCreatedMemo(result);
      setMemos((current) => [result, ...current.filter((memo) => memo.slug !== result.slug)]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, []);

  const adminMemoList = useMemo(() => memos, [memos]);

  if (isLoading || !isAdmin) {
    return null;
  }

  return (
    <section className="mb-8 space-y-4" data-testid="public-memo-composer">
      <div className="nature-panel px-5 py-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
          <Icon
            name="tabler:shield-check"
            className="h-4 w-4 text-[color:var(--nature-accent-strong)]"
          />
          <span>
            当前为管理员视角：这里会直接调用 `/api/public/memos/*`，不再走 `/api/trpc/memos.*`。
          </span>
        </div>
        <QuickMemoEditor
          onSave={handleSave}
          localSourceEnabled={localSourceEnabled}
          localMemoRootPath={localMemoRootPath}
        />
      </div>

      {createdMemo ? (
        <div className="nature-alert nature-alert-success flex flex-wrap items-center justify-between gap-3">
          <span>
            Memo 已创建：<strong>{createdMemo.title || createdMemo.slug}</strong>
            。公开静态页会在下一次站点构建后刷新。
          </span>
          <a
            className="nature-button nature-button-outline"
            href={buildPreviewHref(createdMemo.slug)}
          >
            打开专用预览
          </a>
        </div>
      ) : null}

      <div className="nature-panel px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-[color:var(--nature-text-strong)]">
              管理员实时 Memo 视图
            </p>
            <p className="text-sm text-[color:var(--nature-text-soft)]">
              这里展示最近 50 条 `/api/public/memos/*`
              实时数据，便于管理；完整公开时间线仍保留在下方静态列表中。
            </p>
          </div>
          <button
            type="button"
            className="nature-button nature-button-outline"
            onClick={() => void loadLiveMemos()}
            disabled={isListLoading}
          >
            刷新列表
          </button>
        </div>
        <PublicMemoList
          memos={adminMemoList}
          emptyMessage={isListLoading ? "正在加载实时 Memo 列表…" : "当前没有可管理的 Memo。"}
        />
      </div>

      {errorMessage ? (
        <div className="nature-alert nature-alert-error">
          <span>{errorMessage}</span>
        </div>
      ) : null}
    </section>
  );
}

export function PublicMemoDetailControlsIsland({ slug }: { slug: string }) {
  const { isAdmin, isLoading } = usePublicAuth();
  const [memo, setMemo] = useState<PublicMemoRecord | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useHideStaticSnapshot("[data-public-memo-static-shell]", isAdmin);

  const loadMemo = useCallback(async () => {
    setIsFetching(true);
    setErrorMessage(null);
    try {
      const result = await readJson<PublicMemoRecord>(
        toPublicApiUrl(`/api/public/memos/${encodeURIComponent(slug)}`)
      );
      setMemo(result);
    } catch (error) {
      setMemo(null);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsFetching(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadMemo();
  }, [isAdmin, loadMemo]);

  const handleSave = useCallback(
    async (values: { content: string; isPublic: boolean }) => {
      if (!memo) return;
      setErrorMessage(null);
      try {
        const updated = await readJson<PublicMemoRecord>(
          toPublicApiUrl(`/api/public/memos/${encodeURIComponent(slug)}`),
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
              tags: memo.tags,
            }),
          }
        );
        setMemo(updated);
        window.location.href = buildPreviewHref(updated.slug);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
        throw error;
      }
    },
    [memo, slug]
  );

  const handleDelete = useCallback(async () => {
    if (!memo || isDeleting) return;
    const confirmed = window.confirm(`确认删除 “${memo.title || memo.slug}” 吗？此操作不可撤销。`);
    if (!confirmed) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await readJson<{ success: boolean }>(
        toPublicApiUrl(`/api/public/memos/${encodeURIComponent(slug)}`),
        {
          method: "DELETE",
        }
      );
      window.location.href = toPublicSitePath("/memos");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, memo, slug]);

  if (isLoading || !isAdmin) {
    return null;
  }

  return (
    <section className="mb-6 space-y-4" data-testid="public-memo-detail-controls">
      <div className="nature-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
            <Icon
              name="tabler:shield-check"
              className="h-4 w-4 text-[color:var(--nature-accent-strong)]"
            />
            <span>管理员作者视图</span>
          </div>
          <p className="text-sm text-[color:var(--nature-text-soft)]">
            当前正文来自 `/api/public/memos/:slug` 的实时响应；静态发布快照已为管理员隐藏。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="nature-button nature-button-outline"
            onClick={() => void loadMemo()}
            disabled={isFetching}
          >
            刷新当前内容
          </button>
          <a className="nature-button nature-button-outline" href={buildPreviewHref(slug)}>
            打开专用预览
          </a>
          <button
            type="button"
            className="nature-button"
            onClick={() => setModalOpen(true)}
            disabled={!memo || isFetching}
          >
            编辑 Memo
          </button>
          <button
            type="button"
            className="nature-button nature-button-danger"
            onClick={() => void handleDelete()}
            disabled={!memo || isDeleting}
          >
            删除 Memo
          </button>
        </div>
      </div>

      {memo ? (
        <article className="space-y-6">
          <div className="nature-surface px-5 py-6 sm:px-7 sm:py-7">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--nature-text-soft)]">
              <span
                className={`nature-chip ${memo.isPublic ? "nature-chip-info" : "nature-chip-warn"}`}
              >
                {memo.isPublic ? "Public" : "Draft / Private"}
              </span>
              <span className="nature-chip gap-1">
                <Icon name="tabler:bulb" className="h-3.5 w-3.5" />
                Memo
              </span>
            </div>
            <h1 className="nature-title mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em]">
              {memo.title || memo.slug}
            </h1>
            {memo.tags.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {memo.tags.map((tag) => (
                  <span key={`${memo.id}-${tag}`} className="nature-chip">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="nature-panel px-6 py-7 sm:px-8">
            <MarkdownRenderer
              content={memo.content}
              variant="article"
              enableMath={true}
              enableMermaid={true}
              enableCodeFolding={true}
              removeTags={true}
              rewritePublicSitePaths={true}
              articlePath={memo.filePath || memo.slug}
              contentSource={memo.source === "local" ? "local" : "webdav"}
            />
          </div>
        </article>
      ) : null}

      {errorMessage ? (
        <div className="nature-alert nature-alert-error">
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <QuickMemoEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        memoTitle={memo?.title || memo?.slug}
        initialContent={memo?.content}
        initialIsPublic={memo?.isPublic}
        articlePath={memo?.filePath || memo?.slug}
        contentSource={memo?.source === "local" ? "local" : "webdav"}
        isLoading={isFetching}
      />
    </section>
  );
}
