"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import { QuickMemoEditModal } from "@/components/memos/QuickMemoEditModal";
import { type QuickMemoData, QuickMemoEditor } from "@/components/memos/QuickMemoEditor";
import Icon from "@/components/ui/Icon";
import { extractTextSummary, stripMatchingLeadingTitleHeading } from "@/lib/markdown-utils";
import { adminMemoRecordSchema, parseMemoPage } from "../lib/memo-pagination";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";
import { MEMO_PAGE_SIZE } from "./MemoPagination";
import VirtualizedMemoList from "./VirtualizedMemoList";

type PublicMemoRecord = {
  id: string;
  slug: string;
  title?: string | null;
  content: string;
  excerpt?: string | null;
  isPublic: boolean;
  tags: string[];
  filePath?: string;
  source?: string;
};

type PublicMemoListResponse = {
  items?: PublicMemoRecord[];
  memos?: PublicMemoRecord[];
  hasMore?: boolean;
  nextCursor?: string | null;
  hasPrevious?: boolean;
  previousCursor?: string | null;
};

function withMemoExcerpt(memo: PublicMemoRecord): PublicMemoRecord {
  return {
    ...memo,
    excerpt: memo.excerpt ?? extractTextSummary(memo.content),
  };
}

function sameMemo(left: PublicMemoRecord, right: PublicMemoRecord) {
  return left.id === right.id || left.slug === right.slug;
}

function sameMemoSnapshot(left: PublicMemoRecord, right: PublicMemoRecord) {
  return (
    (left.title?.trim() || null) === (right.title?.trim() || null) &&
    left.isPublic === right.isPublic &&
    left.tags.join("\u0000") === right.tags.join("\u0000") &&
    left.content === right.content
  );
}

