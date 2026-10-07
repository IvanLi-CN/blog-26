import {
  getWebDemoEnvironment,
  getWebDemoRequestSignal,
  isWebDemoBuildEnabled,
  type WebDemoApp,
  type WebDemoEnvironment,
  waitForWebDemoRequest,
} from "./web-demo-runtime";

function combineAbortSignals(...signals: Array<AbortSignal | null | undefined>) {
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
    return jsonResponse({ ok: true });
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
  const signal = combineAbortSignals(init?.signal, getWebDemoRequestSignal());
  await waitForWebDemoRequest(environment, signal);

  if (app === "public" && url) {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const mockResponse = getDemoPublicResponse(url, method, environment);
    if (mockResponse) return mockResponse;
  }

  return fetch(input, signal ? { ...init, signal } : init);
}
