"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import type {
  AssistantCitation,
  AssistantConversation,
  FrontendAuthState,
} from "@/lib/assistant-contracts";
import {
  isWebDemoBuildEnabled,
  subscribeWebDemoRequestChanges,
  WEB_DEMO_ACTION_EVENT,
} from "@/lib/web-demo-runtime";
import {
  AssistantClientError,
  type AssistantQuota,
  type AssistantSnapshot,
  bootstrapAssistantAuth,
  deleteAssistantConversation,
  readAssistantAuth,
  readAssistantList,
  readAssistantQuota,
  readAssistantSnapshot,
  startAssistantAdminAuth,
  stopAssistantGeneration,
  submitAssistantMessage,
} from "../lib/assistant-client";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";
import "./KnowledgeAssistant.css";

type Props = { fullPage?: boolean };
type AuthState = FrontendAuthState | null;

const UI_STATE_KEY = "site-knowledge-assistant-ui";
const UI_LOGIN_HANDOFF_KEY = "site-knowledge-assistant-login-handoff";

type AssistantContext = { slug: string };
type PendingRequest = { content: string; requestId: string };
type UiState = {
  selectedId: string | null;
  drafts: Record<string, string>;
  pendingRequests: Record<string, PendingRequest>;
  newConversationContext: AssistantContext | null;
  newConversationContextFrozen: boolean;
};

function uiStateKey(principalId?: string | null) {
  return principalId ? `${UI_STATE_KEY}:${principalId}` : UI_STATE_KEY;
}

function emptyUiState(): UiState {
  return {
    selectedId: null,
    drafts: {},
    pendingRequests: {},
    newConversationContext: null,
    newConversationContextFrozen: false,
  };
}

function readUiState(key = UI_STATE_KEY): UiState {
  if (typeof window === "undefined") return emptyUiState();
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(key) || "null") as {
      selectedId?: unknown;
      drafts?: unknown;
      pendingRequests?: unknown;
      newConversationContext?: unknown;
      newConversationContextFrozen?: unknown;
    } | null;
    return {
      selectedId: typeof raw?.selectedId === "string" ? raw.selectedId : null,
      drafts:
        raw?.drafts && typeof raw.drafts === "object"
          ? Object.fromEntries(
              Object.entries(raw.drafts).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string"
              )
            )
          : {},
      pendingRequests:
        raw?.pendingRequests && typeof raw.pendingRequests === "object"
          ? Object.fromEntries(
              Object.entries(raw.pendingRequests).filter(
                (entry): entry is [string, { content: string; requestId: string }] =>
                  Boolean(entry[1]) &&
                  typeof entry[1] === "object" &&
                  typeof (entry[1] as Record<string, unknown>).content === "string" &&
                  typeof (entry[1] as Record<string, unknown>).requestId === "string"
              )
            )
          : {},
      newConversationContext:
        raw?.newConversationContext &&
        typeof raw.newConversationContext === "object" &&
        typeof (raw.newConversationContext as Record<string, unknown>).slug === "string"
          ? { slug: (raw.newConversationContext as Record<string, string>).slug }
          : null,
      newConversationContextFrozen:
        raw?.newConversationContextFrozen === true || Boolean(raw?.newConversationContext),
    };
  } catch {
    return emptyUiState();
  }
}

function writeUiState(key: string, state: UiState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Session storage is an enhancement; assistant state remains server-backed.
  }
}

function formatConversationTitle(conversation: AssistantConversation) {
  if (conversation.title?.trim()) return conversation.title;
  return conversation.kind === "clipping" ? "文章对话" : "新对话";
}

function formatQuota(quota: AssistantQuota | null) {
  if (!quota) return "配额读取中";
  if (quota.unlimited) return "管理员配额不限";
  return `问题 ${quota.questionHourlyRemaining ?? 0}/${quota.policy.questionHourlyLimit}（本周 ${quota.questionWeeklyRemaining ?? 0}/${quota.policy.questionWeeklyLimit}） · Token ${quota.tokenHourlyRemaining ?? 0}/${quota.policy.tokenHourlyLimit}（本周 ${quota.tokenWeeklyRemaining ?? 0}/${quota.policy.tokenWeeklyLimit}） · 对话 ${quota.activeConversationCount}/${quota.policy.maxConversations}`;
}

function formatConversationExpiry(snapshot: AssistantSnapshot | null) {
  const expiresAt = snapshot?.conversation.expiresAt;
  if (!expiresAt) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(expiresAt));
}

