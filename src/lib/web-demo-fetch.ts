import {
  getMemoListWebDemoCursorPage,
  getMemoListWebDemoInitialPageForState,
  getMemoListWebDemoRecord,
} from "../../site/lib/memo-list-web-demo";
import { projectRuntimeMetricsBySlug } from "../../site/lib/project-runtime-metrics";
import type { PublicMemoRecord } from "../public-site/snapshot";
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
  type WebDemoApp,
  type WebDemoEnvironment,
  type WebDemoScene,
  waitForWebDemoRequest,
} from "./web-demo-runtime";

const consoleWebDemoStore = createConsoleWebDemoStore();

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

type DemoComment = {
  id: string;
  content: string;
  postSlug: string;
  targetType: "article" | "memo" | "project";
  targetKey: string;
  authorName: string;
  authorEmail: string | null;
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
      readerPersona: "other",
      parentId: null,
      rootId,
      status: "approved",
      deletedAt: null,
      revision: 1,
      createdAt: now - 86_400_000,
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
  if (url.pathname === "/api/public/auth/me" && method === "GET") {
    return jsonResponse(demoPublicUser(environment));
  }

  if (url.pathname === "/api/public/reader-auth/me" && method === "GET") {
    return jsonResponse({
      available: true,
      reader:
        environment.persona === "guest"
          ? null
          : {
              id: environment.persona === "admin" ? "demo-admin" : "demo-user",
              githubId: environment.persona === "admin" ? "demo-admin-github" : "demo-user-github",
              githubLogin: environment.persona === "admin" ? "ivan-demo" : "reader-demo",
              displayName: environment.persona === "admin" ? "Ivan" : "Demo User",
              avatarUrl:
                scene === "comments-avatar-failure"
                  ? "/site-assets/__missing-comment-avatar__.svg"
                  : "",
              profileUrl: "https://github.com/example",
            },
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
    const existing = rows.find(
      (row) => row.readerPersona === environment.persona && row.submissionKey === submissionKey
    );
    if (existing)
      return jsonResponse({
        success: true,
        commentId: existing.id,
        message: "评论已提交，正在等待审核",
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
      readerPersona: environment.persona === "admin" ? "admin" : "user",
      parentId,
      rootId: parentId ? rows.find((item) => item.id === parentId)?.rootId || parentId : id,
      status: "pending",
      deletedAt: null,
      revision: 1,
      createdAt: Date.now(),
      submissionKey,
    };
    rows.push(row);
    recordWebDemoMutation("提交评论", `${actualType}:${actualKey} · 待审核`);
    return jsonResponse({ success: true, commentId: id, message: "评论已提交，正在等待审核" });
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
    row.status = "pending";
    row.revision += 1;
    recordWebDemoMutation("恢复评论", `${id} · 待审核`);
    return jsonResponse({ success: true });
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
