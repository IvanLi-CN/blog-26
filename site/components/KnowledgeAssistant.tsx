"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConversationMarkdown } from "@/components/common/ConversationMarkdown";
import {
  ConversationPresentationContext,
  createSessionPresentationStore,
  readConversationPresentation,
  writeConversationPresentation,
} from "@/components/common/conversation/presentation-state";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/Icon";
import type {
  AssistantCitation,
  AssistantConversation,
  AssistantMessage,
  FrontendAuthState,
} from "@/lib/assistant-contracts";
import {
  getWebDemoRuntimeState,
  getWebDemoShareUrl,
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
  readClippingAssistantSnapshot,
  startAssistantAdminAuth,
  stopAssistantGeneration,
  stopClippingAssistantGeneration,
  submitAssistantMessage,
  submitClippingAssistantMessage,
} from "../lib/assistant-client";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";
import {
  getBuildDefaultAssistantLauncherEnabled,
  readSiteFeatureConfig,
} from "../lib/site-feature-config";
import { AssistantMessageContent } from "./AssistantMessageContent";
import "./KnowledgeAssistant.css";

type Props = { fullPage?: boolean };
type AuthState = FrontendAuthState | null;

const UI_STATE_KEY = "site-knowledge-assistant-ui";
const UI_LOGIN_HANDOFF_KEY = "site-knowledge-assistant-login-handoff";
const ASSISTANT_DISPLAY_NAME = "知识对话";
const PANEL_EXIT_DURATION = 300;
const ASSISTANT_STOP_POLL_INTERVAL_MS = 120;
const ASSISTANT_STOP_WAIT_TIMEOUT_MS = 5000;

type AssistantContext = { slug: string; memoId: string | null };
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
          ? {
              slug: (raw.newConversationContext as Record<string, string>).slug,
              memoId:
                typeof (raw.newConversationContext as Record<string, unknown>).memoId === "string"
                  ? (raw.newConversationContext as Record<string, string>).memoId
                  : null,
            }
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

