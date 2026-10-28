import {
  getMemoListWebDemoCursorPage,
  getMemoListWebDemoInitialPageForState,
  getMemoListWebDemoRecord,
} from "../../site/lib/memo-list-web-demo";
import { projectRuntimeMetricsBySlug } from "../../site/lib/project-runtime-metrics";
import type { PublicMemoRecord } from "../public-site/snapshot";
import type {
  AssistantCitation,
  AssistantConversation,
  AssistantGenerationJob,
  AssistantMessage,
  FrontendAuthState,
  FrontendPrincipal,
} from "./assistant-contracts";
import {
  createConsoleWebDemoStore,
  getConsoleWebDemoClippingArticle,
  getConsoleWebDemoPersona,
} from "./console-web-demo";
import { projectCatalog } from "./project-catalog";
import { positiveSearchTerms, searchHighlightSpans } from "./search/highlights";
import { planNativeQuery } from "./search/native-query";
import { searchModeSchema } from "./search/settings";
import {
  PLAYBOOK_SEARCH_DEMO_DOCUMENTS,
  SEARCH_DEMO_DENSE_DOCUMENTS,
  SEARCH_DEMO_DOCUMENTS,
} from "./search/web-demo-fixtures";
import { composeSystemShareMemoContent, normalizeSystemShareEditor } from "./system-share";
import {
  assertWebDemoRequestAvailable,
  getWebDemoEnvironment,
  getWebDemoRequestSignal,
  getWebDemoSceneState,
  getWebDemoState,
  isWebDemoBuildEnabled,
  recordWebDemoMutation,
  WEB_DEMO_ACTION_EVENT,
  WEB_DEMO_CLIPPING_SLUG,
  type WebDemoApp,
  type WebDemoEnvironment,
  type WebDemoScene,
  waitForWebDemoRequest,
} from "./web-demo-runtime";

const consoleWebDemoStore = createConsoleWebDemoStore();

type DemoAssistantRecord = {
  scene: WebDemoScene;
  isSeed: boolean;
  conversation: AssistantConversation;
  messages: AssistantMessage[];
  generationJob: AssistantGenerationJob | null;
};

type DemoAssistantSubmission = {
  status: "queued";
  conversationId: string;
  turnId: string;
  requestId: string;
  userMessageId: string;
  assistantMessageId: string;
  createdConversation: boolean;
};

const demoAssistantRecords = new Map<string, DemoAssistantRecord>();
const demoAssistantSeeded = new Set<string>();
const demoAssistantDeleted = new Set<string>();
const demoAssistantSubmissions = new Map<string, DemoAssistantSubmission>();
let demoAssistantSequence = 1;
let demoAssistantResetWindow: Window | null = null;
let demoAssistantStorageWindow: Window | null = null;
const DEMO_ASSISTANT_STORAGE_KEY = "web-demo-assistant-state";

function clearDemoAssistantState() {
  demoAssistantRecords.clear();
  demoAssistantSeeded.clear();
  demoAssistantDeleted.clear();
  demoAssistantSubmissions.clear();
  demoAssistantSequence = 1;
}

function restoreDemoAssistantState() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(DEMO_ASSISTANT_STORAGE_KEY) || "null") as {
      records?: unknown;
      seeded?: unknown;
      deleted?: unknown;
      submissions?: unknown;
      sequence?: unknown;
    } | null;
    if (!raw) return;
    if (Array.isArray(raw.records)) {
      for (const entry of raw.records) {
        if (!Array.isArray(entry) || entry.length !== 2 || !entry[0] || !entry[1]) continue;
        demoAssistantRecords.set(String(entry[0]), entry[1] as DemoAssistantRecord);
      }
    }
    if (Array.isArray(raw.seeded))
      raw.seeded.forEach((key) => {
        demoAssistantSeeded.add(String(key));
      });
    if (Array.isArray(raw.deleted))
      raw.deleted.forEach((id) => {
        demoAssistantDeleted.add(String(id));
      });
    if (Array.isArray(raw.submissions)) {
      for (const entry of raw.submissions) {
        if (!Array.isArray(entry) || entry.length !== 2 || !entry[0] || !entry[1]) continue;
        demoAssistantSubmissions.set(String(entry[0]), entry[1] as DemoAssistantSubmission);
      }
    }
    if (typeof raw.sequence === "number" && Number.isInteger(raw.sequence) && raw.sequence > 0)
      demoAssistantSequence = raw.sequence;
  } catch {
    clearDemoAssistantState();
  }
}

function persistDemoAssistantState() {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(
      DEMO_ASSISTANT_STORAGE_KEY,
      JSON.stringify({
        records: Array.from(demoAssistantRecords.entries()),
        seeded: Array.from(demoAssistantSeeded),
        deleted: Array.from(demoAssistantDeleted),
        submissions: Array.from(demoAssistantSubmissions.entries()),
        sequence: demoAssistantSequence,
      })
    );
  } catch {
    // Session storage is an enhancement; the current document keeps the demo usable.
  }
}

function ensureDemoAssistantResetListener() {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  if (demoAssistantStorageWindow !== window) {
    clearDemoAssistantState();
    demoAssistantStorageWindow = window;
    restoreDemoAssistantState();
  }
  if (demoAssistantResetWindow === window) return;
  demoAssistantResetWindow = window;
  window.addEventListener(WEB_DEMO_ACTION_EVENT, (event) => {
    const action = (event as CustomEvent<{ action?: string }>).detail?.action;
    if (action === "reset-state") {
      clearDemoAssistantState();
      persistDemoAssistantState();
    }
  });
}

function demoFrontendPrincipal(environment: WebDemoEnvironment): FrontendPrincipal | null {
  if (environment.persona === "guest") return null;
  const isAdmin = environment.persona === "admin";
  return {
    id: isAdmin ? "demo-admin" : "demo-user",
    kind: isAdmin ? "admin" : "reader",
    isAdmin,
    displayName: isAdmin ? "Ivan" : "Demo User",
    email: isAdmin ? "admin@example.com" : "user@example.com",
    avatarUrl: "/site-assets/default-avatar.svg",
    profileUrl: "https://github.com/example",
    adminUserId: isAdmin ? "demo-admin" : null,
    readerId: isAdmin ? "demo-admin-reader" : "demo-user-reader",
    github: {
      id: isAdmin ? "demo-admin-github" : "demo-user-github",
      login: isAdmin ? "ivan-demo" : "reader-demo",
      displayName: isAdmin ? "Ivan" : "Demo User",
      avatarUrl: "/site-assets/default-avatar.svg",
      profileUrl: "https://github.com/example",
    },
  };
}

function demoFrontendAuth(environment: WebDemoEnvironment): FrontendAuthState {
  const principal = demoFrontendPrincipal(environment);
  return {
    authenticated: Boolean(principal),
    principal,
    expiresAt: principal ? Date.now() + 7 * 86_400_000 : null,
    loggedOut: !principal,
  };
}

function demoAssistantQuota(environment: WebDemoEnvironment, scene: WebDemoScene) {
  const exhausted = scene === "assistant-quota-exhausted";
  const unlimited = environment.persona === "admin";
  const policy = {
    maxConversations: 3,
    retentionMs: 7 * 86_400_000,
    tokenHourlyLimit: 10_000,
    tokenWeeklyLimit: 50_000,
    questionHourlyLimit: 20,
    questionWeeklyLimit: 100,
  };
  return {
    policy,
    tokenHour: exhausted && !unlimited ? policy.tokenHourlyLimit : 0,
    tokenWeek: exhausted && !unlimited ? policy.tokenWeeklyLimit : 0,
    questionHour: exhausted && !unlimited ? policy.questionHourlyLimit : 0,
    questionWeek: exhausted && !unlimited ? policy.questionWeeklyLimit : 0,
    activeConversationCount: Array.from(demoAssistantRecords.values()).filter(
      (record) =>
        record.conversation.frontendUserId ===
          (environment.persona === "admin" ? "demo-admin" : "demo-user") &&
        (!record.isSeed || record.scene === scene) &&
        record.conversation.status === "active"
    ).length,
    unlimited,
    tokenHourlyRemaining: unlimited ? null : exhausted ? 0 : policy.tokenHourlyLimit,
    tokenWeeklyRemaining: unlimited ? null : exhausted ? 0 : policy.tokenWeeklyLimit,
    questionHourlyRemaining: unlimited ? null : exhausted ? 0 : policy.questionHourlyLimit,
    questionWeeklyRemaining: unlimited ? null : exhausted ? 0 : policy.questionWeeklyLimit,
  };
}

