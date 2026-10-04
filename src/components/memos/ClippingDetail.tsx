"use client";

import {
  type MutableRefObject,
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
import type { ClippingReading } from "@/lib/memo-clipping";
import { toPublicApiUrl } from "@/lib/public-runtime-url";

export type ClippingChat = {
  messages: Array<{ id: string; role: "user" | "assistant"; text: string; timestamp: number }>;
  generating: boolean;
  partial: string;
  conversationId?: string | null;
  historical?: boolean;
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
type Version = {
  id: string;
  targetUrl: string;
  createdAt: number;
  status: string;
  summaryState: string;
  translationState: string;
  warning: string | null;
  error: string | null;
};
type History = {
  versions: Version[];
  currentVersionId: string | null;
  previousConversations: Array<{ targetUrl: string; conversationId: string }>;
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
  historical,
  surface,
  scroll,
}: {
  snapshot: ClippingChat;
  draft: string;
  setDraft: (value: string) => void;
  send: () => void;
  sending: boolean;
  error: string | null;
  historical: boolean;
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
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 [overflow-wrap:anywhere]"
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
          <div
            key={`${message.id}-${message.role}`}
            className={
              message.role === "user" ? "border-l-2 border-[color:var(--nature-accent)] pl-3" : ""
            }
          >
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
      {historical ? (
        <p className="nature-muted border-t border-[color:var(--nature-line)] px-4 py-4 text-sm">
          这是先前目标的对话，当前仅供回看。
        </p>
      ) : (
        <form
          className="shrink-0 border-t border-[color:var(--nature-line)] px-4 py-3"
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
            className="nature-input w-full resize-none rounded-xl border border-[color:var(--nature-line)] bg-[color:var(--nature-surface)] px-3 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nature-accent)]"
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
              className="nature-button min-h-11"
              disabled={sending || snapshot.generating || !draft.trim()}
            >
              {sending ? "正在提交…" : "发送"}
            </button>
          </div>
        </form>
      )}
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
}: {
  slug: string;
  memoContent: string;
  initialArticle: ClippingArticle;
  live?: boolean;
  initialCanDiscuss?: boolean;
  transport?: ClippingTransport;
  onTitleChange?: (title: string | null) => void;
  surface?: "public" | "admin";
}) {
  const [transport] = useState(() => providedTransport ?? createTransport(slug));
  const [article, setArticle] = useState(initialArticle);
  const [canDiscuss, setCanDiscuss] = useState(initialCanDiscuss);
  const [snapshot, setSnapshot] = useState<ClippingChat>(emptyChat);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<History | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<{
    version: Version;
    source: string | null;
    summary: string | null;
    translation: string | null;
  } | null>(null);
  const [historicalConversation, setHistoricalConversation] = useState<string | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<"source" | "translation">("source");
  const [error, setError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scroll = useRef(0);
  const historyTrigger = useRef<HTMLButtonElement>(null);
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
      const next = await transport.request<ClippingChat>(
        `chat${historicalConversation ? `?conversationId=${encodeURIComponent(historicalConversation)}` : ""}`
      );
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
  }, [historicalConversation, transport]);
  useEffect(() => {
    if (!live || !canDiscuss) return;
    void readChat();
    if (historicalConversation) return;
    return transport.subscribe(setSnapshot, () => void readChat());
  }, [live, canDiscuss, historicalConversation, readChat, transport]);

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
  async function loadHistory() {
    setHistoryOpen(true);
    setError(null);
    try {
      setHistory(await transport.request<History>("history"));
    } catch (error) {
      setError(error instanceof Error ? error.message : "历史无法读取。");
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
      historical={Boolean(historicalConversation)}
      scroll={scroll}
    />
  );
  const controls = (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {reading.targetUrl ? (
        <a
          href={reading.targetUrl}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="nature-button nature-button-outline min-h-11"
        >
          打开原网页 ↗
        </a>
      ) : null}
      {canDiscuss && live ? (
        <>
          <button
            type="button"
            className="nature-button nature-button-outline min-h-11"
            disabled={busy}
            onClick={() => void operate(() => transport.request("reprocess", {}))}
          >
            重新处理
          </button>
          <button
            type="button"
            className="nature-button nature-button-outline min-h-11"
            onClick={() => void loadHistory()}
            ref={historyTrigger}
          >
            版本历史
          </button>
        </>
      ) : null}
    </div>
  );
  return (
    <section
      className={`min-w-0 ${surface === "admin" ? "clipping-admin-surface admin-editor-preview" : ""} ${canDiscuss && desktop ? "grid grid-cols-[minmax(0,1fr)_minmax(300px,36%)] items-start gap-7" : ""}`}
      data-testid="clipping-detail"
      data-clipping-discussion={canDiscuss}
    >
      <div className="min-w-0 [overflow-wrap:anywhere]">
        {controls}
        <div role="status" className="nature-muted mb-5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
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
          <div className="mb-8">
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
        <fieldset
          className="mb-6 flex flex-wrap items-center gap-2 border-b border-[color:var(--nature-line)] pb-3"
          aria-label="文章语言"
        >
          <button
            type="button"
            aria-pressed={activeLanguage === "source"}
            className={`nature-button min-h-11 ${activeLanguage === "source" ? "" : "nature-button-outline"}`}
            onClick={() => switchLanguage("source")}
          >
            原文
          </button>
          <button
            type="button"
            aria-pressed={activeLanguage === "translation"}
            className={`nature-button min-h-11 ${activeLanguage === "translation" ? "" : "nature-button-outline"}`}
            onClick={() => switchLanguage("translation")}
          >
            简体中文译文
          </button>
        </fieldset>
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
      </div>
      {canDiscuss ? (
        desktop ? (
          <aside
            className="sticky top-6 flex h-[min(80dvh,900px)] min-h-0 min-w-0 flex-col border-l border-[color:var(--nature-line)]"
            aria-label="文章对话"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3">
              <h2 className="font-semibold">文章对话</h2>
              {historicalConversation ? (
                <button
                  type="button"
                  className="nature-button nature-button-outline min-h-11"
                  onClick={() => setHistoricalConversation(null)}
                >
                  当前对话
                </button>
              ) : null}
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
            {historicalConversation ? (
              <button
                type="button"
                className="nature-button nature-button-outline mx-4 mb-2 min-h-11"
                onClick={() => setHistoricalConversation(null)}
              >
                返回当前对话
              </button>
            ) : null}
            {chat}
          </BottomSheet>
        )
      ) : null}
      {canDiscuss ? (
        <BottomSheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          title="剪藏版本历史"
          surface={surface}
          returnFocusRef={historyTrigger}
          trigger={
            <button type="button" className="sr-only" tabIndex={-1}>
              查看版本历史
            </button>
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {history?.versions.toReversed().map((version) => (
              <div
                key={version.id}
                className="border-b border-[color:var(--nature-line)] py-4 [overflow-wrap:anywhere]"
              >
                <p className="font-medium">
                  {new Date(version.createdAt).toLocaleString("zh-CN")}
                  {history.currentVersionId === version.id ? " · 当前读取" : ""}
                </p>
                <p className="nature-muted mt-1 text-sm">{version.targetUrl}</p>
                <p className="nature-muted mt-1 text-sm">
                  {version.status === "completed"
                    ? "原文、摘要与译文已完成"
                    : (version.error ?? "处理中或部分完成")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="nature-button nature-button-outline min-h-11"
                    onClick={() =>
                      void operate(async () =>
                        setSelectedVersion(
                          await transport.request(
                            `history?versionId=${encodeURIComponent(version.id)}`
                          )
                        )
                      )
                    }
                  >
                    查看此版本
                  </button>
                  <button
                    type="button"
                    className="nature-button nature-button-outline min-h-11"
                    disabled={busy || version.summaryState !== "completed"}
                    onClick={() => {
                      const replaceTarget = version.targetUrl !== reading.targetUrl;
                      if (
                        replaceTarget &&
                        !window.confirm(
                          "此版本来自其他网页。确认替换当前剪藏目标，并建立该目标的新对话？"
                        )
                      )
                        return;
                      void operate(() =>
                        transport.request("restore", { versionId: version.id, replaceTarget })
                      );
                    }}
                  >
                    {version.targetUrl !== reading.targetUrl ? "替换目标并恢复" : "恢复此版本"}
                  </button>
                </div>
              </div>
            ))}
            {history?.previousConversations.map((conversation) => (
              <button
                type="button"
                key={conversation.conversationId}
                className="nature-button nature-button-outline mt-3 min-h-11 max-w-full [overflow-wrap:anywhere]"
                onClick={() => {
                  setHistoricalConversation(conversation.conversationId);
                  setHistoryOpen(false);
                  setSheetOpen(true);
                }}
              >
                回看对话：{conversation.targetUrl}
              </button>
            ))}
            {selectedVersion ? (
              <section className="mt-6">
                <h3 className="mb-3 font-semibold">所选历史版本</h3>
                <MarkdownRenderer
                  surface={surface}
                  content={selectedVersion.summary ?? "摘要未完成"}
                  nofollowExternalLinks
                  enableMermaid={false}
                />
                <MarkdownRenderer
                  surface={surface}
                  content={selectedVersion.source ?? "原文未抓取"}
                  nofollowExternalLinks
                  enableMermaid={false}
                />
                <MarkdownRenderer
                  surface={surface}
                  content={selectedVersion.translation ?? "译文未完成"}
                  nofollowExternalLinks
                  enableMermaid={false}
                />
              </section>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}
    </section>
  );
}
