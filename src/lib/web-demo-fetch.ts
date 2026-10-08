import {
  assertWebDemoRequestAvailable,
  getWebDemoEnvironment,
  getWebDemoRequestSignal,
  isWebDemoBuildEnabled,
  type WebDemoApp,
  type WebDemoEnvironment,
  waitForWebDemoRequest,
} from "./web-demo-runtime";

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

function getDemoPublicResponse(url: URL, method: string, environment: WebDemoEnvironment) {
  // The Demo build's server supplies route-scoped fixture data after the
  // common connection/delay/abort policy has admitted this actual read.
  if (url.pathname === "/api/public/page" && method === "GET") return null;
  if (url.pathname === "/api/public/auth/me" && method === "GET") {
    return jsonResponse(demoPublicUser(environment));
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

  if (url.pathname === "/api/public/search" && method === "GET") {
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
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
    ];
    return jsonResponse(
      query
        ? results.filter((item) => `${item.title} ${item.excerpt}`.toLowerCase().includes(query))
        : []
    );
  }

  if (url.pathname === "/api/public/search/suggestions" && method === "GET") {
    return jsonResponse({
      items: [
        { term: "fixture", strategy: "related" },
        { term: "Memo", strategy: "related" },
      ],
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
  const signal = combineAbortSignals(
    init?.signal ?? (input instanceof Request ? input.signal : undefined),
    getWebDemoRequestSignal()
  );
  await waitForWebDemoRequest(environment, signal);
  assertWebDemoRequestAvailable(environment, signal);

  if (app === "public" && url) {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const mockResponse = getDemoPublicResponse(url, method, environment);
    if (mockResponse) return mockResponse;
  }

  return fetch(input, signal ? { ...init, signal } : init);
}