function uniqueMemos(memos: PublicMemoRecord[]) {
  const seen = new Set<string>();
  return memos.filter((memo) => {
    const key = memo.id || memo.slug;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

function usePublicAuth(initialIsAdmin = false) {
  const [user, setUser] = useState<PublicAuthUser | null>(
    initialIsAdmin
      ? { id: "ssr-admin", nickname: "admin", email: "", avatarUrl: "", isAdmin: true }
      : null
  );
  const [isLoading, setIsLoading] = useState(!initialIsAdmin);

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

function normalizeMemoPage(payload: unknown, direction: "newer" | "older") {
  return parseMemoPage(payload, direction, adminMemoRecordSchema, true);
}

function PublicMemoCard({
  memo,
  isLast,
  onEdit,
}: {
  memo: PublicMemoRecord;
  isLast: boolean;
  onEdit: (memo: PublicMemoRecord) => void;
}) {
  return (
    <article
      className="nature-timeline-item nature-mobile-reading-row"
      data-is-last={isLast}
      data-testid="admin-live-memo-card"
      data-id={memo.id}
      data-slug={memo.slug}
      data-source={memo.source ?? "local"}
    >
      <div className="nature-timeline-rail" aria-hidden="true">
        <div className="nature-timeline-node text-[color:var(--nature-secondary)]">
          <Icon name="tabler:bulb" className="h-5 w-5" />
        </div>
        {!isLast ? <div className="nature-timeline-connector" /> : null}
      </div>
      <div className="nature-timeline-content">
        <div className="nature-panel nature-timeline-card px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
            <span className="nature-timeline-type-icon inline-flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(var(--nature-secondary-rgb),0.16)] text-[color:var(--nature-secondary)]">
              <Icon name="tabler:bulb" className="h-3.5 w-3.5" />
            </span>
            <span
              className={`nature-chip ${memo.isPublic ? "nature-chip-info" : "nature-chip-warning"}`}
              data-testid={memo.isPublic ? "public-indicator" : "private-indicator"}
            >
              {memo.isPublic ? "Public" : "Draft / Private"}
            </span>
          </div>
          {memo.title?.trim() ? (
            <h2 className="nature-title text-xl font-semibold">{memo.title}</h2>
          ) : null}
          {memo.excerpt ? (
            <p className="nature-muted mt-3 text-base leading-7">{memo.excerpt}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div
              className="min-w-0 flex flex-1 flex-wrap gap-2"
              data-testid="admin-live-memo-content"
            >
              {memo.tags.map((tag) => (
                <span key={`${memo.id}-${tag}`} className="nature-chip">
                  #{tag}
                </span>
              ))}
            </div>
            <div
              className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto"
              data-testid="admin-live-memo-actions"
            >
              <a
                className="nature-icon-button inline-flex min-h-11 min-w-11 shrink-0 p-0"
                href={buildPreviewHref(memo.slug)}
                aria-label="预览"
                title="预览 Memo"
              >
                <Icon name="tabler:eye" className="h-5 w-5" />
              </a>
              <button
                type="button"
                className="nature-icon-button inline-flex min-h-11 min-w-11 shrink-0 p-0"
                data-testid="admin-live-memo-edit"
                aria-label="编辑 Memo"
                title="编辑 Memo"
                onClick={() => onEdit(memo)}
              >
                <Icon name="tabler:edit" className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PublicMemoComposerIsland({
  localSourceEnabled = true,
  localMemoRootPath,
  initialIsAdmin = false,
  initialMemos = [],
  initialHasMore = false,
  initialNextCursor = null,
  initialHasNewer = false,
  initialPreviousCursor = null,
}: {
  localSourceEnabled?: boolean;
  localMemoRootPath?: string;
  initialIsAdmin?: boolean;
  initialMemos?: PublicMemoRecord[];
  initialHasMore?: boolean;
  initialNextCursor?: string | null;
  initialHasNewer?: boolean;
  initialPreviousCursor?: string | null;
}) {
  const { isAdmin, isLoading } = usePublicAuth(initialIsAdmin);
  const [memos, setMemos] = useState<PublicMemoRecord[]>(initialMemos);
  const [isListLoading, setIsListLoading] = useState(initialIsAdmin && initialMemos.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingNewer, setIsLoadingNewer] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [newerError, setNewerError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialIsAdmin ? initialHasMore : false);
  const [hasNewer, setHasNewer] = useState(initialIsAdmin ? initialHasNewer : false);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialIsAdmin ? initialNextCursor : null
  );
  const [previousCursor, setPreviousCursor] = useState<string | null>(
    initialIsAdmin ? initialPreviousCursor : null
  );
  const [creationFeedback, setCreationFeedback] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editingMemo, setEditingMemo] = useState<PublicMemoRecord | null>(null);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const listRequestId = useRef(0);
  const listMutationVersion = useRef(0);
  const recentCreatedMemos = useRef(new Map<string, PublicMemoRecord>());
  const deferredMemos = useRef<PublicMemoRecord[]>([]);
  const editRequestId = useRef(0);
  const editReturnScrollY = useRef<number | null>(null);
  const loadingAppendCursor = useRef<string | null>(null);
  const pageRequestInFlight = useRef(false);
  const inFlightPageDirection = useRef<"newer" | "older" | null>(null);
  const queuedOppositePage = useRef<{
    cursor: string;
    direction: "newer" | "older";
    append?: boolean;
  } | null>(null);
  const refreshQueuedAfterPage = useRef(false);
  const requestMemoPageRef = useRef<
    | ((request: {
        cursor?: string;
        direction?: "newer" | "older";
        append?: boolean;
      }) => Promise<void>)
    | null
  >(null);
  const [listErrorPhase, setListErrorPhase] = useState<"initial" | "append" | null>(null);

  const requestMemoPage = useCallback(
    async ({
      cursor,
      direction = "older",
      append = false,
    }: {
      cursor?: string;
      direction?: "newer" | "older";
      append?: boolean;
    }) => {
      if (pageRequestInFlight.current) {
        if (!cursor && direction === "older" && !append) {
          refreshQueuedAfterPage.current = true;
        } else if (cursor && direction !== inFlightPageDirection.current) {
          queuedOppositePage.current = { cursor, direction, append };
        }
        return;
      }
      pageRequestInFlight.current = true;
      inFlightPageDirection.current = direction;
      const appendCursor = cursor ?? null;
      if (append && appendCursor && loadingAppendCursor.current === appendCursor) {
        pageRequestInFlight.current = false;
        inFlightPageDirection.current = null;
        return;
      }
      if (append && appendCursor) loadingAppendCursor.current = appendCursor;
      if (!append) loadingAppendCursor.current = null;
      const requestId = ++listRequestId.current;
      const mutationVersion = listMutationVersion.current;
      if (direction === "newer") setNewerError(null);
      else {
        setListError(null);
        setListErrorPhase(null);
      }
      setIsListLoading(direction === "older" && !append);
      setIsLoadingMore(direction === "older" && append);
      setIsLoadingNewer(direction === "newer");

      const params = new URLSearchParams({
        publicOnly: "false",
        limit: String(MEMO_PAGE_SIZE),
        direction,
      });
      if (cursor) params.set("cursor", cursor);

      try {
        const result = await readJson<PublicMemoListResponse>(
          toPublicApiUrl(`/api/public/memos?${params.toString()}`)
        );
        if (requestId !== listRequestId.current) return;
        if (mutationVersion !== listMutationVersion.current) return;
        const page = normalizeMemoPage(result, direction);
        const serverMemos = page.memos.map((memo) => {
          const createdEntry = Array.from(recentCreatedMemos.current.entries()).find(
            ([, created]) => sameMemo(created, memo)
          );
          if (!createdEntry) return withMemoExcerpt(memo);
          if (sameMemoSnapshot(createdEntry[1], memo)) {
            recentCreatedMemos.current.delete(createdEntry[0]);
            return withMemoExcerpt(memo);
          }
          return createdEntry[1];
        });

        if (direction === "newer") {
          setMemos((current) => uniqueMemos([...serverMemos, ...current]));
          setHasNewer(page.hasMore);
          setPreviousCursor(page.previousCursor);
        } else if (!append) {
          const missingCreated = Array.from(recentCreatedMemos.current.values()).reverse();
          const combined = uniqueMemos([
            ...missingCreated,
            ...serverMemos.filter(
              (memo) => !missingCreated.some((created) => sameMemo(created, memo))
            ),
          ]);
          const visible = combined.slice(0, MEMO_PAGE_SIZE);
          deferredMemos.current = combined.slice(MEMO_PAGE_SIZE);
          setMemos(visible);
          setHasMore(page.hasMore || deferredMemos.current.length > 0);
          setHasNewer(page.hasPrevious);
          setPreviousCursor(page.previousCursor);
        } else {
          const continuation = [...deferredMemos.current, ...serverMemos];
          deferredMemos.current = [];
          setMemos((current) => uniqueMemos([...current, ...continuation]));
          setHasMore(page.hasMore);
          setHasNewer(page.hasPrevious);
          setPreviousCursor(page.previousCursor);
        }
        if (direction === "older") setNextCursor(page.nextCursor);
      } catch (error) {
        if (
          requestId === listRequestId.current &&
          mutationVersion === listMutationVersion.current
        ) {
          const message = error instanceof Error ? error.message : String(error);
          if (direction === "newer") setNewerError(message);
          else {
            setListError(message);
            setListErrorPhase(append ? "append" : "initial");
          }
        }
      } finally {
        pageRequestInFlight.current = false;
        inFlightPageDirection.current = null;
        if (append && appendCursor && loadingAppendCursor.current === appendCursor) {
          loadingAppendCursor.current = null;
        }
        const isCurrentRequest = requestId === listRequestId.current;
        const shouldRefresh = isCurrentRequest && refreshQueuedAfterPage.current;
        refreshQueuedAfterPage.current = false;
        const queuedPage = isCurrentRequest ? queuedOppositePage.current : null;
        queuedOppositePage.current = null;
        if (isCurrentRequest) {
          setIsListLoading(false);
          setIsLoadingMore(false);
          setIsLoadingNewer(false);
        }
        if (shouldRefresh) void requestMemoPageRef.current?.({});
        else if (isCurrentRequest && queuedPage) {
          void requestMemoPageRef.current?.(queuedPage);
        }
      }
    },
    []
  );
  requestMemoPageRef.current = requestMemoPage;

  useEffect(() => {
    if (!isAdmin) return;
    if (initialIsAdmin && initialMemos.length > 0) return;
    void requestMemoPage({});
    return () => {
      listRequestId.current += 1;
    };
  }, [initialIsAdmin, initialMemos.length, isAdmin, requestMemoPage]);

  const refreshList = useCallback(() => {
    void requestMemoPage({});
  }, [requestMemoPage]);

  const handleSave = useCallback(
    async (data: QuickMemoData) => {
      setCreationFeedback(null);
      const result = await readJson<PublicMemoRecord>(toPublicApiUrl("/api/public/memos"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const createdMemo = withMemoExcerpt(result);
      recentCreatedMemos.current.set(createdMemo.id || createdMemo.slug, createdMemo);
      listMutationVersion.current += 1;
      setCreationFeedback(
        data.isPublic
          ? "公开 Memo 已保存；公开时间线将在下次发布后更新。"
          : "私有 Memo 已保存，仅管理员可见。"
      );
      setHasMore(false);
      setHasNewer(false);
      deferredMemos.current = [];
      setMemos((current) =>
        [createdMemo, ...current.filter((memo) => !sameMemo(memo, createdMemo))].slice(
          0,
          MEMO_PAGE_SIZE
        )
      );
      setNextCursor(null);
      setPreviousCursor(null);
      void requestMemoPage({});
    },
    [requestMemoPage]
  );

  const handleEdit = useCallback(async (memo: PublicMemoRecord) => {
    const requestId = ++editRequestId.current;
    editReturnScrollY.current = window.scrollY;
    setEditingSlug(memo.slug);
    setEditingMemo(null);
    setIsEditLoading(true);
    setEditError(null);
    try {
      const fullMemo = await readJson<PublicMemoRecord>(
        toPublicApiUrl(`/api/public/memos/${encodeURIComponent(memo.slug)}`)
      );
      if (requestId === editRequestId.current) setEditingMemo(fullMemo);
    } catch (error) {
      if (requestId === editRequestId.current) {
        setEditError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (requestId === editRequestId.current) setIsEditLoading(false);
    }
  }, []);

  const closeEdit = useCallback(() => {
    const returnScrollY = editReturnScrollY.current;
    editRequestId.current += 1;
    editReturnScrollY.current = null;
    setEditingSlug(null);
    setEditingMemo(null);
    setIsEditLoading(false);
    setEditError(null);
    if (returnScrollY !== null) {
      window.requestAnimationFrame(() => {
        window.scrollTo(0, returnScrollY);
        window.requestAnimationFrame(() => window.scrollTo(0, returnScrollY));
      });
    }
  }, []);

  const saveEditedMemo = useCallback(
    async (values: { content: string; isPublic: boolean }) => {
      if (!editingMemo || !editingSlug) throw new Error("Memo 尚未加载完成，请重试。");
      setEditError(null);
      setIsEditSaving(true);
      try {
        const updated = await readJson<PublicMemoRecord>(
          toPublicApiUrl(`/api/public/memos/${encodeURIComponent(editingSlug)}`),
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: editingMemo.id,
              content: values.content,
              isPublic: values.isPublic,
              title: editingMemo.title ?? "",
              tags: editingMemo.tags,
            }),
          }
        );
        const updatedMemo = withMemoExcerpt({
          ...editingMemo,
          ...updated,
          excerpt: extractTextSummary(updated.content),
        });
        listMutationVersion.current += 1;
        setEditingMemo(updatedMemo);
        setMemos((current) =>
          current.map((memo) => (sameMemo(memo, updatedMemo) ? { ...memo, ...updatedMemo } : memo))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setEditError(message);
        throw error;
      } finally {
        setIsEditSaving(false);
      }
    },
    [editingMemo, editingSlug]
  );

  const isListBusy = isListLoading || isLoadingMore || isLoadingNewer;
  const emptyMessage = isListLoading
    ? "正在加载实时 Memo 列表…"
    : listError
      ? "暂时无法加载实时 Memo。"
      : "当前没有可管理的 Memo。";

  const loadNewerMemoPage = useCallback(() => {
    if (previousCursor) {
      return requestMemoPage({ cursor: previousCursor, direction: "newer" });
    }
  }, [previousCursor, requestMemoPage]);

  const loadNextMemoPage = useCallback(async () => {
    if (nextCursor) {
      await requestMemoPage({ cursor: nextCursor, append: true });
      return;
    }
    if (deferredMemos.current.length > 0) {
      setMemos((current) => uniqueMemos([...current, ...deferredMemos.current]));
      deferredMemos.current = [];
      setHasMore(false);
    }
  }, [nextCursor, requestMemoPage]);

  const retryMemoPage = useCallback(() => {
    if (listErrorPhase === "append" && nextCursor) {
      return requestMemoPage({ cursor: nextCursor, append: true });
    }
    return requestMemoPage({});
  }, [listErrorPhase, nextCursor, requestMemoPage]);
  const retryNewerMemoPage = useCallback(() => {
    if (previousCursor) {
      return requestMemoPage({ cursor: previousCursor, direction: "newer" });
    }
  }, [previousCursor, requestMemoPage]);

  if (isLoading || !isAdmin) {
    return null;
  }

  return (
    <section
      className="mb-8 space-y-4 max-[374px]:mb-6 max-[374px]:space-y-3"
      data-testid="public-memo-composer"
    >
      <div className="flex items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
        <Icon
          name="tabler:shield-check"
          className="h-4 w-4 text-[color:var(--nature-accent-strong)]"
        />
        <span>管理员模式</span>
      </div>
      <QuickMemoEditor
        onSave={handleSave}
        localSourceEnabled={localSourceEnabled}
        localMemoRootPath={localMemoRootPath}
        className="mb-0 sm:mb-0"
      />

      {creationFeedback ? (
        <div className="nature-alert nature-alert-success" role="status" aria-live="polite">
          <span>{creationFeedback}</span>
        </div>
      ) : null}

      <section
        aria-labelledby="admin-live-memos-heading"
        className="mt-8 max-[374px]:mt-6"
        data-testid="admin-live-memo-list"
      >
        <header className="mb-4 max-[374px]:mb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h2
                id="admin-live-memos-heading"
                className="text-base font-semibold text-[color:var(--nature-text)]"
              >
                实时 Memo
              </h2>
              <p className="text-sm text-[color:var(--nature-text-soft)]">
                当前已保存内容；公开时间线仍展示上次发布的快照。
              </p>
            </div>
            <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
              <p className="text-sm text-[color:var(--nature-text-soft)]" aria-live="polite">
                {isListBusy ? "正在更新列表…" : `${memos.length} 条已显示`}
              </p>
              <button
                type="button"
                className="nature-button nature-button-outline min-h-11 gap-2 px-3 sm:min-h-9"
                onClick={refreshList}
                disabled={isListBusy}
              >
                <Icon name="tabler:refresh" className="h-4 w-4" />
                刷新列表
              </button>
            </div>
          </div>
        </header>

        {memos.length === 0 ? (
          <div className="nature-empty">
            <p>{emptyMessage}</p>
          </div>
        ) : null}
        <VirtualizedMemoList
          items={memos}
          getKey={(memo) => memo.id || memo.slug}
          testId="admin-live-memo-list-items"
          renderItem={(memo, _index, isLast) => (
            <PublicMemoCard memo={memo} isLast={isLast} onEdit={(item) => void handleEdit(item)} />
          )}
          newer={{
            hasMore: hasNewer,
            isLoading: isLoadingNewer,
            error: newerError,
            onLoad: loadNewerMemoPage,
            onRetry: retryNewerMemoPage,
          }}
          older={{
            hasMore,
            isLoading: isLoadingMore,
            error: listError,
            onLoad: loadNextMemoPage,
            onRetry: retryMemoPage,
          }}
          sentinelTestIds={{
            newer: "admin-memo-pagination-sentinel-newer",
            older: "admin-memo-pagination-sentinel",
          }}
        />
      </section>

      <QuickMemoEditModal
        open={Boolean(editingSlug)}
        onClose={closeEdit}
        onSave={saveEditedMemo}
        memoTitle={editingMemo?.title ?? undefined}
        initialContent={editingMemo?.content ?? ""}
        initialIsPublic={editingMemo?.isPublic ?? true}
        articlePath={editingMemo?.filePath ?? (editingSlug ? `${editingSlug}.md` : "")}
        isLoading={isEditLoading}
        isSaving={isEditSaving}
        errorMessage={editError ?? undefined}
      />
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
      window.location.href = toPublicSitePath("/memos") ?? "/memos";
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, memo, slug]);

  const detailBody = memo ? stripMatchingLeadingTitleHeading(memo.content, memo.title) : "";

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
            <span>管理员模式</span>
          </div>
          <p className="text-sm text-[color:var(--nature-text-soft)]">
            当前显示最新管理员内容；公开页面显示最近发布版本。
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
            data-testid="admin-live-memo-delete"
            onClick={() => void handleDelete()}
            disabled={!memo || isDeleting}
          >
            删除 Memo
          </button>
        </div>
      </div>

      {memo ? (
        <article>
          <div className="nature-panel px-4 py-7 sm:px-8" data-testid="public-memo-detail-card">
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
            {memo.title?.trim() ? (
              <h1 className="nature-title mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em]">
                {memo.title}
              </h1>
            ) : null}
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

          <div className="nature-panel px-4 py-7 sm:px-8" data-testid="public-memo-detail-body">
            <MarkdownRenderer
              content={detailBody}
              variant="article"
              enableMath={true}
              enableMermaid={true}
              enableCodeFolding={true}
              removeTags={true}
              rewritePublicSitePaths={true}
              articlePath={memo.filePath ?? ""}
              contentSource="local"
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
        memoTitle={memo?.title ?? undefined}
        initialContent={memo?.content}
        initialIsPublic={memo?.isPublic}
        articlePath={memo?.filePath ?? ""}
        contentSource="local"
        isLoading={isFetching}
      />
    </section>
  );
}