function demoAssistantRecord(
  environment: WebDemoEnvironment,
  scene: WebDemoScene,
  id?: string,
  options: {
    withHistory?: boolean;
    kind?: "general" | "clipping";
    clippingMemoId?: string | null;
  } = {}
) {
  const principal = demoFrontendPrincipal(environment);
  if (!principal) return null;
  const withHistory = options.withHistory ?? true;
  const recordId = id || `demo-assistant-${principal.id}-${scene}`;
  const existing = demoAssistantRecords.get(recordId);
  if (existing) return existing;
  const now = Date.now();
  const expired = scene === "assistant-expired";
  const generating = scene === "assistant-generating";
  const failed = scene === "assistant-failure";
  const conversation: AssistantConversation = {
    id: recordId,
    frontendUserId: principal.id,
    kind: options.kind ?? "general",
    title: "公开知识库问答",
    clippingMemoId: options.clippingMemoId ?? null,
    clippingVersionId: null,
    status: expired ? "expired" : "active",
    createdAt: now - 20_000,
    lastUserMessageAt: withHistory ? now - 10_000 : null,
    expiresAt: expired ? now - 1_000 : now + 7 * 86_400_000,
    deletedAt: null,
  };
  const userMessage: AssistantMessage = {
    id: `${recordId}-user`,
    conversationId: recordId,
    sequence: 1,
    role: "user",
    content: "这个站点主要记录什么？",
    status: "completed",
    clientRequestId: null,
    createdAt: now - 10_000,
    updatedAt: now - 10_000,
    completedAt: now - 10_000,
    citations: [],
  };
  const assistantMessage: AssistantMessage = {
    id: `${recordId}-assistant`,
    conversationId: recordId,
    sequence: 2,
    role: "assistant",
    content: generating
      ? "正在整理公开资料……"
      : failed
        ? "这次生成没有完成，请重试。"
        : "这是一个记录工程实践、项目经验与公开文章的知识库。",
    status: generating ? "streaming" : failed ? "failed" : "completed",
    clientRequestId: null,
    createdAt: now - 9_000,
    updatedAt: now - 9_000,
    completedAt: generating ? null : now - 8_000,
    citations: demoAssistantCitations(now - 9_000, `${recordId}-assistant`),
  };
  const generationJob: AssistantGenerationJob | null = {
    id: `${recordId}-job`,
    conversationId: recordId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    requestId: `${recordId}-request`,
    status: generating ? "running" : failed ? "failed" : "completed",
    attempt: 1,
    leaseUntil: null,
    cancelRequested: false,
    startedAt: now - 8_500,
    finishedAt: generating ? null : now - 8_000,
    errorCode: failed ? "provider-error" : null,
    createdAt: now - 9_000,
    updatedAt: now - 8_000,
  };
  const record: DemoAssistantRecord = {
    scene,
    isSeed: !id,
    conversation,
    messages: withHistory ? [userMessage, assistantMessage] : [],
    generationJob: withHistory ? generationJob : null,
  };
  demoAssistantRecords.set(recordId, record);
  persistDemoAssistantState();
  return record;
}

function demoAssistantSnapshot(record: DemoAssistantRecord) {
  return {
    conversation: record.conversation,
    messages: record.messages,
    generationJobs: record.generationJob ? [record.generationJob] : [],
    activeGenerationJob:
      record.generationJob?.status === "queued" || record.generationJob?.status === "running"
        ? record.generationJob
        : null,
    eventSequence: record.messages.at(-1)?.sequence ?? 0,
  };
}

function demoAssistantCitations(now: number, messageId: string): AssistantCitation[] {
  return [
    {
      id: `demo-assistant-citation-${now}`,
      messageId,
      source: "blog",
      sourceId: null,
      sourceType: "post",
      slug: "knowledge-base-overview",
      title: "知识库公开内容说明",
      href: "/posts/knowledge-base-overview/",
      location: null,
      snippet: null,
      createdAt: now,
    },
  ];
}