function getClippingContext(): AssistantContext | null {
  if (typeof window === "undefined") return null;
  const node = document.querySelector<HTMLElement>("[data-assistant-clipping-slug]");
  const slug =
    node?.dataset.assistantClippingSlug ||
    new URL(window.location.href).searchParams.get("clipping");
  return slug ? { slug } : null;
}

function draftKey(selectedId: string | null, context: AssistantContext | null) {
  if (selectedId && selectedId !== "new") return selectedId;
  return context ? `new:clipping:${context.slug}` : "new";
}

function isGenerating(snapshot: AssistantSnapshot | null) {
  const status = snapshot?.activeGenerationJob?.status;
  return status === "queued" || status === "running";
}

function errorMessage(error: unknown) {
  if (
    error instanceof AssistantClientError &&
    (error.code === "QUOTA_EXCEEDED" || error.code === "QUOTA" || error.status === 429)
  ) {
    if (/conversation|maximum|limit/i.test(error.message)) {
      return "已达到最多 3 段临时对话，请删除旧对话后再试。";
    }
    return "本小时额度已用完，请稍后再试。";
  }
  if (error instanceof AssistantClientError && error.code === "RECONNECTING")
    return "正在重新连接知识助手。";
  if (error instanceof AssistantClientError && error.status === 410)
    return "这段对话已过期，请新建对话。";
  if (error instanceof AssistantClientError && error.status === 401)
    return "登录状态已失效，请重新登录。";
  return error instanceof Error ? error.message : "助手暂时不可用，请重试。";
}

function LoginPrompt({
  draft,
  onDraftChange,
  onLogin,
  onAdminLogin,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onLogin: () => void;
  onAdminLogin: () => void;
}) {
  return (
    <div className="flex min-h-48 flex-col gap-3 px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Icon name="tabler:lock" className="h-7 w-7 text-[color:var(--nature-text-soft)]" />
        <h2 className="font-semibold">登录后使用知识助手</h2>
        <p className="max-w-sm text-sm leading-6 text-[color:var(--nature-text-soft)]">
          可以先写下问题。登录只用于保存你的对话和额度状态，回到页面后不会自动发送。
        </p>
      </div>
      <textarea
        className="nature-input-shell min-h-20 w-full resize-y rounded-lg border border-[color:var(--nature-line)] bg-transparent p-3 text-sm leading-6 outline-none focus:border-[color:var(--nature-accent-strong)]"
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="先写下想问的问题……"
        aria-label="登录前的知识助手草稿"
        maxLength={4000}
      />
      <div className="flex justify-center">
        <button
          type="button"
          className="nature-button nature-button-primary min-h-11"
          onClick={onLogin}
        >
          <Icon name="tabler:brand-github" className="h-4 w-4" />
          保存草稿并登录
        </button>
      </div>
      <button
        type="button"
        className="mx-auto min-h-11 px-3 text-sm text-[color:var(--nature-text-soft)] underline underline-offset-4"
        onClick={onAdminLogin}
      >
        管理员入口
      </button>
    </div>
  );
}

