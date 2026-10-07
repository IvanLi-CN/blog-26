import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicMemoRecord } from "@/public-site/snapshot";
import {
  getWebDemoEnvironment,
  getWebDemoSceneState,
  isWebDemoAbortError,
  WEB_DEMO_ACTION_EVENT,
  WEB_DEMO_STATE_EVENT,
  type WebDemoActionDetail,
  type WebDemoEnvironment,
  type WebDemoSceneState,
  type WebDemoStateChangeDetail,
  waitForWebDemoRequest,
} from "../../src/lib/web-demo-runtime";
import {
  getMemoListWebDemoCursorPage,
  getMemoListWebDemoInitialPageForState,
  MEMO_LIST_WEB_DEMO_DELAY_MS,
} from "../lib/memo-list-web-demo";
import { parseMemoPage, publicMemoCardSchema } from "../lib/memo-pagination";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";
import MemoCard, { type MemoCardRecord } from "./MemoCard";
import { MEMO_PAGE_SIZE } from "./MemoPagination";
import VirtualizedMemoList from "./VirtualizedMemoList";

export type MemoPageDirection = "newer" | "older";

export type MemoPageResponse = {
  memos?: MemoCardRecord[];
  items?: MemoCardRecord[];
  hasMore?: boolean;
  hasPrevious?: boolean;
  nextCursor?: string | null;
  previousCursor?: string | null;
};

export type MemoPageLoader = (input: {
  cursor: string | null;
  direction: MemoPageDirection;
}) => Promise<MemoPageResponse>;

