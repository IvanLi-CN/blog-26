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
  type WebDemoApp,
  type WebDemoEnvironment,
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
  init?: RequestInit
) {
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
    return jsonResponse({ comments: [], totalPages: 1, isAdmin: environment.persona === "admin" });
  }

  if (url.pathname === "/api/public/comments" && method === "POST") {
    return jsonResponse({ ok: true, comment: null });
  }

  if (url.pathname.startsWith("/api/public/comments/") && ["PATCH", "DELETE"].includes(method)) {
    if (environment.persona === "guest") return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    return jsonResponse({ error: "评论不存在" }, 404);
  }

  if (/^\/api\/public\/comments\/[^/]+\/moderate$/.test(url.pathname) && method === "POST") {
    if (environment.persona === "guest") return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    if (environment.persona !== "admin") return jsonResponse({ error: "FORBIDDEN" }, 403);
    return jsonResponse({ success: true });
  }

  const runtimeMatch = url.pathname.match(/^\/api\/public\/metrics\/v1\/([^/]+)$/);
  if (runtimeMatch && method === "GET") {
    const payload = demoRuntimeMetrics(runtimeMatch[1] ?? "", dataMode);
    return payload ? jsonResponse(payload) : jsonResponse({ error: "指标不存在" }, 404);
  }

  if (url.pathname === "/api/public/search" && method === "GET") {
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const selected = searchModeSchema.safeParse(url.searchParams.get("mode") ?? "keyword");
    if (!selected.success) return jsonResponse({ error: "不支持的搜索模式" }, 400);
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
    response.headers.set("Search-Requested-Mode", selected.data);
    response.headers.set("Search-Effective-Mode", effectiveMode);
    if (!query) response.headers.set("Search-Reason", "empty-query");
    else if (plan.mode !== "simple") response.headers.set("Search-Reason", "explicit-query");
    else if (effectiveMode !== selected.data) response.headers.set("Search-Reason", "unavailable");
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
      init
    );
    if (mockResponse) return mockResponse;
  }

  return fetch(input, signal ? { ...init, signal } : init);
}