function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onDelete,
}: {
  conversations: AssistantConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="knowledge-assistant-list" data-testid="assistant-conversation-list">
      {conversations.length === 0 ? (
        <p className="px-2 py-3 text-sm text-[color:var(--nature-text-soft)]">还没有保存的对话。</p>
      ) : (
        conversations.map((conversation) => (
          <div
            className={`knowledge-assistant-list-item ${selectedId === conversation.id ? "is-selected" : ""}`}
            key={conversation.id}
          >
            <button
              type="button"
              className="knowledge-assistant-list-select"
              onClick={() => onSelect(conversation.id)}
              aria-current={selectedId === conversation.id ? "true" : undefined}
            >
              <span className="block truncate text-sm font-medium">
                {formatConversationTitle(conversation)}
              </span>
              <span className="mt-0.5 block text-xs text-[color:var(--nature-text-faint)]">
                {conversation.kind === "clipping" ? "当前文章" : "通用问答"}
              </span>
            </button>
            <button
              type="button"
              className="knowledge-assistant-list-delete"
              aria-label={`删除${formatConversationTitle(conversation)}`}
              title="删除对话"
              onClick={() => onDelete(conversation.id)}
            >
              <Icon name="tabler:trash" className="h-4 w-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function MessageStream({
  snapshot,
  onRetry,
}: {
  snapshot: AssistantSnapshot | null;
  onRetry?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const followTail = useRef(true);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const updateFollowTail = () => {
      followTail.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 24;
    };
    element.addEventListener("scroll", updateFollowTail, { passive: true });
    updateFollowTail();
    return () => element.removeEventListener("scroll", updateFollowTail);
  }, []);
  useEffect(() => {
    if (!snapshot) {
      followTail.current = true;
      return;
    }
    if (followTail.current && container.current) {
      container.current.scrollTop = container.current.scrollHeight;
    }
  }, [snapshot]);
  return (
    <div
      ref={container}
      className="knowledge-assistant-messages"
      data-testid="assistant-messages"
      aria-live="polite"
    >
      {!snapshot || snapshot.messages.length === 0 ? (
        <div className="m-auto max-w-sm text-center text-sm leading-6 text-[color:var(--nature-text-soft)]">
          <p className="font-medium text-[color:var(--nature-text)]">想了解什么？</p>
          <p className="mt-1">可以询问公开文章、项目经验和工作方法。</p>
        </div>
      ) : (
        snapshot.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => (
            <div
              className={`knowledge-assistant-message knowledge-assistant-message--${message.role}`}
              data-testid={`assistant-message-${message.role}`}
              key={message.id}
            >
              {message.content || (message.status === "streaming" ? "正在生成……" : "")}
              {message.status === "failed" && onRetry ? (
                <button
                  type="button"
                  className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md border border-[color:var(--nature-line-strong)] px-2 text-xs font-semibold"
                  onClick={onRetry}
                >
                  <Icon name="tabler:refresh" className="h-3.5 w-3.5" />
                  重试
                </button>
              ) : null}
              {message.citations.length ? (
                <ul className="knowledge-assistant-citations" aria-label="回答来源">
                  {message.citations.map((citation: AssistantCitation) => (
                    <li key={citation.id}>
                      <a href={citation.href} target="_blank" rel="noreferrer">
                        {citation.title}
                        {citation.location ? ` · ${citation.location}` : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
      )}
    </div>
  );
}

export default function KnowledgeAssistant({ fullPage = false }: Props) {
  const initialUiState = useMemo(readUiState, []);
  const initialPathConversation = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("conversation");
  }, []);
  const [open, setOpen] = useState(fullPage);
  const [auth, setAuth] = useState<AuthState>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [quota, setQuota] = useState<AssistantQuota | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPathConversation || initialUiState.selectedId
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(initialUiState.drafts);
  const [pendingRequests, setPendingRequests] = useState(initialUiState.pendingRequests);
  const [newConversationContext, setNewConversationContext] = useState<AssistantContext | null>(
    initialUiState.newConversationContext
  );
  const [newConversationContextFrozen, setNewConversationContextFrozen] = useState(
    initialUiState.newConversationContextFrozen
  );
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedRef = useRef(selectedId);
  const draftsRef = useRef(drafts);
  const pollTimer = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const submissionRequestsRef = useRef(initialUiState.pendingRequests);
  const pendingRequestsRef = useRef(initialUiState.pendingRequests);
  const newConversationContextRef = useRef<AssistantContext | null>(
    initialUiState.newConversationContext
  );
  const newConversationContextFrozenRef = useRef(initialUiState.newConversationContextFrozen);
  const snapshotRequestRef = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const principalIdRef = useRef<string | null>(null);
  principalIdRef.current = auth?.principal?.id ?? null;

  useEffect(() => {
    selectedRef.current = selectedId;
    draftsRef.current = drafts;
    pendingRequestsRef.current = pendingRequests;
    newConversationContextRef.current = newConversationContext;
    newConversationContextFrozenRef.current = newConversationContextFrozen;
    writeUiState(uiStateKey(auth?.principal?.id), {
      selectedId,
      drafts,
      pendingRequests,
      newConversationContext,
      newConversationContextFrozen,
    });
  }, [
    auth?.principal?.id,
    selectedId,
    drafts,
    pendingRequests,
    newConversationContext,
    newConversationContextFrozen,
  ]);

  const applyUiState = useCallback((state: UiState) => {
    selectedRef.current = state.selectedId;
    draftsRef.current = state.drafts;
    pendingRequestsRef.current = state.pendingRequests;
    submissionRequestsRef.current = state.pendingRequests;
    newConversationContextRef.current = state.newConversationContext;
    newConversationContextFrozenRef.current = state.newConversationContextFrozen;
    setSelectedId(state.selectedId);
    setDrafts(state.drafts);
    setPendingRequests(state.pendingRequests);
    setNewConversationContext(state.newConversationContext);
    setNewConversationContextFrozen(state.newConversationContextFrozen);
  }, []);

  const clearStoredUiState = useCallback((principalId?: string | null) => {
    try {
      window.sessionStorage.removeItem(uiStateKey(principalId));
    } catch {
      // Session storage is an enhancement; assistant state remains server-backed.
    }
  }, []);

  const restoreAuthenticatedState = useCallback(
    (principalId: string, handoff: boolean) => {
      const scopedState = readUiState(uiStateKey(principalId));
      const guestState = handoff ? readUiState() : emptyUiState();
      const guestHasNewDraft =
        handoff &&
        (guestState.selectedId === "new" ||
          Object.keys(guestState.drafts).some(
            (key) => key === "new" || key.startsWith("new:clipping:")
          ));
      const restored = handoff
        ? {
            ...scopedState,
            selectedId: guestState.selectedId ?? scopedState.selectedId,
            drafts: { ...scopedState.drafts, ...guestState.drafts },
            newConversationContext: guestHasNewDraft
              ? guestState.newConversationContext
              : (guestState.newConversationContext ?? scopedState.newConversationContext),
            newConversationContextFrozen: guestHasNewDraft
              ? guestState.newConversationContextFrozen
              : scopedState.newConversationContextFrozen,
          }
        : scopedState;
      applyUiState({
        ...restored,
        selectedId: initialPathConversation || restored.selectedId,
      });
      if (handoff) {
        try {
          window.sessionStorage.removeItem(UI_LOGIN_HANDOFF_KEY);
          window.sessionStorage.removeItem(UI_STATE_KEY);
        } catch {
          // Session storage is an enhancement; assistant state remains server-backed.
        }
      }
    },
    [applyUiState, initialPathConversation]
  );

  const loadList = useCallback(
    async ({ preferContext = false }: { preferContext?: boolean } = {}) => {
      const data = await readAssistantList();
      setConversations(data.conversations);
      setQuota(data.quota);
      const requested = selectedRef.current;
      const context = getClippingContext();
      if (preferContext && context) {
        const contextual = data.conversations.find(
          (conversation) =>
            conversation.kind === "clipping" && conversation.clippingMemoId === context.slug
        );
        const nextId = contextual?.id ?? "new";
        const persistedContext = newConversationContextRef.current;
        const nextContext =
          nextId === "new"
            ? (persistedContext ?? (newConversationContextFrozenRef.current ? null : context))
            : null;
        const contextualDraftKey = draftKey("new", context);
        const sourceDraftKey = Object.hasOwn(draftsRef.current, contextualDraftKey)
          ? contextualDraftKey
          : !newConversationContextFrozenRef.current && Object.hasOwn(draftsRef.current, "new")
            ? "new"
            : null;
        if (
          nextContext &&
          sourceDraftKey &&
          draftsRef.current[sourceDraftKey] &&
          !draftsRef.current[draftKey("new", nextContext)]
        ) {
          const targetDraftKey = draftKey("new", nextContext);
          const nextDrafts = {
            ...draftsRef.current,
            [targetDraftKey]: draftsRef.current[sourceDraftKey],
          };
          if (sourceDraftKey !== targetDraftKey) delete nextDrafts[sourceDraftKey];
          draftsRef.current = nextDrafts;
          setDrafts(nextDrafts);
        }
        if (
          nextId !== "new" &&
          sourceDraftKey &&
          draftsRef.current[sourceDraftKey] &&
          !draftsRef.current[nextId]
        ) {
          const nextDrafts = { ...draftsRef.current, [nextId]: draftsRef.current[sourceDraftKey] };
          delete nextDrafts[sourceDraftKey];
          draftsRef.current = nextDrafts;
          setDrafts(nextDrafts);
        }
        selectedRef.current = nextId;
        setSelectedId(nextId);
        newConversationContextRef.current = nextContext;
        newConversationContextFrozenRef.current = nextId === "new";
        setNewConversationContext(nextContext);
        setNewConversationContextFrozen(nextId === "new");
        return;
      }
      if (
        !requested &&
        Object.keys(draftsRef.current).some(
          (key) => key === "new" || key.startsWith("new:clipping:")
        )
      ) {
        selectedRef.current = "new";
        setSelectedId("new");
        const nextContext = context ?? newConversationContextRef.current;
        newConversationContextRef.current = nextContext;
        newConversationContextFrozenRef.current =
          newConversationContextFrozenRef.current || Boolean(nextContext);
        setNewConversationContext(nextContext);
        setNewConversationContextFrozen(newConversationContextFrozenRef.current);
        return;
      }
      if (requested && data.conversations.some((conversation) => conversation.id === requested))
        return;
      if (requested === "new") return;
      const nextId = data.conversations[0]?.id ?? null;
      selectedRef.current = nextId;
      setSelectedId(nextId);
      newConversationContextRef.current = null;
      newConversationContextFrozenRef.current = false;
      setNewConversationContext(null);
      setNewConversationContextFrozen(false);
    },
    []
  );

  const loadAuth = useCallback(async () => {
    setAuthLoading(true);
    setRequestError(null);
    try {
      let next = await readAssistantAuth();
      if (!next.authenticated && !next.loggedOut) {
        try {
          next = await bootstrapAssistantAuth();
        } catch {
          // Guests and unconfigured demo identities remain logged out.
        }
      }
      if (next.authenticated && next.principal) {
        let handoff = false;
        try {
          handoff = window.sessionStorage.getItem(UI_LOGIN_HANDOFF_KEY) === "1";
        } catch {
          // Session storage is an enhancement; assistant state remains server-backed.
        }
        restoreAuthenticatedState(next.principal.id, handoff);
      } else {
        const guestState = readUiState();
        applyUiState({
          ...guestState,
          selectedId: initialPathConversation || guestState.selectedId,
        });
      }
      setAuth(next);
      if (next.authenticated) await loadList({ preferContext: true });
      else {
        setConversations([]);
        setQuota(null);
        setSnapshot(null);
      }
    } catch (error) {
      applyUiState(readUiState());
      setAuth(null);
      setRequestError(errorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  }, [applyUiState, initialPathConversation, loadList, restoreAuthenticatedState]);

  useEffect(() => {
    void loadAuth();
    const unsubscribe = subscribeWebDemoRequestChanges((detail) => {
      if (detail?.changed.includes("scene") || detail?.changed.includes("data")) {
        selectedRef.current = null;
        setSelectedId(null);
        setDrafts({});
        setPendingRequests({});
        setNewConversationContext(null);
        setNewConversationContextFrozen(false);
        pendingRequestsRef.current = {};
        submissionRequestsRef.current = {};
        newConversationContextRef.current = null;
        newConversationContextFrozenRef.current = false;
        clearStoredUiState(principalIdRef.current);
        setSnapshot(null);
        void loadAuth();
      } else if (detail?.changed.includes("persona") || detail?.changed.includes("connection")) {
        void loadAuth();
      }
    });
    const handleAction = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action !== "reset-state") return;
      selectedRef.current = null;
      setSelectedId(null);
      setDrafts({});
      setPendingRequests({});
      setNewConversationContext(null);
      setNewConversationContextFrozen(false);
      pendingRequestsRef.current = {};
      submissionRequestsRef.current = {};
      newConversationContextRef.current = null;
      newConversationContextFrozenRef.current = false;
      clearStoredUiState(principalIdRef.current);
      setSnapshot(null);
      void loadAuth();
    };
    window.addEventListener(WEB_DEMO_ACTION_EVENT, handleAction);
    return () => {
      unsubscribe();
      window.removeEventListener(WEB_DEMO_ACTION_EVENT, handleAction);
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    };
  }, [clearStoredUiState, loadAuth]);

  useEffect(() => {
    const handlePageLoad = () => {
      if (auth?.authenticated) void loadList({ preferContext: !open });
    };
    document.addEventListener("astro:page-load", handlePageLoad);
    return () => document.removeEventListener("astro:page-load", handlePageLoad);
  }, [auth?.authenticated, loadList, open]);

  const loadSnapshot = useCallback(
    async (conversationId: string) => {
      const requestSequence = ++snapshotRequestRef.current;
      const isCurrent = () =>
        selectedRef.current === conversationId && snapshotRequestRef.current === requestSequence;
      try {
        const next = await readAssistantSnapshot(conversationId);
        if (!isCurrent()) return null;
        setSnapshot(next);
        setOffline(false);
        setRequestError(null);
        void readAssistantQuota()
          .then((nextQuota) => {
            if (isCurrent()) setQuota(nextQuota);
          })
          .catch(() => undefined);
        return next;
      } catch (error) {
        if (!isCurrent()) return null;
        if (error instanceof AssistantClientError && error.status === 410) {
          setSnapshot(null);
          setRequestError(errorMessage(error));
        } else if (error instanceof AssistantClientError && error.status === 401) {
          applyUiState(readUiState());
          setAuth({ authenticated: false, principal: null, expiresAt: null, loggedOut: false });
          setSnapshot(null);
          setRequestError(errorMessage(error));
        } else if (error instanceof AssistantClientError && error.status === 404) {
          selectedRef.current = null;
          setSelectedId(null);
          setSnapshot(null);
        } else {
          setOffline(true);
          setRequestError(errorMessage(error));
        }
        return null;
      }
    },
    [applyUiState]
  );

  useEffect(() => {
    if (!auth?.authenticated || !selectedId || selectedId === "new") {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const next = await loadSnapshot(selectedId);
      if (cancelled) return;
      pollTimer.current = window.setTimeout(poll, isGenerating(next) ? 650 : 2400);
    };
    void poll();
    return () => {
      cancelled = true;
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    };
  }, [auth?.authenticated, selectedId, loadSnapshot]);

  useEffect(() => {
    if (fullPage || !open) return;
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel) return;
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      );
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [fullPage, open]);

  const selectConversation = (id: string) => {
    selectedRef.current = id;
    setSelectedId(id);
    newConversationContextRef.current = id === "new" ? getClippingContext() : null;
    newConversationContextFrozenRef.current = id === "new";
    setNewConversationContext(newConversationContextRef.current);
    setNewConversationContextFrozen(id === "new");
    setSnapshot(null);
    setRequestError(null);
    setOffline(false);
  };

  const createConversation = () => {
    selectedRef.current = "new";
    setSelectedId("new");
    const context = getClippingContext();
    newConversationContextRef.current = context;
    newConversationContextFrozenRef.current = true;
    setNewConversationContext(context);
    setNewConversationContextFrozen(true);
    setSnapshot(null);
    setRequestError(null);
  };

  const updateDraft = (value: string) => {
    const key = draftKey(selectedId, newConversationContextRef.current);
    setDrafts((current) => ({ ...current, [key]: value }));
  };

  const login = () => {
    writeUiState(uiStateKey(null), {
      selectedId,
      drafts,
      pendingRequests: pendingRequestsRef.current,
      newConversationContext: newConversationContextRef.current,
      newConversationContextFrozen: newConversationContextFrozenRef.current,
    });
    try {
      window.sessionStorage.setItem(UI_LOGIN_HANDOFF_KEY, "1");
    } catch {
      // Continue to the provider even when storage is unavailable.
    }
    if (isWebDemoBuildEnabled()) {
      const demoUrl = new URL(window.location.href);
      demoUrl.searchParams.set("d_persona", "user");
      window.location.assign(demoUrl.toString());
      return;
    }
    const loginUrl = new URL(toPublicApiUrl("/api/public/reader-auth/github/start"));
    loginUrl.searchParams.set("returnTo", window.location.href);
    window.location.assign(loginUrl.toString());
  };

  const adminLogin = async () => {
    writeUiState(uiStateKey(null), {
      selectedId,
      drafts,
      pendingRequests: pendingRequestsRef.current,
      newConversationContext: newConversationContextRef.current,
      newConversationContextFrozen: newConversationContextFrozenRef.current,
    });
    setAuthLoading(true);
    setRequestError(null);
    try {
      const next = await startAssistantAdminAuth();
      if (next.authenticated && next.principal) {
        restoreAuthenticatedState(next.principal.id, true);
        setAuth(next);
        await loadList({ preferContext: true });
      } else {
        setAuth(next);
      }
    } catch (error) {
      setRequestError(
        error instanceof AssistantClientError && error.status === 401
          ? "请先登录管理员账号。"
          : errorMessage(error)
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const send = async (contentOverride?: string) => {
    const context = newConversationContextRef.current;
    const key = draftKey(selectedId, context);
    const content = (contentOverride ?? draftsRef.current[key] ?? "").trim();
    if (!content || !auth?.authenticated || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setRequestError(null);
    setOffline(false);
    const requestSelectedId = selectedId;
    const existingRequest = submissionRequestsRef.current[key];
    const requestId =
      existingRequest?.content === content ? existingRequest.requestId : crypto.randomUUID();
    submissionRequestsRef.current[key] = { content, requestId };
    const nextPendingRequests = {
      ...pendingRequestsRef.current,
      [key]: { content, requestId },
    };
    pendingRequestsRef.current = nextPendingRequests;
    setPendingRequests(nextPendingRequests);
    try {
      const result = await submitAssistantMessage({
        conversationId: selectedId === "new" ? null : selectedId,
        requestId,
        clientRequestId: requestId,
        content,
        kind: context ? "clipping" : "general",
        clippingMemoId: context?.slug ?? null,
      });
      setDrafts((current) => ({ ...current, [key]: "" }));
      delete submissionRequestsRef.current[key];
      const { [key]: _pending, ...remainingPendingRequests } = pendingRequestsRef.current;
      pendingRequestsRef.current = remainingPendingRequests;
      setPendingRequests(remainingPendingRequests);
      if (selectedRef.current === requestSelectedId) {
        selectedRef.current = result.conversationId;
        setSelectedId(result.conversationId);
        newConversationContextRef.current = null;
        newConversationContextFrozenRef.current = false;
        setNewConversationContext(null);
        setNewConversationContextFrozen(false);
      }
      await loadList();
      if (selectedRef.current === result.conversationId) await loadSnapshot(result.conversationId);
    } catch (error) {
      setRequestError(errorMessage(error));
      if (error instanceof AssistantClientError && error.status === 401) {
        applyUiState(readUiState());
        setAuth(null);
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const retry = async () => {
    if (!snapshot || !selectedId) return;
    const lastUserMessage = [...snapshot.messages]
      .reverse()
      .find((message) => message.role === "user" && message.content.trim());
    if (lastUserMessage) await send(lastUserMessage.content);
  };

  const stop = async () => {
    if (!selectedId || !snapshot?.activeGenerationJob) return;
    try {
      await stopAssistantGeneration({
        conversationId: selectedId,
        turnId: snapshot.activeGenerationJob.id,
      });
      await loadSnapshot(selectedId);
    } catch (error) {
      setRequestError(errorMessage(error));
    }
  };

  const remove = async (conversationId: string) => {
    if (!window.confirm("删除这段对话？")) return;
    try {
      await deleteAssistantConversation(conversationId);
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId)
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
      if (selectedId === conversationId) {
        selectedRef.current = null;
        setSelectedId(null);
        setSnapshot(null);
      }
      await loadList();
    } catch (error) {
      setRequestError(errorMessage(error));
    }
  };

  const enlarge = () => {
    writeUiState(uiStateKey(auth?.principal?.id), {
      selectedId,
      drafts,
      pendingRequests: pendingRequestsRef.current,
      newConversationContext: newConversationContextRef.current,
      newConversationContextFrozen: newConversationContextFrozenRef.current,
    });
    const url = new URL(toPublicSitePath("/chat"), window.location.origin);
    if (selectedId && selectedId !== "new") url.searchParams.set("conversation", selectedId);
    else if (newConversationContextRef.current)
      url.searchParams.set("clipping", newConversationContextRef.current.slug);
    window.location.assign(url.toString());
  };

  const currentDraft = drafts[draftKey(selectedId, newConversationContextRef.current)] || "";
  const title = snapshot
    ? formatConversationTitle(snapshot.conversation)
    : selectedId === "new"
      ? "新对话"
      : "知识助手";
  const body = (
    <>
      {authLoading ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-[color:var(--nature-text-soft)]">
          正在检查登录状态……
        </div>
      ) : requestError && !auth?.authenticated ? (
        <>
          <div className="knowledge-assistant-error mx-3 mt-3" role="alert">
            <div className="flex items-start justify-between gap-3">
              <span>
                {offline ? "网络连接中断：" : ""}
                {requestError}
              </span>
              <button
                type="button"
                className="min-h-11 px-2 underline"
                onClick={() => void loadAuth()}
              >
                重试
              </button>
            </div>
          </div>
          <LoginPrompt
            draft={currentDraft}
            onDraftChange={updateDraft}
            onLogin={login}
            onAdminLogin={() => void adminLogin()}
          />
        </>
      ) : !auth?.authenticated ? (
        <LoginPrompt
          draft={currentDraft}
          onDraftChange={updateDraft}
          onLogin={login}
          onAdminLogin={() => void adminLogin()}
        />
      ) : (
        <div className="knowledge-assistant-body">
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={selectConversation}
            onDelete={remove}
          />
          <div className="knowledge-assistant-content">
            <div className="knowledge-assistant-toolbar">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{title}</h2>
                <p className="knowledge-assistant-status" data-testid="assistant-quota">
                  {formatQuota(quota)}
                </p>
              </div>
              {isGenerating(snapshot) ? (
                <button
                  type="button"
                  className="nature-button nature-button-ghost min-h-11 px-3 text-sm"
                  onClick={() => void stop()}
                >
                  <Icon name="tabler:square" className="h-4 w-4" />
                  停止
                </button>
              ) : null}
            </div>
            {quota ? (
              <p className="knowledge-assistant-notice mx-3 mt-3">
                对话临时保留 {Math.round(quota.policy.retentionMs / 86_400_000)} 天，最多保留{" "}
                {quota.policy.maxConversations} 段。仅检索公开内容。
                {formatConversationExpiry(snapshot)
                  ? ` 当前对话将于 ${formatConversationExpiry(snapshot)} 到期。`
                  : " 额度按小时和周窗口恢复。"}
              </p>
            ) : null}
            {requestError ? (
              <div className="knowledge-assistant-error mx-3 mt-3" role="alert">
                <div className="flex items-start justify-between gap-3">
                  <span>
                    {offline ? "网络连接中断：" : ""}
                    {requestError}
                  </span>
                  <button
                    type="button"
                    className="min-h-11 px-2 underline"
                    onClick={() =>
                      selectedId && selectedId !== "new"
                        ? void loadSnapshot(selectedId)
                        : void loadList()
                    }
                  >
                    重试
                  </button>
                </div>
              </div>
            ) : null}
            <MessageStream snapshot={snapshot} onRetry={() => void retry()} />
            <div className="knowledge-assistant-compose">
              <textarea
                className="nature-input-shell rounded-lg border border-[color:var(--nature-line)] bg-transparent p-3 text-sm leading-6 outline-none focus:border-[color:var(--nature-accent-strong)]"
                value={currentDraft}
                onChange={(event) => updateDraft(event.target.value)}
                placeholder="询问公开文章或项目经验……"
                aria-label="知识助手问题"
                maxLength={4000}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="knowledge-assistant-status">草稿会保留在当前浏览器</span>
                <button
                  type="button"
                  className="nature-button nature-button-primary min-h-11 px-3 text-sm"
                  onClick={() => void send()}
                  disabled={!currentDraft.trim() || isGenerating(snapshot) || isSubmitting}
                >
                  <Icon name="tabler:send-2" className="h-4 w-4" />
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (fullPage) {
    return (
      <main className="knowledge-assistant-page" data-testid="assistant-page">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-[color:var(--nature-text-soft)]">公开知识库</p>
            <h1 className="mt-1 font-[family:var(--font-heading)] text-2xl font-semibold">
              知识助手
            </h1>
          </div>
          <button
            type="button"
            className="nature-button nature-button-ghost min-h-11"
            onClick={createConversation}
            disabled={!auth?.authenticated}
          >
            <Icon name="tabler:plus" className="h-4 w-4" />
            新建对话
          </button>
        </div>
        <div className="knowledge-assistant-page-grid">{body}</div>
      </main>
    );
  }

  return (
    <>
      <button
        type="button"
        className="knowledge-assistant-fab"
        data-testid="assistant-fab"
        ref={triggerRef}
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        <Icon name="tabler:sparkles" className="h-5 w-5" />
        知识助手
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="knowledge-assistant-overlay"
            aria-label="关闭知识助手"
            onClick={() => setOpen(false)}
          />
          <section
            className="knowledge-assistant-panel"
            data-testid="assistant-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="知识助手"
          >
            <header className="knowledge-assistant-header">
              <div>
                <p className="text-sm font-semibold">知识助手</p>
                <p className="knowledge-assistant-status">公开内容问答</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="knowledge-assistant-icon-button"
                  onClick={createConversation}
                  aria-label="新建对话"
                  title="新建对话"
                  disabled={!auth?.authenticated}
                >
                  <Icon name="tabler:plus" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="knowledge-assistant-icon-button"
                  onClick={enlarge}
                  aria-label="展开完整页面"
                  title="展开完整页面"
                >
                  <Icon name="tabler:arrows-maximize" className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="knowledge-assistant-icon-button"
                  onClick={() => setOpen(false)}
                  aria-label="关闭知识助手"
                  title="关闭"
                >
                  <Icon name="tabler:x" className="h-5 w-5" />
                </button>
              </div>
            </header>
            {body}
          </section>
        </>
      ) : null}
    </>
  );
}