function uniqueMemos(memos: MemoCardRecord[]) {
  const seen = new Set<string>();
  return memos.filter((memo) => {
    const key = memo.id || memo.slug;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function waitForMemoPage(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      const error = new DOMException("The request was aborted.", "AbortError");
      reject(error);
    };
    timer = window.setTimeout(() => {
      cleanup();
      if (signal.aborted) reject(new DOMException("The request was aborted.", "AbortError"));
      else resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export default function MemoTimeline({
  source,
  initialMemos,
  initialHasMore,
  initialNextCursor,
  initialHasNewer = false,
  initialPreviousCursor = null,
  initialError,
  snapshotVersion,
  pageLoader,
  iconMap,
  iconSvgMap,
}: {
  source: "snapshot" | "database" | "demo";
  initialMemos: MemoCardRecord[];
  initialHasMore: boolean;
  initialNextCursor: string | null;
  initialHasNewer?: boolean;
  initialPreviousCursor?: string | null;
  initialError?: string | null;
  snapshotVersion?: string;
  pageLoader?: MemoPageLoader;
  iconMap: Record<string, string | null>;
  iconSvgMap: Record<string, string | null>;
}) {
  const [memos, setMemos] = useState(initialMemos);
  const [hasOlder, setHasOlder] = useState(initialHasMore);
  const [olderCursor, setOlderCursor] = useState(initialNextCursor);
  const [hasNewer, setHasNewer] = useState(initialHasNewer);
  const [newerCursor, setNewerCursor] = useState(initialPreviousCursor);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isLoadingNewer, setIsLoadingNewer] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(initialError ?? null);
  const [newerError, setNewerError] = useState<string | null>(null);
  const [renderedMemos, setRenderedMemos] = useState(0);
  const [demoEnvironment, setDemoEnvironment] = useState<WebDemoEnvironment | null>(null);
  const inFlightRef = useRef({ newer: false, older: false });
  const requestControllersRef = useRef(new Set<AbortController>());
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    if (source !== "demo") return;

    const cancelPendingRequests = () => {
      requestGenerationRef.current += 1;
      for (const controller of requestControllersRef.current) controller.abort();
      requestControllersRef.current.clear();
      inFlightRef.current = { newer: false, older: false };
      setIsLoadingOlder(false);
      setIsLoadingNewer(false);
    };

    const resetFromScene = (sceneState: WebDemoSceneState, environment: WebDemoEnvironment) => {
      cancelPendingRequests();
      setDemoEnvironment(environment);
      setOlderError(null);
      setNewerError(null);
      if (environment.connection === "offline" || sceneState.scene === "memo-network-fault") return;

      const initialPage = getMemoListWebDemoInitialPageForState(sceneState);
      setMemos(initialPage.memos.map(toMemoCardRecord));
      setHasOlder(initialPage.hasMore);
      setOlderCursor(initialPage.nextCursor);
      setHasNewer(initialPage.hasPrevious);
      setNewerCursor(initialPage.previousCursor);
      setIsLoadingOlder(false);
      setIsLoadingNewer(false);
    };

    const syncEnvironment = (environment: WebDemoEnvironment) => {
      cancelPendingRequests();
      setDemoEnvironment(environment);
      setOlderError(null);
      setNewerError(null);
    };

    const handleState = (event: Event) => {
      const detail = (event as CustomEvent<WebDemoStateChangeDetail>).detail;
      if (!detail) return;
      if (detail.changed.includes("scene") || detail.changed.includes("data")) {
        resetFromScene(detail.sceneState, detail.environment);
      } else if (detail.changed.some((key) => ["persona", "connection", "delay"].includes(key))) {
        syncEnvironment(detail.environment);
      } else {
        setDemoEnvironment(detail.environment);
      }
    };
    const handleAction = (event: Event) => {
      const detail = (event as CustomEvent<WebDemoActionDetail>).detail;
      if (detail?.action === "refresh-data")
        resetFromScene(
          getWebDemoSceneState(window.location, "public"),
          getWebDemoEnvironment(window.location, "public")
        );
      if (detail?.action === "reset-state")
        resetFromScene(
          getWebDemoSceneState(window.location, "public"),
          getWebDemoEnvironment(window.location, "public")
        );
    };

    syncEnvironment(getWebDemoEnvironment(window.location, "public"));
    const handlePopState = () => {
      resetFromScene(
        getWebDemoSceneState(window.location, "public"),
        getWebDemoEnvironment(window.location, "public")
      );
    };
    window.addEventListener(WEB_DEMO_STATE_EVENT, handleState);
    window.addEventListener(WEB_DEMO_ACTION_EVENT, handleAction);
    window.addEventListener("popstate", handlePopState);
    return () => {
      cancelPendingRequests();
      window.removeEventListener(WEB_DEMO_STATE_EVENT, handleState);
      window.removeEventListener(WEB_DEMO_ACTION_EVENT, handleAction);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [source]);

  useEffect(() => {
    if (source !== "demo" || memos.length === 0) {
      setRenderedMemos(0);
      return;
    }
    const list = document.querySelector<HTMLElement>('[data-testid="memos-timeline"]');
    if (!list) {
      setRenderedMemos(0);
      return;
    }

    const updateRenderedCount = () => {
      setRenderedMemos(Number(list.dataset.renderedMemos ?? 0));
    };
    updateRenderedCount();
    const observer = new MutationObserver(updateRenderedCount);
    observer.observe(list, { attributes: true, attributeFilter: ["data-rendered-memos"] });
    return () => observer.disconnect();
  }, [memos.length, source]);

  const loadPage = useCallback(
    async (direction: MemoPageDirection, cursor: string | null) => {
      const retryingInitialDatabasePage =
        source === "database" &&
        direction === "older" &&
        cursor === null &&
        memos.length === 0 &&
        Boolean(initialError);
      if ((!cursor && !retryingInitialDatabasePage) || inFlightRef.current[direction]) return;
      const requestVersion = requestGenerationRef.current;
      const controller = new AbortController();
      requestControllersRef.current.add(controller);
      inFlightRef.current[direction] = true;
      if (direction === "newer") {
        setIsLoadingNewer(true);
        setNewerError(null);
      } else {
        setIsLoadingOlder(true);
        setOlderError(null);
      }

      try {
        let payload: unknown;
        if (pageLoader) {
          payload = await pageLoader({ cursor, direction });
        } else if (source === "demo" && import.meta.env.PUBLIC_WEB_DEMO_BUILD === "true") {
          const currentSceneState = getWebDemoSceneState(window.location, "public");
          const currentEnvironment = getWebDemoEnvironment(window.location, "public");
          if (currentSceneState.scene === "memo-network-fault") {
            throw new Error("模拟网络故障：本次请求未发送到真实服务。");
          }
          await waitForWebDemoRequest(currentEnvironment, controller.signal);
          await waitForMemoPage(MEMO_LIST_WEB_DEMO_DELAY_MS, controller.signal);
          const page = getMemoListWebDemoCursorPage(cursor, direction);
          payload = {
            ...page,
            memos: page.memos.map(toMemoCardRecord),
          };
        } else if (source === "demo") {
          throw new Error("Memo list Web Demo requires the Web Demo build.");
        } else if (source === "snapshot") {
          if (direction !== "older") throw new Error("公开快照不支持加载更新的页面。");
          const url = toPublicSitePath(
            `/memos/data/${cursor}.json${snapshotVersion ? `?v=${encodeURIComponent(snapshotVersion)}` : ""}`
          );
          const response = await fetch(url ?? "");
          if (!response.ok) throw new Error(`请求失败（${response.status}）`);
          payload = await response.json();
        } else {
          const params = new URLSearchParams({
            publicOnly: "true",
            limit: String(MEMO_PAGE_SIZE),
            direction,
          });
          if (cursor) params.set("cursor", cursor);
          const response = await fetch(
            toPublicApiUrl(`/api/public/memos?${params.toString()}`) ?? "",
            {
              credentials: "include",
            }
          );
          const result = await response.json().catch(() => null);
          if (!response.ok) throw new Error(`请求失败（${response.status}）`);
          payload = result ?? {};
        }

        const page = parseMemoPage(payload, direction, publicMemoCardSchema);
        if (requestVersion !== requestGenerationRef.current) return;
        if (direction === "newer") {
          setMemos((current) => uniqueMemos([...page.memos, ...current]));
          setHasNewer(page.hasMore);
          setNewerCursor(page.previousCursor);
        } else {
          setMemos((current) => uniqueMemos([...current, ...page.memos]));
          setHasOlder(page.hasMore);
          setOlderCursor(page.nextCursor);
        }
      } catch (error) {
        if (isWebDemoAbortError(error) || requestVersion !== requestGenerationRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        const displayMessage =
          source === "demo" && error instanceof TypeError
            ? "模拟网络故障：本次请求未发送到真实服务。"
            : message;
        if (direction === "newer") setNewerError(displayMessage);
        else setOlderError(displayMessage);
      } finally {
        requestControllersRef.current.delete(controller);
        if (requestVersion === requestGenerationRef.current) {
          inFlightRef.current[direction] = false;
          if (direction === "newer") setIsLoadingNewer(false);
          else setIsLoadingOlder(false);
        }
      }
    },
    [initialError, memos.length, pageLoader, snapshotVersion, source]
  );

  const loadNewer = useCallback(() => loadPage("newer", newerCursor), [loadPage, newerCursor]);
  const loadOlder = useCallback(() => loadPage("older", olderCursor), [loadPage, olderCursor]);
  const retryNewer = useCallback(() => loadPage("newer", newerCursor), [loadPage, newerCursor]);
  const retryOlder = useCallback(() => loadPage("older", olderCursor), [loadPage, olderCursor]);

  return (
    <>
      {source === "demo" ? (
        <p
          className="nature-muted mb-4 text-center text-sm"
          data-testid="memo-list-demo-status"
          aria-live="polite"
        >
          Web Demo · 已加载 {memos.length} / 2,400 条 · 当前挂载 {renderedMemos} 条
          {demoEnvironment?.delay === "slow" ? " · 慢速网络" : ""}
          {demoEnvironment?.delay === "custom" ? ` · +${demoEnvironment.delayMs} ms` : ""}
          {demoEnvironment?.connection === "offline" && (olderError || newerError)
            ? " · 网络故障 · 可重试"
            : ""}
        </p>
      ) : null}
      {memos.length === 0 ? (
        <div className="nature-empty" data-testid="memos-empty">
          <p>
            {isLoadingOlder || isLoadingNewer
              ? "正在加载公开 Memos…"
              : olderError || newerError
                ? "暂时无法加载公开 Memos。"
                : "暂无公开 Memos"}
          </p>
        </div>
      ) : null}
      {source === "snapshot" ? (
        <div data-public-memos-static-list="true">
          <VirtualizedMemoList
            items={memos}
            getKey={(memo) => memo.id || memo.slug}
            renderItem={(memo, _index, isLast) => (
              <MemoCard memo={memo} isLast={isLast} iconMap={iconMap} iconSvgMap={iconSvgMap} />
            )}
            newer={{
              hasMore: hasNewer,
              isLoading: isLoadingNewer,
              error: newerError,
              onLoad: loadNewer,
              onRetry: retryNewer,
            }}
            older={{
              hasMore: hasOlder,
              isLoading: isLoadingOlder,
              error: olderError,
              onLoad: loadOlder,
              onRetry: retryOlder,
            }}
          />
        </div>
      ) : (
        <VirtualizedMemoList
          items={memos}
          getKey={(memo) => memo.id || memo.slug}
          renderItem={(memo, _index, isLast) => (
            <MemoCard
              memo={memo}
              isLast={isLast}
              disablePrefetch={source === "demo"}
              iconMap={iconMap}
              iconSvgMap={iconSvgMap}
            />
          )}
          newer={{
            hasMore: hasNewer,
            isLoading: isLoadingNewer,
            error: newerError,
            onLoad: loadNewer,
            onRetry: retryNewer,
          }}
          older={{
            hasMore: hasOlder,
            isLoading: isLoadingOlder,
            error: olderError,
            onLoad: loadOlder,
            onRetry: retryOlder,
          }}
        />
      )}
    </>
  );
}

export function toMemoCardRecord(memo: PublicMemoRecord): MemoCardRecord {
  return {
    id: memo.id,
    slug: memo.slug,
    title: memo.title,
    excerpt: memo.excerpt,
    tags: memo.tags,
    isPublic: memo.isPublic,
    createdAt: memo.createdAt,
    publishedAt: memo.publishedAt,
    ...(memo.clipping ? { clipping: memo.clipping } : {}),
  };
}
