"use client";

import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import "./clipping-admin.css";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import Icon from "@/components/ui/Icon";
import type { ClippingReading } from "@/lib/memo-clipping";
import { toPublicApiUrl } from "@/lib/public-runtime-url";

export type ClippingChat = {
  messages: Array<{ id: string; role: "user" | "assistant"; text: string; timestamp: number }>;
  generating: boolean;
  partial: string;
  conversationId?: string | null;
  error?: string | null;
};
export type ClippingArticle = {
  reading: ClippingReading;
  source: string | null;
  translation: string | null;
  content?: string;
  title?: string | null;
  canDiscuss?: boolean;
  processorEnabled?: boolean;
};
export type ClippingTransport = {
  request: <T>(operation: string, body?: unknown) => Promise<T>;
  subscribe: (onSnapshot: (snapshot: ClippingChat) => void, onError: () => void) => () => void;
};
class ClippingApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}
function createTransport(slug: string): ClippingTransport {
  const endpoint = toPublicApiUrl(`/api/public/memos/${encodeURIComponent(slug)}/clipping`);
  return {
    async request<T>(operation: string, body?: unknown): Promise<T> {
      const result = await fetch(`${endpoint}${operation ? `/${operation}` : ""}`, {
        credentials: "include",
        method: body === undefined ? "GET" : "POST",
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
      const data = await result.json();
      if (!result.ok)
        throw new ClippingApiError(data.error ?? "请求失败，请稍后重试。", result.status);
      return data;
    },
    subscribe(onSnapshot, onError) {
      const events = new EventSource(`${endpoint}/chat/events`, { withCredentials: true });
      events.addEventListener("snapshot", (event) => {
        try {
          onSnapshot(JSON.parse((event as MessageEvent).data));
        } catch {
          onError();
        }
      });
      events.onerror = onError;
      return () => events.close();
    },
  };
}
const emptyChat: ClippingChat = { messages: [], generating: false, partial: "" };
const subscribeDesktop = (changed: () => void) => {
  const query = window.matchMedia("(min-width: 1024px)");
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};
const desktopSnapshot = () => window.matchMedia("(min-width: 1024px)").matches;
const serverSnapshot = () => false;

function ChatPanel({
  snapshot,
  draft,
  setDraft,
  send,
  sending,
  error,
  surface,
  scroll,
}: {
  snapshot: ClippingChat;
  draft: string;
  setDraft: (value: string) => void;
  send: () => void;
  sending: boolean;
  error: string | null;
  surface: "public" | "admin";
  scroll: MutableRefObject<number>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const pinned = useRef(scroll.current === 0);
  useLayoutEffect(() => {
    if (container.current) container.current.scrollTop = scroll.current;
  }, [scroll]);
  useEffect(() => {
    if ((snapshot.partial || snapshot.messages.length) && pinned.current && container.current)
      container.current.scrollTop = container.current.scrollHeight;
  }, [snapshot]);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="clipping-chat">
      <div
        ref={container}
        className="clipping-chat-messages min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 [overflow-wrap:anywhere]"
        onScroll={(event) => {
          scroll.current = event.currentTarget.scrollTop;
          pinned.current =
            event.currentTarget.scrollHeight -
              event.currentTarget.scrollTop -
              event.currentTarget.clientHeight <
            50;
        }}
        aria-live="polite"
        aria-relevant="additions text"
      >
        {snapshot.messages.length === 0 ? (
          <p className="nature-muted text-sm leading-7">
            围绕这篇文章提问。回答会引用原文段落，并说明哪些是推断。
          </p>
        ) : null}
        {snapshot.messages.map((message) => (
          <div key={`${message.id}-${message.role}`} className="clipping-chat-message">
            <p className="nature-muted mb-2 text-xs">
              {message.role === "user" ? "你" : "文章助手"}
            </p>
            <MarkdownRenderer
              surface={surface}
              content={message.text}
              variant="memo"
              nofollowExternalLinks
              enableMermaid={false}
            />
          </div>
        ))}
        {snapshot.partial ? (
          <div>
            <p className="nature-muted mb-2 text-xs">文章助手 · 正在回答</p>
            <MarkdownRenderer
              surface={surface}
              content={snapshot.partial}
              variant="memo"
              nofollowExternalLinks
              enableMermaid={false}
            />
          </div>
        ) : null}
        {snapshot.generating && !snapshot.partial ? (
          <p className="nature-muted text-sm" role="status">
            正在阅读相关段落…
          </p>
        ) : null}
      </div>
      {error || snapshot.error ? (
        <p role="alert" className="nature-alert nature-alert-error mx-4 mb-3 text-sm">
          {error ?? snapshot.error}
        </p>
      ) : null}
      <form
        className="shrink-0 border-t border-[color:var(--nature-line)] px-5 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label htmlFor="clipping-chat-draft" className="sr-only">
          向文章助手提问
        </label>
        <textarea
          id="clipping-chat-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          maxLength={10_000}
          className="clipping-chat-input w-full resize-none py-2 text-base"
          placeholder="这篇文章的核心论点是什么？"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="nature-muted text-xs">Ctrl / ⌘ + Enter 发送</span>
          <button
            type="submit"
            className="nature-button nature-button-primary min-h-11 shrink-0"
            disabled={sending || snapshot.generating || !draft.trim()}
          >
            {sending ? "正在提交…" : "发送"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ClippingDetail({
  slug,
  memoContent,
  initialArticle,
  live = false,
  initialCanDiscuss = false,
  transport: providedTransport,
  onTitleChange,
  surface = "public",
  header,
}: {
  slug: string;
  memoContent: string;
  initialArticle: ClippingArticle;
  live?: boolean;
  initialCanDiscuss?: boolean;
  transport?: ClippingTransport;
  onTitleChange?: (title: string | null) => void;
  surface?: "public" | "admin";
  header?: ReactNode;
}) {
  const [transport] = useState(() => providedTransport ?? createTransport(slug));
  const [article, setArticle] = useState(initialArticle);
  const [canDiscuss, setCanDiscuss] = useState(initialCanDiscuss);
  const [snapshot, setSnapshot] = useState<ClippingChat>(emptyChat);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeLanguage, setActiveLanguage] = useState<"source" | "translation">("source");
  const [error, setError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scroll = useRef(0);
  const titleChanged = useRef(onTitleChange);
  titleChanged.current = onTitleChange;
  const readingPositions = useRef<Partial<Record<"source" | "translation", number>>>({});
  const switchingLanguage = useRef(false);
  const pending = useRef<{ requestId: string; text: string } | null>(null);
  const articleRef = useRef(article);
  articleRef.current = article;
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
  const reading = article.reading;
  const reload = useCallback(async () => {
    const next = await transport.request<ClippingArticle>("");
    setArticle(next);
    setCanDiscuss(Boolean(next.canDiscuss));
    if (next.title !== undefined) titleChanged.current?.(next.title);
    return next;
  }, [transport]);
  function switchLanguage(language: "source" | "translation") {
    if (language === activeLanguage) return;
    readingPositions.current[activeLanguage] = window.scrollY;
    switchingLanguage.current = true;
    setActiveLanguage(language);
  }
  useLayoutEffect(() => {
    if (!switchingLanguage.current) return;
    switchingLanguage.current = false;
    const position = readingPositions.current[activeLanguage];
    if (position !== undefined) window.scrollTo({ top: position, behavior: "instant" });
  }, [activeLanguage]);
  useEffect(() => {
    if (!live) return;
    let active = true;
    void reload().catch((error) => {
      if (active) setError(error.message);
    });
    const timer = setInterval(() => {
      void transport
        .request<ClippingArticle>("status")
        .then(async (status) => {
          if (!active) return;
          if (JSON.stringify(status.reading) !== JSON.stringify(articleRef.current.reading))
            await reload();
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [live, reload, transport]);

  const readChat = useCallback(async () => {
    try {
      const next = await transport.request<ClippingChat>("chat");
      setSnapshot(next);
      setChatError(null);
    } catch (error) {
      if (error instanceof ClippingApiError && [401, 403].includes(error.status)) {
        setCanDiscuss(false);
        setSnapshot(emptyChat);
        setDraft("");
        setSheetOpen(false);
      }
      setChatError(error instanceof Error ? error.message : "对话连接中断，请重试。");
    }
  }, [transport]);
  useEffect(() => {
    if (!live || !canDiscuss) return;
    void readChat();
    return transport.subscribe(setSnapshot, () => void readChat());
  }, [live, canDiscuss, readChat, transport]);

  async function send() {
    if (sending || snapshot.generating || !draft.trim()) return;
    const text = draft.trim();
    pending.current =
      pending.current?.text === text ? pending.current : { requestId: crypto.randomUUID(), text };
    setSending(true);
    setChatError(null);
    try {
      await transport.request("chat", pending.current);
      setDraft("");
      pending.current = null;
      await readChat();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "消息未提交，请重试。");
    } finally {
      setSending(false);
    }
  }
  async function operate(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作未完成，请重试。");
    } finally {
      setBusy(false);
    }
  }
  const chat = (
    <ChatPanel
      snapshot={snapshot}
      draft={draft}
      setDraft={setDraft}
      send={() => void send()}
      sending={sending}
      error={chatError}
      surface={surface}
      scroll={scroll}
    />
  );
  const managementActions =
    canDiscuss && live ? (
      <fieldset className="clipping-management-actions min-w-0 border-0 p-0" aria-label="剪藏管理">
        <button
          type="button"
          className="nature-button nature-button-ghost min-h-11"
          disabled={busy}
          onClick={() => void operate(() => transport.request("reprocess", {}))}
        >
          重新处理
        </button>
      </fieldset>
    ) : null;
  return (
    <section
      className={`clipping-detail-layout min-w-0 ${surface === "admin" ? "clipping-admin-surface admin-editor-preview" : ""} ${canDiscuss && desktop ? "" : "clipping-detail-layout-single"}`}
      data-testid="clipping-detail"
      data-clipping-discussion={canDiscuss}
      data-clipping-surface={surface}
    >
      <div className="clipping-reading-column">
        <section
          className="clipping-memo-card nature-panel nature-mobile-reading-surface min-w-0 px-4 py-6 sm:px-8 sm:py-8 [overflow-wrap:anywhere]"
          aria-label="剪藏闪念"
        >
          {header ? <div className="mb-6">{header}</div> : null}
          <div className="clipping-status-toolbar">
            <div role="status" className="nature-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>
                摘要：
                {
                  (
                    {
                      pending: "等待生成",
                      processing: "正在整理",
                      completed: "已完成",
                      failed: "未完成",
                    } as const
                  )[reading.summaryState]
                }
              </span>
              <span>
                译文：
                {
                  (
                    {
                      pending: "等待生成",
                      processing: "正在翻译",
                      completed: "已完成",
                      failed: "未完成",
                    } as const
                  )[reading.translationState]
                }
                {reading.translationState === "processing" && reading.segmentCount
                  ? ` · ${reading.translatedSegments ?? 0}/${reading.segmentCount}`
                  : ""}
              </span>
            </div>
            {managementActions}
          </div>
          {reading.error || error ? (
            <div role="alert" className="nature-alert nature-alert-error mb-5">
              {error ?? reading.error}
              {reading.status === "invalid" ? (
                <p className="mt-2 text-sm">编辑闪念，将第一条非空行改为完整网页链接。</p>
              ) : null}
            </div>
          ) : null}
          {reading.usingPreviousVersion ? (
            <p className="nature-alert mb-5 text-sm">
              正在显示先前保存的阅读版本。该版本来源：
              <a
                href={reading.sourceUrl ?? "#"}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="underline [overflow-wrap:anywhere]"
              >
                {reading.sourceUrl}
              </a>
            </p>
          ) : null}
          {(article.content ?? memoContent) ? (
            <div>
              <MarkdownRenderer
                surface={surface}
                content={article.content ?? memoContent}
                variant="article"
                removeTags
                nofollowExternalLinks
                enableMermaid={false}
              />
            </div>
          ) : null}
          {reading.warning ? <p className="nature-alert mb-5 text-sm">{reading.warning}</p> : null}
        </section>
        <article
          className="clipping-reading-card nature-panel nature-mobile-reading-surface min-w-0 px-4 py-6 sm:px-8 sm:py-8 [overflow-wrap:anywhere]"
          aria-label="剪藏文章"
        >
          <div className="clipping-article-toolbar">
            <fieldset className="min-w-0 border-0 p-0" aria-label="文章语言">
              <div className="clipping-language-switch nature-surface-quiet">
                <button
                  type="button"
                  aria-pressed={activeLanguage === "source"}
                  className="clipping-language-button"
                  onClick={() => switchLanguage("source")}
                >
                  原文
                </button>
                <button
                  type="button"
                  aria-pressed={activeLanguage === "translation"}
                  className="clipping-language-button"
                  onClick={() => switchLanguage("translation")}
                >
                  简体中文译文
                </button>
              </div>
            </fieldset>
            {reading.targetUrl ? (
              <a
                href={reading.targetUrl}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="nature-button nature-button-ghost min-h-11 gap-2"
              >
                打开原网页
                <span aria-hidden="true">
                  <Icon name="tabler:external-link" className="h-4 w-4" />
                </span>
              </a>
            ) : null}
          </div>
          {activeLanguage === "translation" &&
          (reading.sourceTranslationState ?? reading.translationState) !== "completed" ? (
            <p role="status" className="nature-alert mb-5 text-sm">
              全文翻译尚未完成。
              {article.translation
                ? "下面仅显示已保存的部分译文。"
                : "可以先阅读原文；已完成的摘要不会受影响。"}
            </p>
          ) : null}
          <div data-testid="clipping-article-source" hidden={activeLanguage !== "source"}>
            <MarkdownRenderer
              surface={surface}
              content={article.source ?? "原文尚未抓取，请等待处理或重试。"}
              variant="article"
              nofollowExternalLinks
              enableMermaid={false}
            />
          </div>
          <div data-testid="clipping-article-translation" hidden={activeLanguage !== "translation"}>
            <MarkdownRenderer
              surface={surface}
              content={article.translation ?? "译文尚未生成。"}
              variant="article"
              nofollowExternalLinks
              enableMermaid={false}
            />
          </div>
        </article>
      </div>
      {canDiscuss ? (
        desktop ? (
          <aside
            className="clipping-chat-card nature-panel nature-mobile-reading-surface sticky top-6 flex h-[min(80dvh,900px)] min-h-0 min-w-0 flex-col"
            aria-label="文章对话"
          >
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--nature-line)] px-5 py-4">
              <h2 className="font-semibold">文章对话</h2>
            </div>
            {chat}
          </aside>
        ) : (
          <BottomSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title="文章对话"
            surface={surface}
            floatingTrigger
            trigger={
              <button
                type="button"
                className="nature-button fixed right-4 z-40 min-h-11 shadow-lg"
                style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
                data-testid="clipping-open-chat"
              >
                讨论文章
              </button>
            }
          >
            {chat}
          </BottomSheet>
        )
      ) : null}
    </section>
  );
}