function formatQuotaAmount(value: number | null | undefined) {
  const amount = Math.max(0, value ?? 0);
  if (amount < 1000) return String(amount);
  const compact = amount / 1000;
  return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}k`;
}

function formatQuota(quota: AssistantQuota | null) {
  if (!quota) return "配额读取中";
  if (quota.unlimited) return "管理员配额不限";
  return `Token ${formatQuotaAmount(quota.tokenHourlyRemaining)}/${formatQuotaAmount(quota.policy.tokenHourlyLimit)}`;
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
  const params = new URL(window.location.href).searchParams;
  const slug = node?.dataset.assistantClippingSlug || params.get("clipping");
  if (!slug) return null;
  return {
    slug,
    memoId: node?.dataset.assistantClippingMemoId || params.get("clippingMemoId"),
  };
}

function contextForConversation(
  conversation: AssistantConversation | undefined,
  context: AssistantContext | null,
  { explicit = false }: { explicit?: boolean } = {}
) {
  if (conversation?.kind !== "clipping") return null;
  if (
    !explicit &&
    context?.memoId &&
    conversation.clippingMemoId &&
    context.memoId !== conversation.clippingMemoId
  )
    return null;
  const slug = conversation.clippingSlug ?? (!explicit ? context?.slug : null) ?? null;
  if (!slug) return null;
  return {
    slug,
    memoId: conversation.clippingMemoId ?? context?.memoId ?? null,
  };
}

function draftKey(selectedId: string | null, context: AssistantContext | null) {
  if (selectedId && selectedId !== "new") return selectedId;
  return context ? `new:clipping:${context.slug}` : "new";
}

function isGenerating(snapshot: AssistantSnapshot | null) {
  const status = snapshot?.activeGenerationJob?.status;
  return status === "queued" || status === "running";
}

function findRetryUserMessage(snapshot: AssistantSnapshot, failedMessage: AssistantMessage) {
  const generationJob = snapshot.generationJobs.find(
    (job) => job.assistantMessageId === failedMessage.id
  );
  if (generationJob?.userMessageId) {
    const userMessage = snapshot.messages.find(
      (message) => message.id === generationJob.userMessageId && message.role === "user"
    );
    if (userMessage?.content.trim()) return userMessage;
  }

  const failedIndex = snapshot.messages.findIndex((message) => message.id === failedMessage.id);
  if (failedIndex < 0) return null;
  return [...snapshot.messages.slice(0, failedIndex)]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());
}

function AssistantGenerationProcess({
  status,
  citations,
}: {
  status: AssistantMessage["status"];
  citations: AssistantCitation[];
}) {
  const [expanded, setExpanded] = useState(status === "pending" || status === "streaming");
  const active = status === "pending" || status === "streaming";
  const title = active ? "正在生成回答" : "生成过程";

  return (
    <div className="knowledge-assistant-process" data-testid="assistant-generation-process">
      <button
        type="button"
        className="knowledge-assistant-process-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span
          className={`knowledge-assistant-process-dot${active ? " is-active" : ""}`}
          aria-hidden="true"
        />
        <span>{title}</span>
        <Icon name={expanded ? "tabler:chevron-up" : "tabler:chevron-down"} className="h-4 w-4" />
      </button>
      {expanded ? (
        <div className="knowledge-assistant-process-details" role="status" aria-live="polite">
          <p>{active ? "正在根据当前对话整理可读的回答。" : "已完成本轮回答。"}</p>
          {citations.length ? <p>已整理 {citations.length} 个可定位来源。</p> : null}
          {status === "failed" ? <p>过程未完整结束，已有内容仍可继续阅读。</p> : null}
        </div>
      ) : null}
    </div>
  );
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
    return `正在重新连接${ASSISTANT_DISPLAY_NAME}。`;
  if (error instanceof AssistantClientError && error.status === 410)
    return "这段对话已过期，请新建对话。";
  if (error instanceof AssistantClientError && error.status === 401)
    return "登录状态已失效，请重新登录。";
  return error instanceof Error ? error.message : "助手暂时不可用，请重试。";
}

function AssistantErrorAlert({
  message,
  offline,
  onRetry,
}: {
  message: string;
  offline: boolean;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive" className="mx-3 mt-3 w-auto" data-testid="assistant-request-error">
      <span
        aria-hidden="true"
        className="row-span-2 row-start-1 mt-0.5 text-[color:var(--nature-danger)]"
      >
        <Icon name="tabler:alert-circle" className="h-5 w-5" />
      </span>
      <AlertTitle>知识对话暂时不可用</AlertTitle>
      <AlertDescription>
        {offline ? "网络连接中断：" : null}
        {message}
      </AlertDescription>
      <AlertAction>
        <Button type="button" variant="ghost" size="compact" onClick={onRetry}>
          <Icon name="tabler:refresh" className="h-4 w-4" />
          重试
        </Button>
      </AlertAction>
    </Alert>
  );
}

function AssistantHelpPanel({
  helpId,
  quota,
  snapshot,
  onClose,
}: {
  helpId: string;
  quota: AssistantQuota | null;
  snapshot: AssistantSnapshot | null;
  onClose: () => void;
}) {
  const retentionDays = quota ? Math.round(quota.policy.retentionMs / 86_400_000) : null;
  const expiry = formatConversationExpiry(snapshot);

  return (
    <section
      id={helpId}
      className="knowledge-assistant-help-popover"
      data-testid="assistant-help-panel"
      aria-labelledby={`${helpId}-title`}
    >
      <div className="knowledge-assistant-help-header">
        <div className="min-w-0">
          <h2 id={`${helpId}-title`}>帮助</h2>
          <p>快速了解知识对话的使用范围和保存规则。</p>
        </div>
        <button
          type="button"
          className="knowledge-assistant-icon-button knowledge-assistant-help-close"
          aria-label="关闭帮助"
          title="关闭帮助"
          onClick={onClose}
        >
          <Icon name="tabler:x" className="h-4 w-4" />
        </button>
      </div>
      <div className="knowledge-assistant-help-topics">
        <article>
          <h3>可以问什么</h3>
          <p>本站公开文章、项目经验和工作方法。</p>
        </article>
        <article>
          <h3>回答如何来</h3>
          <p>优先检索站内公开内容；有可定位来源时，会附在回答下方。</p>
        </article>
        <article>
          <h3>对话与草稿</h3>
          <p>草稿只保留在当前浏览器，登录后也不会自动发送。</p>
        </article>
        <article>
          <h3>额度与保留</h3>
          <p>
            {quota?.unlimited
              ? "当前账号不受普通配额限制。"
              : retentionDays
                ? "对话临时保留 " +
                  retentionDays +
                  " 天，最多保留 " +
                  quota.policy.maxConversations +
                  " 段。"
                : "对话保留规则读取中。"}{" "}
            额度按小时和周窗口恢复。
            {expiry ? ` 当前对话将于 ${expiry} 到期。` : ""}
          </p>
        </article>
      </div>
    </section>
  );
}

function GuestAssistantPreview({
  draft,
  error,
  offline,
  onDraftChange,
  onLogin,
  onAdminLogin,
  onRetry,
  showAdminLogin,
}: {
  draft: string;
  error: string | null;
  offline: boolean;
  onDraftChange: (value: string) => void;
  onLogin: () => void;
  onAdminLogin: () => void;
  onRetry: () => void;
  showAdminLogin: boolean;
}) {
  return (
    <div
      className="knowledge-assistant-body knowledge-assistant-guest-preview"
      data-testid="assistant-guest-preview"
    >
      <div
        className="knowledge-assistant-list knowledge-assistant-guest-list"
        data-testid="assistant-conversation-list"
      >
        <div className="knowledge-assistant-guest-list-heading">
          <span className="knowledge-assistant-lock-mark" aria-hidden="true">
            <Icon name="tabler:lock" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">对话列表</p>
            <p className="mt-1 text-xs text-[color:var(--nature-text-faint)]">登录后创建并保存</p>
          </div>
        </div>
      </div>
      <div className="knowledge-assistant-content">
        <div className="knowledge-assistant-toolbar">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">登录后开始对话</h2>
            <p className="knowledge-assistant-status">未登录 · 对话功能已锁定</p>
          </div>
          <span className="knowledge-assistant-guest-badge">
            <Icon name="tabler:lock" className="h-3.5 w-3.5" />
            需要登录
          </span>
        </div>
        {error ? <AssistantErrorAlert message={error} offline={offline} onRetry={onRetry} /> : null}
        <div className="knowledge-assistant-messages" data-testid="assistant-messages">
          <div
            className="knowledge-assistant-guest-empty-state"
            data-testid="assistant-guest-empty-state"
          >
            <span className="knowledge-assistant-guest-empty-icon" aria-hidden="true">
              <Icon name="tabler:lock" className="h-6 w-6" />
            </span>
            <div className="knowledge-assistant-guest-empty-copy">
              <h2 className="font-medium">登录后使用{ASSISTANT_DISPLAY_NAME}</h2>
              <p className="mt-1 text-sm leading-6 text-[color:var(--nature-text-soft)]">
                登录后可以询问本站公开文章、项目经验和工作方法。回答会附上可定位的来源。
              </p>
            </div>
          </div>
        </div>
        <div className="knowledge-assistant-compose knowledge-assistant-compose--locked">
          <div className="knowledge-assistant-guest-compose-heading">
            <div>
              <p className="text-sm font-semibold">先写下问题，登录后继续</p>
              <p className="mt-1 text-xs leading-5 text-[color:var(--nature-text-soft)]">
                草稿会保留在当前浏览器，登录后不会自动发送。
              </p>
            </div>
            <span aria-hidden="true">
              <Icon name="tabler:lock" className="h-5 w-5 shrink-0" />
            </span>
          </div>
          <textarea
            className="knowledge-assistant-guest-draft knowledge-assistant-compose-input text-sm leading-6 outline-none"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="先写下想问的问题……"
            aria-label={`登录前的${ASSISTANT_DISPLAY_NAME}草稿`}
            aria-describedby="assistant-login-hint"
            maxLength={4000}
          />
          <div className="knowledge-assistant-compose-footer">
            <span id="assistant-login-hint" className="knowledge-assistant-status">
              草稿会保留在当前浏览器
            </span>
            <button
              type="button"
              className="nature-button nature-button-primary min-h-11 px-3 text-sm"
              onClick={onLogin}
            >
              <Icon name="tabler:brand-github" className="h-4 w-4" />
              保存草稿并登录
            </button>
          </div>
          {showAdminLogin ? (
            <button
              type="button"
              className="mx-auto mt-1 min-h-11 px-3 text-sm text-[color:var(--nature-text-soft)] underline underline-offset-4"
              onClick={onAdminLogin}
            >
              管理员入口
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ConversationList({
  conversations,
  selectedId,
  hasNewDraft,
  listId,
  expanded,
  sheet = false,
  onSelect,
  onDelete,
  onCreate,
  onClose,
}: {
  conversations: AssistantConversation[];
  selectedId: string | null;
  hasNewDraft: boolean;
  listId: string;
  expanded: boolean;
  sheet?: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const titleId = `${listId}-title`;
  return (
    <div
      id={listId}
      className={`knowledge-assistant-list${sheet ? " knowledge-assistant-list--sheet" : ""}`}
      data-expanded={expanded}
      data-mobile-sheet={sheet ? "true" : undefined}
      data-testid="assistant-conversation-list"
    >
      <div className="knowledge-assistant-list-heading">
        <div className="min-w-0">
          <p id={titleId} className="text-sm font-semibold">
            对话
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--nature-text-faint)]">
            {conversations.length ? `${conversations.length} 段已保存` : "从这里开始"}
          </p>
        </div>
        <div className="knowledge-assistant-list-actions">
          <button
            type="button"
            className="knowledge-assistant-list-new"
            onClick={onCreate}
            aria-label="新建对话"
            title="新建对话"
          >
            <Icon name="tabler:plus" className="h-4 w-4" />
            <span>新建</span>
          </button>
          <button
            type="button"
            className="knowledge-assistant-list-close"
            onClick={onClose}
            aria-label="关闭对话列表"
            title="关闭对话列表"
          >
            <Icon name="tabler:x" className="h-5 w-5" />
          </button>
        </div>
      </div>
      {selectedId === "new" || hasNewDraft ? (
        <div
          className={`knowledge-assistant-list-item ${selectedId === "new" ? "is-selected" : ""}`}
        >
          <button
            type="button"
            className="knowledge-assistant-list-select"
            aria-current={selectedId === "new" ? "true" : undefined}
            onClick={() => onSelect("new")}
          >
            <span className="block truncate text-sm font-medium">新对话</span>
            <span className="mt-0.5 block text-xs text-[color:var(--nature-text-faint)]">
              草稿 · 发送第一条消息后保存
            </span>
          </button>
        </div>
      ) : null}
      {conversations.length === 0 ? (
        selectedId !== "new" ? (
          <p className="px-2 py-3 text-sm text-[color:var(--nature-text-soft)]">
            还没有保存的对话。
          </p>
        ) : null
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
      {sheet ? (
        <button
          type="button"
          className="knowledge-assistant-list-create-card"
          data-testid="assistant-create-conversation-card"
          onClick={onCreate}
        >
          <span className="knowledge-assistant-list-create-icon" aria-hidden="true">
            <Icon name="tabler:plus" className="h-5 w-5" />
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-sm font-semibold">新建对话</span>
            <span className="mt-0.5 block text-xs text-[color:var(--nature-text-soft)]">
              从一个新的问题开始
            </span>
          </span>
          <Icon
            name="tabler:arrow-up-right"
            className="ml-auto h-4 w-4 shrink-0"
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}

function MessageStream({
  stateKey,
  snapshot,
  onRetry,
}: {
  stateKey: string | null;
  snapshot: AssistantSnapshot | null;
  onRetry?: (message: AssistantMessage) => void;
}) {
  const presentationStore = useMemo(
    () => (stateKey ? createSessionPresentationStore(stateKey) : null),
    [stateKey]
  );
  const container = useRef<HTMLDivElement>(null);
  const followTail = useRef(true);
  const restoredKey = useRef<string | null>(null);
  const presentationId = useId().replace(/:/g, "");
  const scrollHost = useCallback(() => {
    const element = container.current;
    return element &&
      element.scrollHeight > element.clientHeight &&
      getComputedStyle(element).overflowY !== "visible"
      ? element
      : document.scrollingElement;
  }, []);
  useEffect(() => {
    const update = () => {
      const host = scrollHost();
      if (!host || restoredKey.current !== stateKey) return;
      followTail.current = host.scrollHeight - host.scrollTop - host.clientHeight <= 24;
      if (stateKey) writeConversationPresentation(stateKey, "scroll", host.scrollTop);
    };
    const element = container.current;
    element?.addEventListener("scroll", update, { passive: true });
    document.addEventListener("scroll", update, { passive: true });
    window.addEventListener("pagehide", update);
    return () => {
      element?.removeEventListener("scroll", update);
      document.removeEventListener("scroll", update);
      window.removeEventListener("pagehide", update);
    };
  }, [stateKey, scrollHost]);
  useEffect(() => {
    if (!snapshot) return;
    const host = scrollHost();
    if (!host) return;
    if (restoredKey.current !== stateKey) {
      restoredKey.current = null;
      const saved = stateKey ? readConversationPresentation(stateKey).scroll : undefined;
      const frame = requestAnimationFrame(() => {
        host.scrollTop = typeof saved === "number" ? saved : host.scrollHeight;
        restoredKey.current = stateKey;
        followTail.current = host.scrollHeight - host.scrollTop - host.clientHeight <= 24;
      });
      return () => cancelAnimationFrame(frame);
    }
    if (followTail.current) host.scrollTop = host.scrollHeight;
  }, [snapshot, stateKey, scrollHost]);
  const latestGenerationJob = snapshot?.generationJobs.at(-1) ?? null;
  const stoppedWithoutContent = Boolean(
    latestGenerationJob?.status === "cancelled" &&
      latestGenerationJob.assistantMessageId &&
      snapshot?.messages.some(
        (message) =>
          message.id === latestGenerationJob.assistantMessageId &&
          message.role === "assistant" &&
          !message.content.trim() &&
          message.status === "cancelled"
      )
  );
  return (
    <ConversationPresentationContext.Provider value={presentationStore}>
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
          <>
            {snapshot.messages
              .filter(
                (message) =>
                  (message.role === "user" || message.role === "assistant") &&
                  !(
                    message.role === "assistant" &&
                    !message.content.trim() &&
                    message.status === "cancelled"
                  )
              )
              .map((message) => (
                <div
                  className={`knowledge-assistant-message knowledge-assistant-message--${message.role}${message.role === "assistant" && !message.content.trim() ? " knowledge-assistant-message--process-only" : ""}`}
                  data-message-id={message.id}
                  data-message-role={message.role}
                  data-presentation-id={presentationId}
                  data-testid={`assistant-message-${message.role}`}
                  key={message.id}
                >
                  {message.content.trim() || message.role === "user" ? (
                    <AssistantMessageContent
                      className="knowledge-assistant-message-content"
                      messageId={message.id}
                      presentationId={presentationId}
                      role={message.role as "user" | "assistant"}
                      content={message.content}
                      status={message.status}
                      renderMarkdown={ConversationMarkdown}
                    />
                  ) : null}
                  {message.role === "assistant" &&
                  (message.status === "pending" ||
                    message.status === "streaming" ||
                    message.status === "completed" ||
                    message.status === "failed") ? (
                    <AssistantGenerationProcess
                      status={message.status}
                      citations={message.citations}
                    />
                  ) : null}
                  {message.role === "assistant" && message.status === "cancelled" ? (
                    <p className="knowledge-assistant-status-note" role="status">
                      已停止生成
                    </p>
                  ) : null}
                  {message.role === "assistant" && message.status === "failed" ? (
                    <p className="knowledge-assistant-status-note" role="status">
                      生成失败，可重试
                    </p>
                  ) : null}
                  {message.status === "failed" && onRetry ? (
                    <button
                      type="button"
                      className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md border border-[color:var(--nature-line-strong)] px-2 text-xs font-semibold"
                      onClick={() => onRetry(message)}
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
              ))}
            {stoppedWithoutContent ? (
              <p
                className="knowledge-assistant-status-note knowledge-assistant-status-note--standalone"
                data-testid="assistant-stop-status"
                role="status"
              >
                已停止生成
              </p>
            ) : null}
          </>
        )}
      </div>
    </ConversationPresentationContext.Provider>
  );
}

export default function KnowledgeAssistant({ fullPage = false }: Props) {
  const initialUiState = useMemo(readUiState, []);
  const initialPathConversation = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("conversation");
  }, []);
  const [open, setOpen] = useState(fullPage);
  const [isRendered, setIsRendered] = useState(fullPage);
  const [launcherEnabled, setLauncherEnabled] = useState<boolean | null>(fullPage ? true : null);
  const [listExpanded, setListExpanded] = useState(false);
  const [helpExpanded, setHelpExpanded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const listId = useId();
  const helpId = useId();
  const listToggleRef = useRef<HTMLButtonElement>(null);
  const helpToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!listExpanded && !helpExpanded) return;
    const list = () => document.getElementById(listId);
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const mobileSheet = isMobileViewport && listExpanded;
    const focusable = () =>
      Array.from(
        list()?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
    const focusFrame = mobileSheet
      ? window.requestAnimationFrame(() => focusable()[0]?.focus())
      : null;

    if (mobileSheet) document.body.style.overflow = "hidden";

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        list()?.contains(target) ||
        document.getElementById(helpId)?.contains(target) ||
        target.closest(
          ".knowledge-assistant-list-toggle, .knowledge-assistant-header-conversation-toggle, .knowledge-assistant-help-toggle"
        )
      )
        return;
      setListExpanded(false);
      setHelpExpanded(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (list()?.contains(document.activeElement)) {
        listToggleRef.current?.focus();
      }
      if (document.getElementById(helpId)?.contains(document.activeElement)) {
        helpToggleRef.current?.focus();
      }
      setListExpanded(false);
      setHelpExpanded(false);
    };
    const handleTab = (event: KeyboardEvent) => {
      if (!mobileSheet || event.key !== "Tab") return;
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
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape, true);
    document.addEventListener("keydown", handleTab);
    return () => {
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape, true);
      document.removeEventListener("keydown", handleTab);
      document.body.style.overflow = previousOverflow;
      if (mobileSheet) previousFocus?.focus();
    };
  }, [helpExpanded, helpId, isMobileViewport, listExpanded, listId]);
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
  const [isStopping, setIsStopping] = useState(false);
  const selectedRef = useRef(selectedId);
  const draftsRef = useRef(drafts);
  const pollTimer = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const stoppingRef = useRef(false);
  const submissionRequestsRef = useRef(initialUiState.pendingRequests);
  const pendingRequestsRef = useRef(initialUiState.pendingRequests);
  const newConversationContextRef = useRef<AssistantContext | null>(
    initialUiState.newConversationContext
  );
  const newConversationContextFrozenRef = useRef(initialUiState.newConversationContextFrozen);
  const explicitConversationSelectionRef = useRef(Boolean(initialPathConversation));
  const explicitSelectionHandoffRef = useRef(Boolean(initialPathConversation));
  const explicitNewConversationSelectionRef = useRef(false);
  const selectionRevisionRef = useRef(0);
  const listRequestRef = useRef(0);
  const snapshotRequestRef = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composerResizeStartRef = useRef<{ height: number; y: number } | null>(null);
  const principalIdRef = useRef<string | null>(null);
  principalIdRef.current = auth?.principal?.id ?? null;

  useEffect(() => {
    if (fullPage) {
      setIsRendered(true);
      return;
    }
    if (open) {
      setIsRendered(true);
      return;
    }
    const timer = window.setTimeout(() => setIsRendered(false), PANEL_EXIT_DURATION);
    return () => window.clearTimeout(timer);
  }, [fullPage, open]);
  useEffect(() => {
    if (open) return;
    setListExpanded(false);
    setHelpExpanded(false);
  }, [open]);
  useEffect(() => {
    if (fullPage) return;
    let cancelled = false;
    void readSiteFeatureConfig()
      .then((features) => {
        if (!cancelled) setLauncherEnabled(features.assistant.launcher.enabled);
      })
      .catch(() => {
        if (!cancelled) setLauncherEnabled(getBuildDefaultAssistantLauncherEnabled());
      });
    return () => {
      cancelled = true;
    };
  }, [fullPage]);

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
      if (principalId) {
        const prefix = `${uiStateKey(principalId)}:presentation:`;
        for (const key of Object.keys(window.sessionStorage)) {
          if (key.startsWith(prefix)) window.sessionStorage.removeItem(key);
        }
      }
    } catch {
      // Session storage is an enhancement; assistant state remains server-backed.
    }
  }, []);

  const restoreAuthenticatedState = useCallback(
    (principalId: string, handoff: boolean) => {
      if (handoff) explicitSelectionHandoffRef.current = true;
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
      const requestSequence = ++listRequestRef.current;
      const selectionRevision = selectionRevisionRef.current;
      const data = await readAssistantList();
      if (listRequestRef.current !== requestSequence) return;
      setConversations(data.conversations);
      setQuota(data.quota);
      const requested = selectedRef.current;
      const context = getClippingContext();
      const hasExplicitDraft = Object.keys(draftsRef.current).some(
        (key) => key === "new" || key.startsWith("new:clipping:")
      );
      const hasExplicitConversationPath =
        typeof window !== "undefined" &&
        Boolean(new URL(window.location.href).searchParams.get("conversation"));
      const hasExplicitUiState =
        hasExplicitConversationPath ||
        explicitSelectionHandoffRef.current ||
        explicitNewConversationSelectionRef.current ||
        hasExplicitDraft;
      const selectionChangedWhileLoading = selectionRevisionRef.current !== selectionRevision;
      explicitSelectionHandoffRef.current = false;
      if (preferContext && context && !selectionChangedWhileLoading && !hasExplicitUiState) {
        const contextual = data.conversations.find((conversation) =>
          contextForConversation(conversation, context)
        );
        const nextId = contextual?.id ?? "new";
        const nextContext = contextual ? context : nextId === "new" ? context : null;
        explicitConversationSelectionRef.current = false;
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
        explicitConversationSelectionRef.current = true;
        selectedRef.current = "new";
        setSelectedId("new");
        const nextContext = newConversationContextFrozenRef.current
          ? newConversationContextRef.current
          : (context ?? newConversationContextRef.current);
        newConversationContextRef.current = nextContext;
        newConversationContextFrozenRef.current =
          newConversationContextFrozenRef.current || Boolean(nextContext);
        setNewConversationContext(nextContext);
        setNewConversationContextFrozen(newConversationContextFrozenRef.current);
        return;
      }
      if (requested && data.conversations.some((conversation) => conversation.id === requested)) {
        explicitConversationSelectionRef.current = true;
        const requestedConversation = data.conversations.find(
          (conversation) => conversation.id === requested
        );
        const nextContext = contextForConversation(requestedConversation, context, {
          explicit: true,
        });
        newConversationContextRef.current = nextContext;
        setNewConversationContext(nextContext);
        return;
      }
      if (requested === "new") return;
      explicitConversationSelectionRef.current = false;
      const nextConversation = data.conversations[0];
      const nextId = nextConversation?.id ?? null;
      const nextContext = contextForConversation(nextConversation, context);
      selectedRef.current = nextId;
      setSelectedId(nextId);
      newConversationContextRef.current = nextContext;
      newConversationContextFrozenRef.current = false;
      setNewConversationContext(nextContext);
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
    if (!fullPage && launcherEnabled !== true) return;
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
  }, [clearStoredUiState, fullPage, launcherEnabled, loadAuth]);

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
      const isCurrent = (id = conversationId) =>
        selectedRef.current === id && snapshotRequestRef.current === requestSequence;
      try {
        let currentConversationId = conversationId;
        const context =
          newConversationContextRef.current ??
          contextForConversation(
            conversations.find((conversation) => conversation.id === conversationId),
            getClippingContext(),
            { explicit: explicitConversationSelectionRef.current }
          );
        if (context && !newConversationContextRef.current) {
          newConversationContextRef.current = context;
          setNewConversationContext(context);
        }
        if (context && !explicitConversationSelectionRef.current) {
          const clipping = await readClippingAssistantSnapshot(context.slug);
          if (!isCurrent()) return null;
          if (!clipping.conversationId) {
            selectedRef.current = "new";
            setSelectedId("new");
            setSnapshot(null);
            return null;
          }
          currentConversationId = clipping.conversationId;
          if (currentConversationId !== conversationId) {
            selectedRef.current = currentConversationId;
            setSelectedId(currentConversationId);
          }
        }
        const next = await readAssistantSnapshot(currentConversationId);
        if (!isCurrent(currentConversationId)) return null;
        setSnapshot(next);
        setOffline(false);
        setRequestError(null);
        void readAssistantQuota()
          .then((nextQuota) => {
            if (isCurrent(currentConversationId)) setQuota(nextQuota);
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
    [applyUiState, conversations]
  );

  useEffect(() => {
    if (
      fullPage ||
      openRef.current ||
      !auth?.authenticated ||
      !selectedId ||
      selectedId === "new"
    ) {
      return;
    }
    void loadSnapshot(selectedId);
  }, [auth?.authenticated, fullPage, loadSnapshot, selectedId]);

  useEffect(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    if (!auth?.authenticated || !selectedId || selectedId === "new" || (!fullPage && !open)) {
      if (!selectedId || selectedId === "new") setSnapshot(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (stoppingRef.current || submittingRef.current) {
        pollTimer.current = window.setTimeout(poll, ASSISTANT_STOP_POLL_INTERVAL_MS);
        return;
      }
      const next = await loadSnapshot(selectedId);
      if (cancelled) return;
      pollTimer.current = window.setTimeout(poll, isGenerating(next) ? 650 : 2400);
    };
    void poll();
    return () => {
      cancelled = true;
      if (pollTimer.current !== null) {
        window.clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [auth?.authenticated, fullPage, open, selectedId, loadSnapshot]);

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
    selectionRevisionRef.current += 1;
    explicitConversationSelectionRef.current = true;
    explicitNewConversationSelectionRef.current = id === "new";
    selectedRef.current = id;
    setSelectedId(id);
    const nextContext =
      id === "new"
        ? getClippingContext()
        : contextForConversation(
            conversations.find((conversation) => conversation.id === id),
            getClippingContext(),
            { explicit: true }
          );
    newConversationContextRef.current = nextContext;
    newConversationContextFrozenRef.current = id === "new";
    setNewConversationContext(nextContext);
    setNewConversationContextFrozen(id === "new");
    setSnapshot(null);
    setRequestError(null);
    setOffline(false);
  };

  const createConversation = () => {
    selectionRevisionRef.current += 1;
    explicitConversationSelectionRef.current = true;
    explicitNewConversationSelectionRef.current = true;
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
    const selectedConversation = conversations.find(
      (conversation) => conversation.id === selectedId
    );
    const pageContext = getClippingContext();
    const context =
      newConversationContextRef.current ??
      (selectedId === "new" && !newConversationContextFrozenRef.current ? pageContext : null) ??
      contextForConversation(selectedConversation, pageContext, {
        explicit: explicitConversationSelectionRef.current,
      });
    if (selectedConversation?.kind === "clipping" && !context) {
      setRequestError("剪藏上下文已失效，请从文章页重新打开这段对话。");
      return;
    }
    const key = draftKey(selectedId, context);
    const draftValue = contentOverride ?? draftsRef.current[key] ?? "";
    const content = draftValue.trim();
    const submittedDraft = contentOverride === undefined ? draftValue : null;
    if (!content || !auth?.authenticated || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (isGenerating(snapshot) && !(await stop())) return;
      if (context && selectedConversation?.kind === "clipping" && selectedId !== "new") {
        const current = await readClippingAssistantSnapshot(context.slug);
        if (current.conversationId !== selectedId) {
          setRequestError("这段对话对应旧的剪藏目标，仅支持查看；请从当前文章新建或继续对话。");
          return;
        }
      }
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
      const result = context
        ? await submitClippingAssistantMessage({ slug: context.slug, requestId, content })
        : await submitAssistantMessage({
            conversationId: selectedId === "new" ? null : selectedId,
            requestId,
            clientRequestId: requestId,
            content,
            title:
              selectedId === "new" || selectedId === null
                ? Array.from(content.replace(/\s+/gu, " ")).slice(0, 60).join("")
                : undefined,
            kind: "general",
          });
      const shouldMigrateDraft =
        (requestSelectedId === null || requestSelectedId === "new") &&
        selectedRef.current === requestSelectedId;
      if (submittedDraft !== null) {
        setDrafts((current) => {
          const next = { ...current };
          const currentDraft = current[key];
          if (shouldMigrateDraft && currentDraft !== submittedDraft) {
            if (currentDraft !== undefined) next[result.conversationId] = currentDraft;
            delete next[key];
          } else if (currentDraft === submittedDraft) {
            delete next[key];
          }
          return next;
        });
      }
      delete submissionRequestsRef.current[key];
      const { [key]: _pending, ...remainingPendingRequests } = pendingRequestsRef.current;
      pendingRequestsRef.current = remainingPendingRequests;
      setPendingRequests(remainingPendingRequests);
      if (selectedRef.current === requestSelectedId) {
        explicitNewConversationSelectionRef.current = false;
        explicitConversationSelectionRef.current = true;
        selectedRef.current = result.conversationId;
        setSelectedId(result.conversationId);
        newConversationContextRef.current = context;
        newConversationContextFrozenRef.current = false;
        setNewConversationContext(context);
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

  const retry = async (failedMessage: AssistantMessage) => {
    if (!snapshot || !selectedId) return;
    const userMessage = findRetryUserMessage(snapshot, failedMessage);
    if (userMessage) await send(userMessage.content);
  };

  const stop = async () => {
    const activeJob = snapshot?.activeGenerationJob;
    if (!selectedId || !activeJob || stoppingRef.current) return false;
    const selectedConversation = conversations.find(
      (conversation) => conversation.id === selectedId
    );
    const context =
      newConversationContextRef.current ??
      contextForConversation(selectedConversation, getClippingContext());
    const turnId = activeJob.id;
    stoppingRef.current = true;
    setIsStopping(true);
    try {
      if (context) {
        await stopClippingAssistantGeneration({
          slug: context.slug,
          turnId,
        });
      } else {
        await stopAssistantGeneration({
          conversationId: selectedId,
          turnId,
        });
      }
      const deadline = Date.now() + ASSISTANT_STOP_WAIT_TIMEOUT_MS;
      let next = await loadSnapshot(selectedId);
      while (next?.activeGenerationJob?.id === turnId && isGenerating(next)) {
        if (Date.now() >= deadline) {
          setRequestError("停止生成仍在处理中，请稍后再试。");
          return false;
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, ASSISTANT_STOP_POLL_INTERVAL_MS);
        });
        next = await loadSnapshot(selectedId);
      }
      if (!next) return false;
      if (next.activeGenerationJob && isGenerating(next)) {
        setRequestError("停止生成仍在处理中，请稍后再试。");
        return false;
      }
      return true;
    } catch (error) {
      setRequestError(errorMessage(error));
      return false;
    } finally {
      stoppingRef.current = false;
      setIsStopping(false);
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
    const pageContext = getClippingContext();
    const context =
      newConversationContextRef.current ??
      (selectedId === "new" && !newConversationContextFrozenRef.current ? pageContext : null) ??
      contextForConversation(
        conversations.find((conversation) => conversation.id === selectedId),
        pageContext,
        { explicit: explicitConversationSelectionRef.current }
      );
    writeUiState(uiStateKey(auth?.principal?.id), {
      selectedId,
      drafts,
      pendingRequests: pendingRequestsRef.current,
      newConversationContext: context,
      newConversationContextFrozen: newConversationContextFrozenRef.current,
    });
    const url = new URL(toPublicSitePath("/chat"), window.location.origin);
    if (selectedId && selectedId !== "new") url.searchParams.set("conversation", selectedId);
    if (context) {
      url.searchParams.set("clipping", context.slug);
      if (context.memoId) url.searchParams.set("clippingMemoId", context.memoId);
    }
    window.location.assign(
      isWebDemoBuildEnabled()
        ? getWebDemoShareUrl(getWebDemoRuntimeState(window.location), url)
        : url.toString()
    );
  };

  const currentDraft = drafts[draftKey(selectedId, newConversationContextRef.current)] || "";
  const generating = isGenerating(snapshot);
  const showComposerStop = generating && !currentDraft.trim();
  const composerActionDisabled =
    isSubmitting || isStopping || (!showComposerStop && !currentDraft.trim());

  // biome-ignore lint/correctness/useExhaustiveDependencies: draft changes trigger the DOM measurement.
  useEffect(() => {
    const input = composerInputRef.current;
    if (!input) return;

    input.style.height = "auto";
    const minHeight = Number.parseFloat(window.getComputedStyle(input).minHeight);
    const maxHeight = window.innerHeight * 0.5;
    input.style.height = `${Math.min(maxHeight, Math.max(minHeight, input.scrollHeight))}px`;
  }, [currentDraft]);

  const resizeComposerInput = (height: number) => {
    const input = composerInputRef.current;
    if (!input) return;

    const minHeight = Number.parseFloat(window.getComputedStyle(input).minHeight);
    const maxHeight = window.innerHeight * 0.5;
    input.style.height = `${Math.min(maxHeight, Math.max(minHeight, height))}px`;
  };

  const handleComposerResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    const input = composerInputRef.current;
    if (!input) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    composerResizeStartRef.current = {
      height: input.getBoundingClientRect().height,
      y: event.clientY,
    };
  };

  const handleComposerResizeMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = composerResizeStartRef.current;
    if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;

    resizeComposerInput(start.height + start.y - event.clientY);
  };

  const handleComposerResizeEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    composerResizeStartRef.current = null;
  };

  const handleComposerResizeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const input = composerInputRef.current;
    if (!input) return;

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      resizeComposerInput(
        input.getBoundingClientRect().height + (event.key === "ArrowUp" ? 24 : -24)
      );
    }
  };
  const title = snapshot
    ? formatConversationTitle(snapshot.conversation)
    : selectedId === "new"
      ? "新对话"
      : ASSISTANT_DISPLAY_NAME;
  const renderConversationList = (sheet = false) => (
    <ConversationList
      conversations={conversations}
      selectedId={selectedId}
      hasNewDraft={Boolean(drafts[draftKey("new", getClippingContext())]?.trim())}
      listId={listId}
      expanded={listExpanded}
      sheet={sheet}
      onSelect={(id) => {
        selectConversation(id);
        if (listExpanded) listToggleRef.current?.focus();
        setListExpanded(false);
      }}
      onDelete={remove}
      onCreate={() => {
        createConversation();
        if (listExpanded) listToggleRef.current?.focus();
        setListExpanded(false);
      }}
      onClose={() => setListExpanded(false)}
    />
  );
  const conversationList = renderConversationList();
  const helpPopover = (
    <AssistantHelpPanel
      helpId={helpId}
      quota={quota}
      snapshot={snapshot}
      onClose={() => {
        setHelpExpanded(false);
        helpToggleRef.current?.focus();
      }}
    />
  );
  const conversationListView =
    isMobileViewport && listExpanded && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              className="knowledge-assistant-list-backdrop"
              data-testid="assistant-conversation-sheet-backdrop"
              aria-label="关闭对话列表"
              onClick={() => setListExpanded(false)}
            />
            <div
              className="knowledge-assistant-list-dialog"
              data-testid="assistant-conversation-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${listId}-title`}
            >
              {renderConversationList(true)}
            </div>
          </>,
          document.body
        )
      : fullPage
        ? conversationList
        : null;
  const body = (
    <>
      {authLoading ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-[color:var(--nature-text-soft)]">
          正在检查登录状态……
        </div>
      ) : !auth?.authenticated ? (
        <GuestAssistantPreview
          draft={currentDraft}
          error={requestError}
          offline={offline}
          onDraftChange={updateDraft}
          onLogin={login}
          onAdminLogin={() => void adminLogin()}
          onRetry={() => void loadAuth()}
          showAdminLogin={auth?.canStartAdmin === true}
        />
      ) : (
        <div className="knowledge-assistant-body">
          {conversationListView}
          <div className="knowledge-assistant-content">
            {fullPage ? (
              <div className="knowledge-assistant-toolbar">
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold">{title}</h1>
                  <p className="knowledge-assistant-status" data-testid="assistant-quota">
                    {formatQuota(quota)}
                  </p>
                </div>
                <div className="knowledge-assistant-toolbar-actions">
                  <div className="knowledge-assistant-help-anchor">
                    <button
                      type="button"
                      className="knowledge-assistant-icon-button knowledge-assistant-help-toggle"
                      ref={helpToggleRef}
                      aria-expanded={helpExpanded}
                      aria-controls={helpId}
                      aria-label="帮助"
                      title="帮助"
                      onClick={() => {
                        setHelpExpanded((value) => !value);
                        setListExpanded(false);
                      }}
                    >
                      <Icon name="tabler:help-circle" className="h-4 w-4" />
                    </button>
                    {helpExpanded ? helpPopover : null}
                  </div>
                  <button
                    type="button"
                    className="knowledge-assistant-list-toggle"
                    ref={listToggleRef}
                    aria-expanded={listExpanded}
                    aria-controls={listId}
                    onClick={() => {
                      setListExpanded((value) => !value);
                      setHelpExpanded(false);
                    }}
                  >
                    <Icon name="tabler:messages" className="h-4 w-4" />
                    <span>切换对话</span>
                  </button>
                </div>
              </div>
            ) : null}
            {requestError ? (
              <AssistantErrorAlert
                message={requestError}
                offline={offline}
                onRetry={() =>
                  selectedId && selectedId !== "new"
                    ? void loadSnapshot(selectedId)
                    : void loadList()
                }
              />
            ) : null}
            <MessageStream
              key={`${auth?.principal?.id ?? "anonymous"}:${selectedId}`}
              stateKey={
                auth?.principal?.id
                  ? `${uiStateKey(auth.principal.id)}:presentation:${selectedId}`
                  : null
              }
              snapshot={snapshot}
              onRetry={(message) => void retry(message)}
            />
            <div className="knowledge-assistant-compose">
              <button
                type="button"
                className="knowledge-assistant-compose-resize-handle"
                aria-label="调整输入框高度"
                title="拖动调整输入框高度"
                onPointerDown={handleComposerResizeStart}
                onPointerMove={handleComposerResizeMove}
                onPointerUp={handleComposerResizeEnd}
                onPointerCancel={handleComposerResizeEnd}
                onKeyDown={handleComposerResizeKeyDown}
              >
                <span aria-hidden="true" />
              </button>
              <textarea
                className="knowledge-assistant-compose-input text-sm leading-6 outline-none"
                ref={composerInputRef}
                value={currentDraft}
                onChange={(event) => updateDraft(event.target.value)}
                placeholder="询问公开文章或项目经验……"
                aria-label={`${ASSISTANT_DISPLAY_NAME}问题`}
                maxLength={4000}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    event.shiftKey ||
                    event.ctrlKey ||
                    event.altKey ||
                    event.metaKey ||
                    event.isComposing
                  )
                    return;
                  event.preventDefault();
                  void send();
                }}
              />
              <div className="knowledge-assistant-compose-footer">
                <span className="knowledge-assistant-status">草稿会保留在当前浏览器</span>
                <div className="knowledge-assistant-compose-actions">
                  <span
                    className="knowledge-assistant-shortcut"
                    data-testid="assistant-send-shortcuts"
                  >
                    <span className="knowledge-assistant-shortcut-item">
                      <kbd aria-label="Enter">
                        <Icon name="tabler:corner-down-left" className="h-3 w-3" />
                      </kbd>
                      <span>发送</span>
                    </span>
                    <span className="knowledge-assistant-shortcut-item">
                      <kbd aria-label="Shift">
                        <Icon name="tabler:arrow-big-up" className="h-3 w-3" />
                      </kbd>
                      <span className="knowledge-assistant-shortcut-plus" aria-hidden="true">
                        +
                      </span>
                      <kbd aria-label="Enter">
                        <Icon name="tabler:corner-down-left" className="h-3 w-3" />
                      </kbd>
                      <span>换行</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    className="knowledge-assistant-send-button nature-button nature-button-primary text-sm"
                    onClick={() => void (showComposerStop ? stop() : send())}
                    disabled={composerActionDisabled}
                    aria-label={showComposerStop ? "停止生成" : "发送"}
                    title={showComposerStop ? "停止生成" : "发送"}
                  >
                    <Icon
                      name={showComposerStop ? "tabler:square" : "tabler:send-2"}
                      className="h-4 w-4"
                    />
                    {showComposerStop ? "停止" : "发送"}
                  </button>
                </div>
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
        <div className="knowledge-assistant-page-grid">{body}</div>
      </main>
    );
  }

  if (launcherEnabled !== true) return null;

  return (
    <>
      <button
        type="button"
        className="knowledge-assistant-fab"
        data-testid="assistant-fab"
        ref={triggerRef}
        onClick={() => {
          setIsRendered(true);
          setOpen(true);
        }}
        aria-expanded={open}
      >
        <Icon name="tabler:sparkles" className="h-5 w-5" />
        {ASSISTANT_DISPLAY_NAME}
      </button>
      {isRendered ? (
        <>
          <div
            className="knowledge-assistant-overlay"
            data-state={open ? "open" : "closed"}
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <section
            className="knowledge-assistant-panel"
            data-state={open ? "open" : "closed"}
            data-list-expanded={listExpanded ? "true" : "false"}
            data-testid="assistant-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-hidden={!open}
            inert={!open}
            aria-label={ASSISTANT_DISPLAY_NAME}
          >
            <header className="knowledge-assistant-header">
              {auth?.authenticated ? (
                <div className="knowledge-assistant-header-conversation">
                  <div className="knowledge-assistant-header-conversation-title-row">
                    <h2 className="knowledge-assistant-header-conversation-title">
                      <button
                        type="button"
                        className="knowledge-assistant-icon-button knowledge-assistant-header-conversation-toggle"
                        ref={listToggleRef}
                        aria-label={`切换对话，当前为${title}`}
                        aria-expanded={listExpanded}
                        aria-controls={listId}
                        title="切换对话"
                        onClick={() => setListExpanded((value) => !value)}
                      >
                        <span className="knowledge-assistant-header-conversation-title-text">
                          {title}
                        </span>
                        <Icon
                          name={listExpanded ? "tabler:chevron-up" : "tabler:chevron-down"}
                          className="h-4 w-4"
                        />
                      </button>
                    </h2>
                    {!fullPage && !isMobileViewport ? conversationList : null}
                  </div>
                  <p className="knowledge-assistant-status" data-testid="assistant-quota">
                    {formatQuota(quota)}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold">{ASSISTANT_DISPLAY_NAME}</p>
                </div>
              )}
              <div className="knowledge-assistant-header-actions">
                {auth?.authenticated ? (
                  <div className="knowledge-assistant-help-anchor">
                    <button
                      type="button"
                      className="knowledge-assistant-icon-button knowledge-assistant-help-toggle"
                      ref={helpToggleRef}
                      aria-expanded={helpExpanded}
                      aria-controls={helpId}
                      aria-label="帮助"
                      title="帮助"
                      onClick={() => {
                        setHelpExpanded((value) => !value);
                        setListExpanded(false);
                      }}
                    >
                      <Icon name="tabler:help-circle" className="h-4 w-4" />
                    </button>
                    {helpExpanded ? helpPopover : null}
                  </div>
                ) : null}
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
                  aria-label={`关闭${ASSISTANT_DISPLAY_NAME}`}
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