export function combineAbortSignals(...signals: Array<AbortSignal | null | undefined>) {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length <= 1) return activeSignals[0];
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
    return AbortSignal.any(activeSignals);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  activeSignals.forEach((signal) => {
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  return controller.signal;
}

function resolveRequestUrl(input: RequestInfo | URL) {
  if (typeof window === "undefined") return null;
  try {
    return new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
      window.location.origin
    );
  } catch {
    return null;
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function demoPublicUser(environment: WebDemoEnvironment) {
  if (environment.persona === "guest") return null;
  return {
    id: environment.persona === "admin" ? "demo-admin" : "demo-user",
    nickname: environment.persona === "admin" ? "Ivan" : "Demo User",
    email: environment.persona === "admin" ? "admin@example.com" : "user@example.com",
    avatarUrl: "",
    isAdmin: environment.persona === "admin",
  };
}

function demoReader(environment: WebDemoEnvironment, scene?: WebDemoScene) {
  if (environment.persona === "guest") return null;
  if (environment.persona === "admin" && environment.githubBinding !== "bound") return null;
  return {
    id: environment.persona === "admin" ? "demo-admin-reader" : "demo-user-reader",
    githubId: environment.persona === "admin" ? "demo-admin-github" : "demo-user-github",
    githubLogin: environment.persona === "admin" ? "ivan-demo" : "reader-demo",
    displayName: environment.persona === "admin" ? "Ivan" : "Demo User",
    avatarUrl:
      scene === "comments-avatar-failure"
        ? "/site-assets/__missing-comment-avatar__.svg"
        : "/site-assets/default-avatar.svg",
    profileUrl: "https://github.com/example",
  };
}

type DemoComment = {
  id: string;
  content: string;
  postSlug: string;
  targetType: "article" | "memo" | "project";
  targetKey: string;
  authorName: string;
  authorEmail: string | null;
  authorRole: "reader" | "admin";
  readerPersona: "user" | "other" | "admin";
  parentId: string | null;
  rootId: string | null;
  status: "pending" | "approved" | "rejected";
  deletedAt: number | null;
  revision: number;
  createdAt: number;
  submissionKey?: string;
};

type DemoReplyCursor = { createdAt: number; id: string };

const demoComments = new Map<string, DemoComment[]>();
let demoCommentSequence = 1;
let demoCommentsResetWindow: Window | null = null;

function ensureDemoCommentResetListener() {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  if (demoCommentsResetWindow === window) return;
  demoCommentsResetWindow = window;
  window.addEventListener(WEB_DEMO_ACTION_EVENT, (event) => {
    const action = (event as CustomEvent<{ action?: string }>).detail?.action;
    if (action === "reset-state") {
      demoComments.clear();
      demoCommentSequence = 1;
    }
  });
}

function demoCommentTarget(url: URL) {
  const rawType = url.searchParams.get("targetType") || "article";
  const targetType = (["article", "memo", "project"] as const).includes(
    rawType as DemoComment["targetType"]
  )
    ? (rawType as DemoComment["targetType"])
    : "article";
  const targetKey = url.searchParams.get("targetKey") || url.searchParams.get("slug") || "";
  return { targetType, targetKey };
}

function isDemoCommentTargetAvailable(targetType: DemoComment["targetType"], targetKey: string) {
  if (!targetKey || targetKey.startsWith("missing")) return false;
  return targetType !== "project" || projectCatalog.some((project) => project.slug === targetKey);
}

function seedDemoComments(targetType: DemoComment["targetType"], targetKey: string) {
  const key = `${targetType}:${targetKey}`;
  const existing = demoComments.get(key);
  if (existing) return existing;
  if (!isDemoCommentTargetAvailable(targetType, targetKey)) {
    demoComments.set(key, []);
    return [];
  }
  const rootId = `demo-comment-${demoCommentSequence++}`;
  const replyId = `demo-comment-${demoCommentSequence++}`;
  const pendingId = `demo-comment-${demoCommentSequence++}`;
  const now = Date.now();
  const seeded: DemoComment[] = [
    {
      id: rootId,
      content: "这篇内容的边界整理得很清楚。",
      postSlug: targetKey,
      targetType,
      targetKey,
      authorName: "其他读者",
      authorEmail: null,
      authorRole: "reader",
      readerPersona: "other",
      parentId: null,
      rootId,
      status: "approved",
      deletedAt: null,
      revision: 1,
      createdAt: now - 86_400_000,
    },
    {
      id: `demo-comment-${demoCommentSequence++}`,
      content: "管理员身份绑定后的评论会直接公开，并保留作者标记。",
      postSlug: targetKey,
      targetType,
      targetKey,
      authorName: "Ivan",
      authorEmail: null,
      readerPersona: "admin",
      authorRole: "admin",
      parentId: null,
      rootId: `demo-comment-${demoCommentSequence - 1}`,
      status: "approved",
      deletedAt: null,
      revision: 1,
      createdAt: now - 64_800_000,
    },
    {
      id: replyId,
      content: "同感，回复也会平铺在同一讨论组里。",
      postSlug: targetKey,
      targetType,
      targetKey,
      authorName: "Demo User",
      authorEmail: null,
      readerPersona: "user",
      authorRole: "reader",
      parentId: rootId,
      rootId,
      status: "approved",
      deletedAt: null,
      revision: 1,
      createdAt: now - 43_200_000,
    },
    {
      id: pendingId,
      content: "这条评论用于演示待审核状态。",
      postSlug: targetKey,
      targetType,
      targetKey,
      authorName: "Demo User",
      authorEmail: null,
      readerPersona: "user",
      authorRole: "reader",
      parentId: null,
      rootId: pendingId,
      status: "pending",
      deletedAt: null,
      revision: 1,
      createdAt: now - 3_600_000,
    },
  ];
  demoComments.set(key, seeded);
  return seeded;
}

function demoCommentDto(
  comment: DemoComment,
  environment: WebDemoEnvironment,
  placeholder = false,
  avatarFailure = false
) {
  const own = comment.readerPersona === environment.persona || environment.persona === "admin";
  const deleted = Boolean(comment.deletedAt);
  const visibleStatus = placeholder ? "approved" : comment.status;
  return {
    id: comment.id,
    content: (deleted && environment.persona !== "admin") || placeholder ? "" : comment.content,
    parentId: comment.parentId,
    rootId: comment.rootId,
    target: { type: comment.targetType, key: comment.targetKey },
    status: visibleStatus,
    deleted,
    revision: comment.revision,
    authorEmail: environment.persona === "admin" ? comment.authorEmail : null,
    authorRole: comment.authorRole,
    author: {
      id:
        (deleted || placeholder) && environment.persona !== "admin"
          ? comment.id
          : comment.readerPersona === "user"
            ? "demo-user"
            : comment.id,
      nickname:
        deleted && environment.persona !== "admin"
          ? "已删除"
          : placeholder
            ? "评论暂不可见"
            : comment.authorName,
      avatarUrl: avatarFailure
        ? "/site-assets/__missing-comment-avatar__.svg"
        : comment.readerPersona === "other"
          ? ""
          : "/site-assets/default-avatar.svg",
      profileUrl: null,
    },
    canDelete: own,
    canModerate: environment.persona === "admin",
    replies: [] as unknown[],
    repliesNextCursor: null as string | null,
    placeholder,
    createdAt: comment.createdAt,
  };
}

function encodeDemoReplyCursor(cursor: DemoReplyCursor) {
  return btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeDemoReplyCursor(value: string | null): DemoReplyCursor | null {
  if (!value) return null;
  try {
    const encoded = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as Partial<DemoReplyCursor>;
    return typeof parsed.createdAt === "number" && typeof parsed.id === "string"
      ? { createdAt: parsed.createdAt, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

function getDemoComments(
  url: URL,
  environment: WebDemoEnvironment,
  dataMode: "fixture" | "dense" | "empty",
  scene: WebDemoScene
) {
  const { targetType, targetKey } = demoCommentTarget(url);
  const hasExplicitTarget = url.searchParams.has("targetType") || url.searchParams.has("targetKey");
  if (
    hasExplicitTarget &&
    (scene === "comments-target-unavailable" ||
      !isDemoCommentTargetAvailable(targetType, targetKey))
  ) {
    return jsonResponse({ error: "评论目标不存在", code: "NOT_FOUND" }, 404);
  }
  if (dataMode === "empty") {
    return jsonResponse({
      comments: [],
      totalPages: 1,
      isAdmin: environment.persona === "admin",
    });
  }
  const rows = seedDemoComments(targetType, targetKey);
  const byIdAll = new Map(rows.map((comment) => [comment.id, comment]));
  const hasVisibleReply = new Set<string>();
  for (const comment of rows) {
    if (comment.parentId && !comment.deletedAt && comment.status === "approved") {
      let parent = byIdAll.get(comment.parentId);
      while (parent) {
        if (parent.status === "approved" || (parent.status === "pending" && !parent.deletedAt)) {
          hasVisibleReply.add(parent.id);
        }
        parent = parent.parentId ? byIdAll.get(parent.parentId) : undefined;
      }
    }
  }
  const visible = rows.filter((comment) => {
    if (environment.persona === "admin") return true;
    if (comment.deletedAt) return hasVisibleReply.has(comment.id);
    return (
      comment.status === "approved" ||
      (environment.persona === "user" && comment.readerPersona === "user") ||
      hasVisibleReply.has(comment.id)
    );
  });
  const byId = new Map(
    visible.map((comment) => [
      comment.id,
      demoCommentDto(
        comment,
        environment,
        environment.persona !== "admin" &&
          comment.status !== "approved" &&
          !comment.deletedAt &&
          !(environment.persona === "user" && comment.readerPersona === "user") &&
          hasVisibleReply.has(comment.id),
        scene === "comments-avatar-failure"
      ),
    ])
  );
  const roots = visible
    .filter((comment) => !comment.parentId)
    .flatMap((comment) => {
      const dto = byId.get(comment.id);
      return dto ? [dto] : [];
    });
  for (const comment of visible.filter((item) => item.parentId)) {
    const root = roots.find((item) => item.id === comment.rootId);
    const reply = byId.get(comment.id);
    if (root && reply && root.replies.length < 20) root.replies.push(reply);
    else if (root && reply && !root.repliesNextCursor) {
      const last = root.replies.at(-1) as { createdAt: number; id: string } | undefined;
      if (last) {
        root.repliesNextCursor = encodeDemoReplyCursor({
          createdAt: last.createdAt,
          id: last.id,
        });
      }
    }
  }
  return jsonResponse({ comments: roots, totalPages: 1, isAdmin: environment.persona === "admin" });
}

function getDemoCommentReplies(
  url: URL,
  environment: WebDemoEnvironment,
  commentId: string,
  avatarFailure = false
) {
  const rows = [...demoComments.values()].flat();
  const comment = rows.find((item) => item.id === commentId);
  if (!comment) return jsonResponse({ error: "评论不存在" }, 404);
  const rootId = comment.rootId || comment.id;
  const targetRows = rows.filter(
    (item) => item.targetType === comment.targetType && item.targetKey === comment.targetKey
  );
  const hasVisibleReply = new Set<string>();
  for (const item of targetRows) {
    if (item.parentId && !item.deletedAt && item.status === "approved") {
      let parent = targetRows.find((candidate) => candidate.id === item.parentId);
      while (parent) {
        if (parent.status === "approved" || (parent.status === "pending" && !parent.deletedAt)) {
          hasVisibleReply.add(parent.id);
        }
        parent = parent.parentId
          ? targetRows.find((candidate) => candidate.id === parent?.parentId)
          : undefined;
      }
    }
  }
  const visible = targetRows.filter(
    (item) =>
      environment.persona === "admin" ||
      (!item.deletedAt &&
        (item.status === "approved" ||
          (environment.persona === "user" && item.readerPersona === "user") ||
          hasVisibleReply.has(item.id))) ||
      (item.deletedAt && hasVisibleReply.has(item.id))
  );
  const visibleComment = visible.some((item) => item.id === commentId);
  if (!visibleComment) return jsonResponse({ error: "评论不可见" }, 404);
  const cursor = decodeDemoReplyCursor(url.searchParams.get("cursor"));
  if (url.searchParams.get("cursor") && !cursor)
    return jsonResponse({ error: "回复游标无效" }, 400);
  const replyRows = visible
    .filter((item) => item.rootId === rootId && item.parentId)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
    .filter(
      (item) =>
        !cursor ||
        item.createdAt > cursor.createdAt ||
        (item.createdAt === cursor.createdAt && item.id > cursor.id)
    );
  const page = replyRows.slice(0, 20);
  const nextCursor =
    replyRows.length > page.length
      ? encodeDemoReplyCursor({ createdAt: page.at(-1)?.createdAt ?? 0, id: page.at(-1)?.id ?? "" })
      : null;
  return jsonResponse({
    replies: page.map((item) =>
      demoCommentDto(
        item,
        environment,
        environment.persona !== "admin" &&
          item.status !== "approved" &&
          !item.deletedAt &&
          !(environment.persona === "user" && item.readerPersona === "user") &&
          hasVisibleReply.has(item.id),
        avatarFailure
      )
    ),
    nextCursor,
  });
}

const demoMemoOverrides = new Map<string, PublicMemoRecord>();
const consoleShareMemos = new Map<string, PublicMemoRecord>();
const consoleShareFailures = new Set<string>();
const consoleShareResponseLosses = new Set<string>();
let demoMemoSequence = 2401;

function demoMemoExcerpt(content: string) {
  return content
    .replaceAll("#", "")
    .replaceAll("*", "")
    .replaceAll("_", "")
    .replaceAll("`", "")
    .replaceAll(">", "")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replaceAll("(", "")
    .replaceAll(")", "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function getDemoMemo(slug: string) {
  return demoMemoOverrides.get(slug) ?? getMemoListWebDemoRecord(slug);
}

function applyDemoMemoOverrides(memos: PublicMemoRecord[]) {
  return memos.map((memo) => demoMemoOverrides.get(memo.slug) ?? memo);
}

function readDemoRequestBody(init?: RequestInit) {
  if (typeof init?.body !== "string") return {} as Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(init.body);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

async function readSystemShareRequestBody(init?: RequestInit) {
  if (!(init?.body instanceof FormData)) return {} as Record<string, unknown>;
  const form = init.body;
  const tags = (() => {
    try {
      const parsed = JSON.parse(String(form.get("tags") ?? "[]"));
      return Array.isArray(parsed)
        ? parsed.filter((tag): tag is string => typeof tag === "string")
        : [];
    } catch {
      return [];
    }
  })();
  return {
    submissionId: String(form.get("submissionId") ?? ""),
    title: String(form.get("title") ?? ""),
    text: String(form.get("text") ?? ""),
    url: String(form.get("url") ?? ""),
    tags,
    isPublic: String(form.get("isPublic") ?? "false") === "true",
    files: form.getAll("files").filter((file): file is File => file instanceof File),
  };
}

function demoMemoPage(url: URL) {
  const sceneState = getWebDemoSceneState(window.location, "public");
  const direction = url.searchParams.get("direction") === "newer" ? "newer" : "older";
  const cursor = url.searchParams.get("cursor");
  const page = cursor
    ? getMemoListWebDemoCursorPage(cursor, direction)
    : getMemoListWebDemoInitialPageForState(sceneState);
  const memos = applyDemoMemoOverrides(page.memos);

  return direction === "newer"
    ? {
        memos,
        hasMore: page.hasMore,
        hasPrevious: page.hasMore,
        previousCursor: page.previousCursor ?? null,
        nextCursor: null,
      }
    : {
        memos,
        hasMore: page.hasMore,
        hasPrevious: "hasPrevious" in page ? page.hasPrevious : false,
        previousCursor: "previousCursor" in page ? (page.previousCursor ?? null) : null,
        nextCursor: "nextCursor" in page ? (page.nextCursor ?? null) : null,
      };
}

function requireDemoAdmin(environment: WebDemoEnvironment) {
  if (environment.persona === "guest") return jsonResponse({ error: "UNAUTHORIZED" }, 401);
  if (environment.persona !== "admin") return jsonResponse({ error: "FORBIDDEN" }, 403);
  return null;
}

function createDemoMemo(body: Record<string, unknown>) {
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const isPublic = body.isPublic !== false;
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const suffix = String(demoMemoSequence++).padStart(4, "0");
  const now = new Date().toISOString();
  const memo: PublicMemoRecord = {
    id: `memo-web-demo-${suffix}`,
    slug: `memo-web-demo-${suffix}`,
    title: title || null,
    excerpt: demoMemoExcerpt(content),
    content,
    tags,
    inlineTags: tags,
    isPublic,
    createdAt: now,
    publishedAt: isPublic ? now : null,
    updatedAt: now,
    dataSource: "web-demo",
    filePath: `demo/memos/${suffix}.md`,
    image: null,
    media: { primary: null, cover: null, content: [], attachments: [] },
  };
  demoMemoOverrides.set(memo.slug, memo);
  return memo;
}

function demoRuntimeMetrics(slug: string, dataMode: "fixture" | "dense" | "empty") {
  const metrics = projectRuntimeMetricsBySlug[slug as keyof typeof projectRuntimeMetricsBySlug];
  if (!metrics) return null;
  if (metrics.kind === "codex-vibe-monitor") {
    const tokenActivity90d = metrics.tokenActivity90d.map((point, index) => ({
      ...point,
      value: dataMode === "empty" ? (index === 0 ? 0 : null) : point.value,
    }));
    return {
      ...metrics,
      tokenActivity90d: { status: "partial", points: tokenActivity90d },
    };
  }
  if (metrics.kind === "tavily-hikari") {
    const { kind: _kind, ...payload } = metrics;
    return {
      ...payload,
      requestActivity90d: payload.requestActivity90d.map((point) => ({
        ...point,
        value: dataMode === "empty" ? 0 : point.value,
      })),
    };
  }
  const { kind: _kind, freshness, ...payload } = metrics;
  const count =
    dataMode === "empty"
      ? 0
      : dataMode === "dense"
        ? Math.max(freshness.length * 3, 720)
        : freshness.length;
  const nextFreshness = Array.from({ length: count }, (_, index) => (count === 0 ? 4 : index % 5));
  const nextRepositories = {
    ...payload.deduplicatedRepositories,
    value: count,
    trend: {
      ...payload.deduplicatedRepositories.trend,
      points: payload.deduplicatedRepositories.trend.points.map((point, index, points) =>
        index === points.length - 1 ? { ...point, value: count } : point
      ),
    },
  };
  return { ...payload, deduplicatedRepositories: nextRepositories, freshness: nextFreshness };
}

function getDemoAssistantResponse(
  url: URL,
  method: string,
  environment: WebDemoEnvironment,
  scene: WebDemoScene,
  init?: RequestInit
) {
  ensureDemoAssistantResetListener();
  const principal = demoFrontendPrincipal(environment);
  if (!principal) return jsonResponse({ error: "需要登录", code: "UNAUTHORIZED" }, 401);
  const quota = demoAssistantQuota(environment, scene);
  const conversationId = url.searchParams.get("conversation");

  if (url.pathname === "/api/public/chat/quota" && method === "GET") return jsonResponse(quota);

  if (url.pathname === "/api/public/chat" && method === "GET") {
    if (conversationId) {
      if (demoAssistantDeleted.has(conversationId))
        return jsonResponse({ error: "对话不存在", code: "NOT_FOUND" }, 404);
      const record = demoAssistantRecords.get(conversationId);
      if (!record || record.conversation.frontendUserId !== principal.id)
        return jsonResponse({ error: "对话不存在", code: "NOT_FOUND" }, 404);
      if (scene === "assistant-reconnecting")
        return jsonResponse({ error: "正在重新连接", code: "RECONNECTING" }, 503);
      if (!record || record.conversation.status === "expired")
        return jsonResponse({ error: "对话已过期", code: "GONE" }, 410);
      return jsonResponse(demoAssistantSnapshot(record));
    }
    const seedKey = `${principal.id}:${scene}`;
    const seedId = `demo-assistant-${principal.id}-${scene}`;
    if (!demoAssistantSeeded.has(seedKey) && !demoAssistantDeleted.has(seedId)) {
      demoAssistantRecord(environment, scene);
      demoAssistantSeeded.add(seedKey);
      persistDemoAssistantState();
    }
    const conversations = Array.from(demoAssistantRecords.values())
      .filter(
        (record) =>
          record.conversation.frontendUserId === principal.id &&
          (!record.isSeed || record.scene === scene) &&
          record.conversation.status !== "deleted"
      )
      .map((record) => record.conversation);
    return jsonResponse({ conversations, quota: demoAssistantQuota(environment, scene) });
  }

  if (url.pathname === "/api/public/chat" && method === "POST") {
    const body = readDemoRequestBody(init);
    const requestId =
      typeof body.requestId === "string"
        ? body.requestId
        : new Headers(init?.headers).get("idempotency-key");
    const replayKey = requestId ? `${principal.id}:${requestId}` : null;
    const replay = replayKey ? demoAssistantSubmissions.get(replayKey) : null;
    if (replay) return jsonResponse(replay, 202);
    if (scene === "assistant-quota-exhausted" && !principal.isAdmin) {
      return jsonResponse({ error: "Assistant quota exceeded", code: "QUOTA_EXCEEDED" }, 429);
    }
    const requestedId = typeof body.conversationId === "string" ? body.conversationId : undefined;
    const activeConversationCount = Array.from(demoAssistantRecords.values()).filter(
      (record) =>
        record.conversation.frontendUserId === principal.id &&
        (!record.isSeed || record.scene === scene) &&
        record.conversation.status === "active"
    ).length;
    if (
      !principal.isAdmin &&
      !requestedId &&
      activeConversationCount >= quota.policy.maxConversations
    ) {
      return jsonResponse({ error: "Conversation limit reached", code: "QUOTA" }, 429);
    }
    const record = requestedId
      ? (demoAssistantRecords.get(requestedId) ?? null)
      : demoAssistantRecord(
          environment,
          scene,
          `demo-assistant-${principal.id}-${demoAssistantSequence++}`,
          {
            withHistory: false,
            kind: body.kind === "clipping" ? "clipping" : "general",
            clippingMemoId: typeof body.clippingMemoId === "string" ? body.clippingMemoId : null,
          }
        );
    if (requestedId && (!record || record.conversation.frontendUserId !== principal.id))
      return jsonResponse({ error: "对话不存在", code: "NOT_FOUND" }, 404);
    if (!record || record.conversation.status === "expired")
      return jsonResponse({ error: "对话已过期", code: "GONE" }, 410);
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return jsonResponse({ error: "问题不能为空", code: "BAD_REQUEST" }, 400);
    const now = Date.now();
    const sequence = record.messages.length + 1;
    const userMessage: AssistantMessage = {
      id: `${record.conversation.id}-user-${sequence}`,
      conversationId: record.conversation.id,
      sequence,
      role: "user",
      content,
      status: "completed",
      clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : null,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      citations: [],
    };
    const assistantStatus =
      scene === "assistant-failure"
        ? "failed"
        : scene === "assistant-generating"
          ? "streaming"
          : "completed";
    const assistantMessage: AssistantMessage = {
      id: `${record.conversation.id}-assistant-${sequence + 1}`,
      conversationId: record.conversation.id,
      sequence: sequence + 1,
      role: "assistant",
      content:
        assistantStatus === "failed"
          ? "这次生成没有完成，请点击重试。"
          : assistantStatus === "streaming"
            ? "正在整理公开资料……"
            : "根据公开知识库，这个问题可以从文章、项目和工程方法三个方向理解。",
      status: assistantStatus,
      clientRequestId: null,
      createdAt: now + 1,
      updatedAt: now + 1,
      completedAt: assistantStatus === "streaming" ? null : now + 1,
      citations: demoAssistantCitations(
        now + 1,
        `${record.conversation.id}-assistant-${sequence + 1}`
      ),
    };
    record.messages.push(userMessage, assistantMessage);
    record.conversation.lastUserMessageAt = now;
    record.generationJob = {
      id: `${record.conversation.id}-job-${sequence}`,
      conversationId: record.conversation.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      requestId: typeof body.requestId === "string" ? body.requestId : `demo-request-${sequence}`,
      status:
        assistantStatus === "failed"
          ? "failed"
          : assistantStatus === "streaming"
            ? "running"
            : "completed",
      attempt: 1,
      leaseUntil: null,
      cancelRequested: false,
      startedAt: now,
      finishedAt: assistantStatus === "streaming" ? null : now + 1,
      errorCode: assistantStatus === "failed" ? "provider-error" : null,
      createdAt: now,
      updatedAt: now,
    };
    const submission: DemoAssistantSubmission = {
      status: "queued",
      conversationId: record.conversation.id,
      turnId: record.generationJob.id,
      requestId: record.generationJob.requestId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      createdConversation: !requestedId,
    };
    if (replayKey) demoAssistantSubmissions.set(replayKey, submission);
    persistDemoAssistantState();
    recordWebDemoMutation("发送助手问题", content.slice(0, 48));
    return jsonResponse(submission, 202);
  }

  if (url.pathname === "/api/public/chat/stop" && method === "POST") {
    const body = readDemoRequestBody(init);
    const id = typeof body.conversationId === "string" ? body.conversationId : null;
    const record = id ? demoAssistantRecords.get(id) : null;
    if (record && record.conversation.frontendUserId !== principal.id)
      return jsonResponse({ error: "对话不存在", code: "NOT_FOUND" }, 404);
    if (
      record?.generationJob &&
      (record.generationJob.status === "running" || record.generationJob.status === "queued")
    ) {
      record.generationJob.status = "cancelled";
      record.generationJob.cancelRequested = true;
      record.generationJob.errorCode = "cancelled-by-user";
      record.generationJob.finishedAt = Date.now();
      const assistant = record.messages.find(
        (message) => message.id === record.generationJob?.assistantMessageId
      );
      if (assistant) assistant.status = "cancelled";
      persistDemoAssistantState();
      recordWebDemoMutation("停止助手生成", record.conversation.title || record.conversation.id);
      return jsonResponse({ stopped: true, generationJob: record.generationJob });
    }
    return jsonResponse({ stopped: false, generationJob: record?.generationJob ?? null });
  }

  const deleteMatch = url.pathname.match(/^\/api\/public\/chat\/conversations\/([^/]+)$/u);
  if (deleteMatch && method === "DELETE") {
    const id = decodeURIComponent(deleteMatch[1] ?? "");
    const record = demoAssistantRecords.get(id);
    if (!record || record.conversation.frontendUserId !== principal.id)
      return jsonResponse({ error: "对话不存在", code: "NOT_FOUND" }, 404);
    demoAssistantRecords.delete(id);
    demoAssistantDeleted.add(id);
    persistDemoAssistantState();
    recordWebDemoMutation("删除助手对话", id);
    return jsonResponse({ deleted: true, conversationId: id });
  }

  return jsonResponse({ error: "该公共接口未接入 Web Demo 模拟。" }, 404);
}

function demoSearchRelevance(
  item: { title: string; excerpt: string; body?: string },
  query: string,
  origin: "keyword" | "ai",
  aiRank: number
) {
  if (origin === "ai") return 72 - aiRank * 7;
  const normalizedQuery = query.trim().toLowerCase();
  const title = item.title.toLowerCase();
  const excerpt = item.excerpt.toLowerCase();
  const body = item.body?.toLowerCase() ?? "";
  const titleMatches = title.split(normalizedQuery).length - 1;
  const excerptMatches = excerpt.split(normalizedQuery).length - 1;
  const bodyMatches = body.split(normalizedQuery).length - 1;
  return 12 + titleMatches * 100 + excerptMatches * 35 + bodyMatches * 8;
}

function isConsoleWebDemoBuild() {
  return (
    (typeof document !== "undefined" &&
      document.documentElement.dataset.consoleWebDemoBuild === "true") ||
    process.env.CONSOLE_WEB_DEMO_BUILD === "true"
  );
}

async function getConsoleWebDemoResponse(
  url: URL,
  method: string,
  body: Record<string, unknown>,
  init?: RequestInit
) {
  const persona = getConsoleWebDemoPersona(window.location);
  if (url.pathname === "/api/public/auth/me" && method === "GET") {
    return jsonResponse(
      demoPublicUser({
        ...getWebDemoEnvironment(window.location, "admin"),
        persona,
      })
    );
  }

  if (url.pathname === "/api/public/system-share" && method === "POST") {
    const authError = requireDemoAdmin({
      ...getWebDemoEnvironment(window.location, "admin"),
      persona,
    });
    if (authError) return authError;
    const share = await readSystemShareRequestBody(init);
    const submissionId = String(share.submissionId ?? "");
    const normalized = normalizeSystemShareEditor({
      title: String(share.title ?? ""),
      text: String(share.text ?? ""),
      url: String(share.url ?? ""),
      tags: Array.isArray(share.tags)
        ? share.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      isPublic: share.isPublic === true,
      files: share.files.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
      })),
    });
    const existing = consoleShareMemos.get(submissionId);
    if (existing) {
      return jsonResponse(
        {
          ok: true,
          duplicate: true,
          memoId: existing.id,
          memo: {
            id: existing.id,
            slug: existing.slug,
            title: existing.title,
            isPublic: existing.isPublic,
          },
          classification: normalized.classification,
        },
        200
      );
    }
    const scene = getWebDemoSceneState(window.location, "admin").scene;
    if (scene === "system-share-error" && !consoleShareFailures.has(submissionId)) {
      consoleShareFailures.add(submissionId);
      return jsonResponse({ error: "演示中的发布失败，请使用 Toast 内的重试。" }, 503);
    }
    const content = [
      normalized.title ? `# ${normalized.title}` : "# 系统分享闪念",
      composeSystemShareMemoContent(normalized),
    ]
      .filter(Boolean)
      .join("\n\n");
    const created = consoleWebDemoStore.create({
      content,
      isPublic: normalized.isPublic,
      tags: normalized.tags,
    });
    consoleShareMemos.set(submissionId, created);
    recordWebDemoMutation(
      "发布系统分享",
      `${created.title || created.slug} · ${normalized.classification === "clipping" ? "剪藏" : "闪念"}`
    );
    if (scene === "system-share-response-loss" && !consoleShareResponseLosses.has(submissionId)) {
      consoleShareResponseLosses.add(submissionId);
      throw new TypeError("演示中的发布响应丢失，请使用 Toast 内的重试。");
    }
    return jsonResponse(
      {
        ok: true,
        duplicate: false,
        memoId: created.id,
        memo: {
          id: created.id,
          slug: created.slug,
          title: created.title,
          isPublic: created.isPublic,
        },
        classification: normalized.classification,
      },
      201
    );
  }
  if (url.pathname === "/api/public/memos" && method === "GET") {
    const page = consoleWebDemoStore.list(persona);
    return jsonResponse(page);
  }

  if (url.pathname === "/api/public/memos" && method === "POST") {
    if (persona !== "admin") return jsonResponse({ error: "需要管理员权限" }, 403);
    const created = consoleWebDemoStore.create({
      content: String(body.content ?? ""),
      isPublic: Boolean(body.isPublic),
      tags: Array.isArray(body.tags)
        ? body.tags.filter((tag): tag is string => typeof tag === "string")
        : undefined,
    });
    recordWebDemoMutation("创建 Memo", "仅在当前 Console Web Demo 内存中创建内容。");
    return jsonResponse(created);
  }

  const detailMatch = url.pathname.match(/^\/api\/public\/memos\/([^/]+)(\/clipping)?$/u);
  if (!detailMatch) return null;
  const slug = decodeURIComponent(detailMatch[1] ?? "");
  if (detailMatch[2] && method === "GET") {
    const memo = consoleWebDemoStore.get(slug, persona);
    const article = memo?.clipping ? getConsoleWebDemoClippingArticle(slug, persona) : null;
    return article ? jsonResponse(article) : jsonResponse({ error: "Memo 不存在" }, 404);
  }

  if (method === "GET") {
    const memo = consoleWebDemoStore.get(slug, persona);
    return memo ? jsonResponse(memo) : jsonResponse({ error: "Memo 不存在" }, 404);
  }
  if (persona !== "admin") return jsonResponse({ error: "需要管理员权限" }, 403);

  if (method === "PATCH") {
    const updated = consoleWebDemoStore.update(slug, {
      content: String(body.content ?? ""),
      isPublic: Boolean(body.isPublic),
      tags: Array.isArray(body.tags)
        ? body.tags.filter((tag): tag is string => typeof tag === "string")
        : undefined,
    });
    if (!updated) return jsonResponse({ error: "Memo 不存在" }, 404);
    recordWebDemoMutation("保存 Memo 详情", `仅更新 ${slug} 的浏览器内存内容。`);
    return jsonResponse(updated);
  }
  if (method === "DELETE") {
    if (!consoleWebDemoStore.remove(slug)) return jsonResponse({ error: "Memo 不存在" }, 404);
    recordWebDemoMutation("删除 Memo", `仅从当前演示内存移除 ${slug}。`);
    return jsonResponse({ success: true });
  }
  return jsonResponse({ error: "不支持的 Memo 操作" }, 405);
}

async function getDemoPublicResponse(
  url: URL,
  method: string,
  environment: WebDemoEnvironment,
  dataMode: "fixture" | "dense" | "empty",
  scene: WebDemoScene,
  init?: RequestInit
) {
  ensureDemoCommentResetListener();
  const body = readDemoRequestBody(init);
  // The Demo build's server supplies route-scoped fixture data after the
  // common connection/delay/abort policy has admitted this actual read.
  if (url.pathname === "/api/public/page" && method === "GET") return null;
  if (isConsoleWebDemoBuild()) {
    const consoleResponse = await getConsoleWebDemoResponse(url, method, body, init);
    if (consoleResponse) return consoleResponse;
  }
  const clippingChatMatch = url.pathname.match(
    /^\/api\/public\/memos\/([^/]+)\/clipping\/chat(\/stop)?$/u
  );
  if (clippingChatMatch) {
    const clippingSlug = decodeURIComponent(clippingChatMatch[1] ?? "");
    if (clippingSlug !== WEB_DEMO_CLIPPING_SLUG)
      return jsonResponse({ error: "剪藏不存在", code: "NOT_FOUND" }, 404);
    const principal = demoFrontendPrincipal(environment);
    if (!principal) return jsonResponse({ error: "需要登录", code: "UNAUTHORIZED" }, 401);
    const existing = Array.from(demoAssistantRecords.values()).find(
      (record) =>
        record.conversation.frontendUserId === principal.id &&
        record.conversation.kind === "clipping" &&
        record.conversation.clippingMemoId === clippingSlug
    );
    const proxyUrl = new URL("/api/public/chat", url);
    if (clippingChatMatch[2]) proxyUrl.pathname = "/api/public/chat/stop";
    const proxyBody = clippingChatMatch[2]
      ? { ...body, conversationId: body.conversationId ?? existing?.conversation.id }
      : {
          ...body,
          content: typeof body.text === "string" ? body.text : body.content,
          kind: "clipping",
          clippingMemoId: clippingSlug,
          ...(existing ? { conversationId: existing.conversation.id } : {}),
        };
    return getDemoAssistantResponse(proxyUrl, method, environment, scene, {
      ...init,
      body: JSON.stringify(proxyBody),
    });
  }
  if (url.pathname === "/api/public/auth/me" && method === "GET") {
    return jsonResponse(demoPublicUser(environment));
  }

  if (url.pathname === "/api/public/frontend-auth/me" && method === "GET") {
    return jsonResponse(demoFrontendAuth(environment));
  }

  if (url.pathname === "/api/public/frontend-auth/bootstrap" && method === "POST") {
    return jsonResponse({
      ...demoFrontendAuth(environment),
      bootstrapped: environment.persona !== "guest",
    });
  }

  if (url.pathname === "/api/public/frontend-auth/admin-start" && method === "POST") {
    if (environment.persona !== "admin")
      return jsonResponse({ error: "请先登录管理员账号", code: "UNAUTHORIZED" }, 401);
    return jsonResponse(demoFrontendAuth(environment));
  }

  if (url.pathname === "/api/public/frontend-auth/logout" && method === "POST") {
    return jsonResponse({
      authenticated: false,
      principal: null,
      expiresAt: null,
      loggedOut: true,
    });
  }

  if (url.pathname.startsWith("/api/public/chat")) {
    return getDemoAssistantResponse(url, method, environment, scene, init);
  }

  if (url.pathname === "/api/public/reader-auth/me" && method === "GET") {
    const reader = demoReader(environment, scene);
    return jsonResponse({
      available: true,
      reader,
      isAdminAuthor: environment.persona === "admin" && environment.githubBinding === "bound",
    });
  }

  if (url.pathname === "/api/public/reader-auth/logout" && method === "POST") {
    return jsonResponse({ ok: true });
  }

  if (url.pathname === "/api/public/memos" && method === "GET") {
    const authError = requireDemoAdmin(environment);
    if (authError) return authError;
    return jsonResponse(demoMemoPage(url));
  }

  if (url.pathname === "/api/public/memos" && method === "POST") {
    const authError = requireDemoAdmin(environment);
    if (authError) return authError;
    const memo = createDemoMemo(readDemoRequestBody(init));
    recordWebDemoMutation("创建 Memo", memo.title || memo.slug);
    return jsonResponse(memo);
  }

  const memoMatch = url.pathname.match(/^\/api\/public\/memos\/([^/]+)$/);
  if (memoMatch) {
    const slug = decodeURIComponent(memoMatch[1] ?? "");
    const authError = requireDemoAdmin(environment);
    if (authError) return authError;
    const memo = getDemoMemo(slug);
    if (!memo) return jsonResponse({ error: "Memo 不存在" }, 404);
    if (method === "GET") return jsonResponse(memo);
    if (method === "PATCH") {
      const body = readDemoRequestBody(init);
      const content = typeof body.content === "string" ? body.content.trim() : memo.content;
      const title = typeof body.title === "string" ? body.title.trim() : memo.title;
      const isPublic = typeof body.isPublic === "boolean" ? body.isPublic : memo.isPublic;
      const tags = Array.isArray(body.tags)
        ? body.tags.filter((tag): tag is string => typeof tag === "string")
        : memo.tags;
      const updated: PublicMemoRecord = {
        ...memo,
        title: title || null,
        content,
        excerpt: demoMemoExcerpt(content),
        tags,
        inlineTags: tags,
        isPublic,
        publishedAt: isPublic ? (memo.publishedAt ?? new Date().toISOString()) : null,
        updatedAt: new Date().toISOString(),
      };
      demoMemoOverrides.set(slug, updated);
      recordWebDemoMutation(
        "保存 Memo",
        `${updated.title || updated.slug} · ${updated.isPublic ? "公开" : "私有"}`
      );
      return jsonResponse(updated);
    }
    if (method === "DELETE") {
      demoMemoOverrides.delete(slug);
      recordWebDemoMutation("删除 Memo", memo.title || memo.slug);
      return jsonResponse({ success: true });
    }
  }

  if (url.pathname === "/api/public/auth/logout" && method === "POST") {
    return jsonResponse({ ok: true });
  }

  if (url.pathname === "/api/public/comments" && method === "GET") {
    return getDemoComments(url, environment, dataMode, scene);
  }

  if (url.pathname === "/api/public/comments" && method === "POST") {
    if (environment.persona === "guest")
      return jsonResponse({ error: "请先使用 GitHub 登录" }, 401);
    if (environment.persona === "admin" && environment.githubBinding !== "bound")
      return jsonResponse({ error: "请先绑定 GitHub 管理员身份" }, 401);
    const { targetType, targetKey } = demoCommentTarget(url);
    const requestBody = readDemoRequestBody(init);
    const content = typeof requestBody.content === "string" ? requestBody.content.trim() : "";
    if (!content) return jsonResponse({ error: "评论内容不能为空" }, 400);
    const target = requestBody.target as { type?: string; key?: string } | undefined;
    const rawType = target?.type || targetType;
    const actualType = (["article", "memo", "project"] as const).includes(
      rawType as DemoComment["targetType"]
    )
      ? (rawType as DemoComment["targetType"])
      : targetType;
    const actualKey = target?.key || String(requestBody.postSlug || targetKey);
    if (
      scene === "comments-target-unavailable" ||
      !isDemoCommentTargetAvailable(actualType, actualKey)
    )
      return jsonResponse({ error: "评论目标不存在", code: "NOT_FOUND" }, 404);
    const parentId = typeof requestBody.parentId === "string" ? requestBody.parentId : null;
    const rows = seedDemoComments(actualType, actualKey);
    if (parentId) {
      const parent = rows.find((item) => item.id === parentId);
      if (parent?.status !== "approved" || parent.deletedAt)
        return jsonResponse({ error: "只能回复当前目标下已通过且未删除的评论" }, 400);
    }
    const submissionKey = String(requestBody.submissionKey || `demo-${crypto.randomUUID()}`);
    const authorRole = environment.persona === "admin" ? "admin" : "reader";
    const existing = rows.find(
      (row) => row.authorRole === authorRole && row.submissionKey === submissionKey
    );
    if (existing)
      return jsonResponse({
        success: true,
        commentId: existing.id,
        message: existing.authorRole === "admin" ? "管理员评论已公开" : "评论已提交，正在等待审核",
      });
    const id = `demo-comment-${demoCommentSequence++}`;
    const row: DemoComment = {
      id,
      content,
      postSlug: actualKey,
      targetType: actualType,
      targetKey: actualKey,
      authorName: environment.persona === "admin" ? "Ivan" : "Demo User",
      authorEmail: null,
      authorRole,
      readerPersona: environment.persona === "admin" ? "admin" : "user",
      parentId,
      rootId: parentId ? rows.find((item) => item.id === parentId)?.rootId || parentId : id,
      status: authorRole === "admin" ? "approved" : "pending",
      deletedAt: null,
      revision: 1,
      createdAt: Date.now(),
      submissionKey,
    };
    rows.push(row);
    recordWebDemoMutation(
      "提交评论",
      `${actualType}:${actualKey} · ${authorRole === "admin" ? "已公开" : "待审核"}`
    );
    return jsonResponse({
      success: true,
      commentId: id,
      authorRole,
      status: row.status,
      message: authorRole === "admin" ? "管理员评论已公开" : "评论已提交，正在等待审核",
    });
  }

  const commentRepliesMatch = url.pathname.match(/^\/api\/public\/comments\/([^/]+)\/replies$/);
  if (commentRepliesMatch && method === "GET") {
    return getDemoCommentReplies(
      url,
      environment,
      decodeURIComponent(commentRepliesMatch[1] || ""),
      scene === "comments-avatar-failure"
    );
  }

  if (url.pathname.startsWith("/api/public/comments/") && ["PATCH", "DELETE"].includes(method)) {
    if (environment.persona === "guest") return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    const segments = url.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 1] || "";
    const rows = [...demoComments.values()].flat();
    const row = rows.find((item) => item.id === id);
    if (!row) return jsonResponse({ error: "评论不存在" }, 404);
    if (method === "PATCH" && environment.persona !== "admin")
      return jsonResponse({ error: "读者不能编辑评论" }, 403);
    if (method === "DELETE" && environment.persona !== "admin" && row.readerPersona !== "user") {
      return jsonResponse({ error: "没有权限删除此评论" }, 403);
    }
    if (method === "DELETE") {
      row.deletedAt = Date.now();
      row.revision += 1;
      recordWebDemoMutation("软删除评论", id);
      return jsonResponse({ success: true, message: "评论已删除" });
    }
    return jsonResponse({ error: "读者不能编辑评论" }, 403);
  }

  if (/^\/api\/public\/comments\/[^/]+\/moderate$/.test(url.pathname) && method === "POST") {
    if (environment.persona === "guest") return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    if (environment.persona !== "admin") return jsonResponse({ error: "FORBIDDEN" }, 403);
    const id = decodeURIComponent(url.pathname.split("/").at(-2) || "");
    const row = [...demoComments.values()].flat().find((item) => item.id === id);
    if (!row) return jsonResponse({ success: true });
    const requestBody = readDemoRequestBody(init);
    if (requestBody.status === "approved" && row.deletedAt)
      return jsonResponse({ error: "已删除评论不能直接通过" }, 409);
    row.status =
      requestBody.status === "rejected"
        ? "rejected"
        : requestBody.status === "pending"
          ? "pending"
          : "approved";
    row.revision += 1;
    recordWebDemoMutation("审核评论", `${id} · ${row.status}`);
    return jsonResponse({ success: true });
  }

  if (/^\/api\/public\/comments\/[^/]+\/restore$/.test(url.pathname) && method === "POST") {
    if (environment.persona !== "admin") return jsonResponse({ error: "FORBIDDEN" }, 403);
    const id = decodeURIComponent(url.pathname.split("/").at(-2) || "");
    const row = [...demoComments.values()].flat().find((item) => item.id === id);
    if (!row) return jsonResponse({ error: "评论不存在" }, 404);
    row.deletedAt = null;
    row.status = row.authorRole === "admin" ? "approved" : "pending";
    row.revision += 1;
    recordWebDemoMutation(
      "恢复评论",
      `${id} · ${row.authorRole === "admin" ? "已公开" : "待审核"}`
    );
    return jsonResponse({
      success: true,
      status: row.status,
      message: row.authorRole === "admin" ? "管理员评论已恢复并公开" : "评论已恢复并进入待审",
    });
  }

  const runtimeMatch = url.pathname.match(/^\/api\/public\/metrics\/v1\/([^/]+)$/);
  if (runtimeMatch && method === "GET") {
    const payload = demoRuntimeMetrics(runtimeMatch[1] ?? "", dataMode);
    return payload ? jsonResponse(payload) : jsonResponse({ error: "指标不存在" }, 404);
  }

  if (
    (url.pathname === "/api/public/search" || url.pathname === "/api/public/search/stream") &&
    method === "GET"
  ) {
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const selected = searchModeSchema.safeParse(url.searchParams.get("mode") ?? "keyword");
    if (!selected.success) return jsonResponse({ error: "不支持的搜索模式" }, 400);
    if (url.pathname === "/api/public/search/stream" && selected.data === "keyword")
      return jsonResponse({ error: "流式搜索仅支持 AI 模式", code: "BAD_REQUEST" }, 400);
    let plan: ReturnType<typeof planNativeQuery>;
    try {
      plan = planNativeQuery(query);
    } catch {
      return jsonResponse({ error: "不支持的搜索语法" }, 400);
    }
    const state = getWebDemoState(window.location, "public");
    if (state.scene === "search-index-unavailable")
      return jsonResponse({ error: "搜索索引暂不可用，请稍后重试" }, 503);
    const effectiveMode =
      !query || plan.mode !== "simple" || state.scene === "search-ai-unavailable"
        ? "keyword"
        : selected.data;
    const requestedSource = url.searchParams.get("source") ?? "all";
    const requestedType = url.searchParams.get("type") ?? "all";
    const results = [
      {
        slug: "code-block-fixture",
        title: "Code Block Fixture",
        excerpt: "Canonical markdown code rendering fixture.",
        type: "post",
      },
      {
        slug: "hello-world",
        title: "Hello World",
        excerpt: "The primary local fixture post.",
        type: "post",
      },
      {
        slug: "local-memo",
        title: "Local Memo",
        excerpt: "A memo fixture stored in the local content tree.",
        type: "memo",
      },
      ...SEARCH_DEMO_DOCUMENTS,
      ...(dataMode === "dense" ? SEARCH_DEMO_DENSE_DOCUMENTS : []),
      ...PLAYBOOK_SEARCH_DEMO_DOCUMENTS,
    ].filter((item) => {
      const isPlaybook = "href" in item;
      if (requestedSource === "blog" && isPlaybook) return false;
      if (requestedSource === "playbook" && !isPlaybook) return false;
      return requestedType === "all" || item.type === requestedType;
    });
    const terms = positiveSearchTerms(plan.ast);
    const literalMatched = results.filter((item) =>
      plan.literalTerms.every(
        (term) =>
          searchHighlightSpans(`${item.title} ${item.excerpt} ${"body" in item ? item.body : ""}`, [
            { value: term },
          ]).length > 0
      )
    );
    const matched = [...literalMatched];
    const literalSlugs = new Set(literalMatched.map((item) => item.slug));
    const aiSlugs = new Set<string>();
    const semanticSqliteSlugs = [
      SEARCH_DEMO_DOCUMENTS[0].slug,
      ...(dataMode === "dense"
        ? SEARCH_DEMO_DENSE_DOCUMENTS.slice(2).map((document) => document.slug)
        : []),
    ];
    const aiRankBySlug = new Map(semanticSqliteSlugs.map((slug, index) => [slug, index]));
    if ((effectiveMode === "rag" || effectiveMode === "rewrite") && query === "sqlite") {
      for (const slug of semanticSqliteSlugs) {
        const document = results.find((item) => item.slug === slug);
        if (!document || literalSlugs.has(slug)) continue;
        matched.unshift(document);
        aiSlugs.add(slug);
      }
    }
    if (
      effectiveMode === "rag" &&
      /^(?:nodejs|node\.js)$/iu.test(query) &&
      !literalSlugs.has(SEARCH_DEMO_DOCUMENTS[2].slug)
    ) {
      matched.unshift(SEARCH_DEMO_DOCUMENTS[2]);
      aiSlugs.add(SEARCH_DEMO_DOCUMENTS[2].slug);
    }
    if (effectiveMode === "rewrite" && /嵌入式.*数据库/u.test(query)) {
      const document = results.find((item) => item.slug === SEARCH_DEMO_DOCUMENTS[0].slug);
      if (document && !literalSlugs.has(document.slug)) {
        matched.unshift(document);
        aiSlugs.add(document.slug);
      }
    }
    if (effectiveMode === "rag" && /版本|发布|权限|恢复/u.test(query)) {
      for (const document of PLAYBOOK_SEARCH_DEMO_DOCUMENTS) {
        if (
          requestedSource === "blog" ||
          (requestedType !== "all" && document.type !== requestedType)
        )
          continue;
        if (literalSlugs.has(document.slug)) continue;
        matched.unshift(document);
        aiSlugs.add(document.slug);
      }
    }
    const rankedMatched = [...new Map(matched.map((item) => [item.slug, item])).values()].sort(
      (a, b) => {
        const aOrigin = aiSlugs.has(a.slug) ? "ai" : "keyword";
        const bOrigin = aiSlugs.has(b.slug) ? "ai" : "keyword";
        const scoreDiff =
          demoSearchRelevance(b, query, bOrigin, aiRankBySlug.get(b.slug) ?? 0) -
          demoSearchRelevance(a, query, aOrigin, aiRankBySlug.get(a.slug) ?? 0);
        return scoreDiff || a.slug.localeCompare(b.slug);
      }
    );
    const response = jsonResponse(
      query && state.data !== "empty"
        ? rankedMatched.map((item) => {
            const { slug, title, excerpt, type } = item;
            const body = "body" in item ? item.body : "";
            const searchOrigin = aiSlugs.has(slug) ? "ai" : "keyword";
            return {
              slug,
              title,
              excerpt,
              type,
              ...("href" in item
                ? { source: "playbook", href: item.href, sections: item.sections }
                : {}),
              highlightTerms: terms,
              searchOrigin,
              final: demoSearchRelevance(
                { title, excerpt, body },
                query,
                searchOrigin,
                aiRankBySlug.get(slug) ?? 0
              ),
            };
          })
        : []
    );
    const keywordEnvelope = {
      results:
        query && state.data !== "empty"
          ? literalMatched.map((item) => {
              const { slug, title, excerpt, type } = item;
              const body = "body" in item ? item.body : "";
              return {
                slug,
                title,
                excerpt,
                type,
                ...("href" in item
                  ? { source: "playbook", href: item.href, sections: item.sections }
                  : {}),
                highlightTerms: terms,
                searchOrigin: "keyword" as const,
                final: demoSearchRelevance({ title, excerpt, body }, query, "keyword", 0),
              };
            })
          : [],
      requestedMode: selected.data,
      effectiveMode: selected.data,
      phase: "keyword" as const,
    };
    response.headers.set("Search-Requested-Mode", selected.data);
    response.headers.set("Search-Effective-Mode", effectiveMode);
    if (!query) response.headers.set("Search-Reason", "empty-query");
    else if (plan.mode !== "simple") response.headers.set("Search-Reason", "explicit-query");
    else if (effectiveMode !== selected.data) response.headers.set("Search-Reason", "unavailable");
    if (url.pathname === "/api/public/search/stream") {
      const payload = await response.clone().json();
      const envelope = {
        results: payload,
        requestedMode: selected.data,
        effectiveMode,
        ...(response.headers.get("Search-Reason")
          ? { reason: response.headers.get("Search-Reason") }
          : {}),
      };
      const encoder = new TextEncoder();
      const requestSignal = init?.signal;
      let closed = false;
      let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const timers = new Set<ReturnType<typeof setTimeout>>();
      let abortListener: (() => void) | undefined;
      const clearScheduledEvents = () => {
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
      };
      const detachAbortListener = () => {
        if (abortListener) requestSignal?.removeEventListener("abort", abortListener);
        abortListener = undefined;
      };
      const emit = (event: string) => {
        if (!closed) streamController?.enqueue(encoder.encode(event));
      };
      const schedule = (callback: () => void, delayMs = 0) => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!closed) callback();
        }, delayMs);
        timers.add(timer);
      };
      const keywordToAiDelayMs = environment.delay === "slow" ? 1_200 : 0;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          abortListener = () => {
            if (closed) return;
            closed = true;
            clearScheduledEvents();
            detachAbortListener();
            controller.close();
          };
          requestSignal?.addEventListener("abort", abortListener, { once: true });
          if (requestSignal?.aborted) {
            abortListener();
            return;
          }

          emit(`event: started\ndata: ${JSON.stringify({ requestedMode: selected.data })}\n\n`);
          schedule(() => {
            emit(`event: keyword\ndata: ${JSON.stringify(keywordEnvelope)}\n\n`);
            schedule(() => {
              emit('event: progress\ndata: {"phase":"complete"}\n\n');
              schedule(() => {
                emit(`event: result\ndata: ${JSON.stringify(envelope)}\n\n`);
                closed = true;
                detachAbortListener();
                controller.close();
              }, keywordToAiDelayMs);
            }, keywordToAiDelayMs);
          });
        },
        cancel() {
          closed = true;
          clearScheduledEvents();
          detachAbortListener();
        },
      });
      const headers = new Headers(response.headers);
      headers.set("content-type", "text/event-stream; charset=utf-8");
      headers.set("cache-control", "no-store, no-transform");
      headers.set("x-accel-buffering", "no");
      return new Response(stream, { status: response.status, headers });
    }
    return response;
  }

  if (url.pathname === "/api/public/search/suggestions" && method === "GET") {
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const items = query.includes("sqlite")
      ? [
          { term: "SQLite3", strategy: "alternative_label" },
          { term: "SQLite 索引", strategy: "related" },
          { term: "SQLite 迁移", strategy: "sibling" },
        ]
      : query.includes("fixture")
        ? [{ term: "Code Block Fixture", strategy: "related" }]
        : query.includes("react")
          ? [{ term: "React Hooks", strategy: "related" }]
          : [];
    return jsonResponse({
      items,
    });
  }

  if (url.pathname === "/api/public/reactions" && method === "GET") {
    return jsonResponse({ reactions: [] });
  }

  if (url.pathname === "/api/public/reactions/toggle" && method === "POST") {
    return jsonResponse({ ok: true });
  }

  if (url.pathname.startsWith("/api/public/")) {
    return jsonResponse({ error: "该公共接口未接入 Web Demo 模拟。" }, 404);
  }

  return null;
}

export async function webDemoFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  app: WebDemoApp = "public"
) {
  if (!isWebDemoBuildEnabled()) return fetch(input, init);

  const url = resolveRequestUrl(input);
  const environment = getWebDemoEnvironment(window.location, app);
  const sceneState = getWebDemoSceneState(window.location, app);
  const signal = combineAbortSignals(
    init?.signal ?? (input instanceof Request ? input.signal : undefined),
    getWebDemoRequestSignal()
  );
  await waitForWebDemoRequest(environment, signal);
  assertWebDemoRequestAvailable(environment, signal);

  if ((app === "public" || isConsoleWebDemoBuild()) && url) {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const mockResponse = await getDemoPublicResponse(
      url,
      method,
      environment,
      sceneState.data,
      sceneState.scene,
      signal ? { ...init, signal } : init
    );
    if (mockResponse) return mockResponse;
  }

  return fetch(input, signal ? { ...init, signal } : init);
}
