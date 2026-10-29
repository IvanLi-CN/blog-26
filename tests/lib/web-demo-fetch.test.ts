import { afterEach, describe, expect, it } from "bun:test";
import { setupAdminDemoApiMocks } from "../../apps/admin/src/demo/mock-admin-api";
import { webDemoFetch } from "../../src/lib/web-demo-fetch";
import { cancelWebDemoRequests } from "../../src/lib/web-demo-runtime";

const originalFetch = globalThis.fetch;
function mockFetch(handler: () => Promise<Response>): typeof fetch {
  return Object.assign(handler, { preconnect: originalFetch.preconnect });
}
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;

function installBrowser(search: string, enabled = true) {
  const dataset: Record<string, string> = {
    webDemoBuild: enabled ? "true" : "false",
  };
  const storage = new Map<string, string>();
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const fakeWindow = {
    location: new URL(`http://127.0.0.1:38110/posts/${search}`),
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const current = listeners.get(type) ?? new Set();
      current.add(listener);
      listeners.set(type, current);
    },
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((listener) => {
        listener(event);
      });
      return true;
    },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    setTimeout,
    clearTimeout,
    fetch: originalFetch.bind(globalThis),
  };
  const fakeDocument = { documentElement: { dataset } };

  (globalThis as { window?: unknown }).window = fakeWindow;
  (globalThis as { document?: unknown }).document = fakeDocument;
}

afterEach(() => {
  cancelWebDemoRequests();
  globalThis.fetch = originalFetch;
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe("webDemoFetch", () => {
  it("admits only online route data reads through the fixture server boundary", async () => {
    installBrowser("?d_connection=offline&d_delay=normal");
    let calls = 0;
    globalThis.fetch = mockFetch(async () => {
      calls += 1;
      return Response.json({ kind: "posts", data: { source: "fixture" } });
    });
    await expect(webDemoFetch("/api/public/page?path=%2Fposts%2F")).rejects.toThrow(
      "Failed to fetch"
    );
    expect(calls).toBe(0);
    installBrowser("?d_connection=online&d_delay=normal");
    expect(await (await webDemoFetch("/api/public/page?path=%2Fposts%2F")).json()).toMatchObject({
      kind: "posts",
    });
    expect(calls).toBe(1);
  });
  it("cancels a delayed route read before contacting the fixture server", async () => {
    installBrowser("?d_connection=online&d_delay=custom&d_delay_ms=2300");
    let calls = 0;
    globalThis.fetch = mockFetch(async () => {
      calls += 1;
      return Response.json({});
    });
    const controller = new AbortController();
    const pending = webDemoFetch("/api/public/page?path=%2Fposts%2F", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(0);
  });
  it("short-circuits public requests when the simulated connection is offline", async () => {
    installBrowser("?d_persona=admin&d_connection=offline&d_delay=normal");
    let fetchCalls = 0;
    globalThis.fetch = mockFetch(async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    });

    await expect(webDemoFetch("/api/public/auth/me")).rejects.toThrow("Failed to fetch");
    expect(fetchCalls).toBe(0);
  });

  it("returns simulated public identity without reaching the real API", async () => {
    installBrowser("?d_persona=admin&d_connection=online&d_delay=normal");
    let fetchCalls = 0;
    globalThis.fetch = mockFetch(async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    });

    const response = await webDemoFetch("/api/public/auth/me");

    expect(await response.json()).toMatchObject({ id: "demo-admin", isAdmin: true });
    expect(fetchCalls).toBe(0);
  });

  it("keeps assistant conversation creation and deletion on the public route contract", async () => {
    installBrowser("?d_persona=user&d_scene=assistant-ready&d_connection=online");

    const initial = await (await webDemoFetch("/api/public/chat")).json();
    expect(initial.conversations).toHaveLength(1);
    const seedId = initial.conversations[0].id;

    const submitted = await webDemoFetch("/api/public/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "web-demo-assistant-request",
        clientRequestId: "web-demo-assistant-client",
        content: "这个站点记录什么？",
      }),
    });
    expect(submitted.status).toBe(202);
    const created = await submitted.json();
    expect(created.conversationId).not.toBe(seedId);

    const expanded = await (await webDemoFetch("/api/public/chat")).json();
    expect(expanded.conversations.map((conversation: { id: string }) => conversation.id)).toContain(
      created.conversationId
    );

    const deleted = await webDemoFetch(
      `/api/public/chat/conversations/${encodeURIComponent(created.conversationId)}`,
      { method: "DELETE" }
    );
    expect(deleted.status).toBe(200);
    const afterDelete = await (await webDemoFetch("/api/public/chat")).json();
    expect(
      afterDelete.conversations.map((conversation: { id: string }) => conversation.id)
    ).not.toContain(created.conversationId);
    expect(
      (
        await webDemoFetch(
          `/api/public/chat?conversation=${encodeURIComponent(created.conversationId)}`
        )
      ).status
    ).toBe(404);
  });

  it("keeps created assistant conversations across scenes and exempts demo admins", async () => {
    installBrowser("?d_persona=user&d_scene=clipping-ready&d_connection=online");
    const submitted = await webDemoFetch("/api/public/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "cross-scene-assistant-request",
        content: "剪藏上下文问题",
        kind: "clipping",
        clippingMemoId: "memo-web-demo-1181",
      }),
    });
    const created = await submitted.json();
    const browser = (globalThis as unknown as { window?: { location: URL } }).window;
    if (!browser) throw new Error("browser fixture is unavailable");
    browser.location = new URL(
      "http://127.0.0.1:38110/chat?d_persona=user&d_scene=assistant-ready"
    );
    expect(
      (
        await webDemoFetch(
          `/api/public/chat?conversation=${encodeURIComponent(created.conversationId)}`
        )
      ).status
    ).toBe(200);

    installBrowser("?d_persona=admin&d_scene=assistant-ready&d_connection=online");
    for (let index = 0; index < 4; index += 1) {
      const response = await webDemoFetch("/api/public/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: `admin-assistant-request-${index}`,
          content: `管理员问题 ${index}`,
        }),
      });
      expect(response.status).toBe(202);
    }
  });

  it("routes Web Demo clipping assistant turns through the clipping adapter", async () => {
    installBrowser("?d_persona=user&d_scene=assistant-ready&d_connection=online");
    const first = await webDemoFetch("/api/public/memos/memo-web-demo-1181/clipping/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "剪藏首问", requestId: "web-demo-clipping-1" }),
    });
    expect(first.status).toBe(202);
    const firstSubmission = await first.json();

    const second = await webDemoFetch("/api/public/memos/memo-web-demo-1181/clipping/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "剪藏续问", requestId: "web-demo-clipping-2" }),
    });
    expect(second.status).toBe(202);
    expect((await second.json()).conversationId).toBe(firstSubmission.conversationId);

    const clippingSnapshot = await webDemoFetch(
      `/api/public/memos/memo-web-demo-1181/clipping/chat?conversationId=${encodeURIComponent(firstSubmission.conversationId)}`
    );
    expect(clippingSnapshot.status).toBe(200);
    expect(await clippingSnapshot.json()).toMatchObject({
      conversationId: firstSubmission.conversationId,
      messages: expect.any(Array),
    });

    const snapshot = await webDemoFetch(
      `/api/public/chat?conversation=${encodeURIComponent(firstSubmission.conversationId)}`
    );
    expect((await snapshot.json()).messages).toHaveLength(4);
  });

  it("does not fall back to a real public API for unknown endpoints", async () => {
    installBrowser("?d_persona=admin&d_connection=online&d_delay=normal");
    let fetchCalls = 0;
    globalThis.fetch = mockFetch(async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    });

    const response = await webDemoFetch("/api/public/unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "该公共接口未接入 Web Demo 模拟。" });
    expect(fetchCalls).toBe(0);
  });

  it("preserves the live fetch path when the build flag is absent", async () => {
    installBrowser("?d_persona=admin&d_connection=offline&d_delay=slow", false);
    let fetchCalls = 0;
    globalThis.fetch = mockFetch(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ source: "live" }));
    });

    const response = await webDemoFetch("/api/public/auth/me");

    expect(await response.json()).toEqual({ source: "live" });
    expect(fetchCalls).toBe(1);
  });

  it("returns online search results and suggestions through the fixture boundary", async () => {
    installBrowser("?d_connection=online");
    const response = await webDemoFetch("/api/public/search?q=fixture");
    expect(response.ok).toBe(true);
    expect(await response.json()).toContainEqual(
      expect.objectContaining({ slug: "code-block-fixture" })
    );
    const suggestions = await webDemoFetch("/api/public/search/suggestions?q=fixture");
    expect(await suggestions.json()).toEqual({
      items: [{ term: "Code Block Fixture", strategy: "related" }],
    });
    const unrelated = await webDemoFetch("/api/public/search/suggestions?q=Zettelkasten");
    expect(await unrelated.json()).toEqual({ items: [] });
  });

  it("returns the AI search fixture through the SSE boundary", async () => {
    installBrowser("?d_connection=online");
    const response = await webDemoFetch("/api/public/search/stream?q=SQLite&mode=rag");
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain("event: started");
    expect(body).toContain("event: keyword");
    expect(body).toContain('event: progress\ndata: {"phase":"complete"}');
    expect(body.indexOf("event: keyword")).toBeLessThan(body.indexOf("event: result"));
    expect(body).toContain("event: result");
    expect(body).toContain("SQLite3：嵌入式数据库实践");
  });

  it("fences queued SSE fixture events after reader cancellation", async () => {
    installBrowser("?d_connection=online");
    const response = await webDemoFetch("/api/public/search/stream?q=SQLite&mode=rag");
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader?.read();
    expect(new TextDecoder().decode(first?.value)).toContain("event: started");
    await reader?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await reader?.read())?.done).toBe(true);
  });

  it("closes the SSE fixture when its request signal aborts", async () => {
    installBrowser("?d_connection=online");
    const controller = new AbortController();
    const response = await webDemoFetch("/api/public/search/stream?q=SQLite&mode=rag", {
      signal: controller.signal,
    });
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    expect(new TextDecoder().decode((await reader?.read())?.value)).toContain("event: started");
    controller.abort();
    expect((await reader?.read())?.done).toBe(true);
  });

  it("keeps keyword mode on the JSON boundary instead of opening an SSE stream", async () => {
    installBrowser("?d_connection=online");
    const response = await webDemoFetch("/api/public/search/stream?q=SQLite&mode=keyword");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps release previews long enough to exercise result width and section rendering", async () => {
    installBrowser("?d_connection=online&d_data=dense");
    const response = await webDemoFetch("/api/public/search?q=release&mode=keyword");
    const results = await response.json();
    const delivery = results.find((item: { slug: string }) => item.slug === "delivery");

    expect(delivery).toBeDefined();
    expect(delivery.excerpt.length).toBeGreaterThan(120);
    expect(delivery.sections).toHaveLength(3);
    expect(delivery.sections[0].snippet.length).toBeGreaterThan(120);
  });

  it("serves a stable first metric read and controlled rolling targets", async () => {
    installBrowser("?d_data=motion&d_connection=online");
    const first = await (await webDemoFetch("/api/public/metrics/v1/codex-vibe-monitor")).json();
    const second = await (await webDemoFetch("/api/public/metrics/v1/codex-vibe-monitor")).json();

    expect(first.tokensPerMinute.value).toBe(793758);
    expect(second.tokensPerMinute.value).toBe(1_002_345);
    expect(second.todayTokens.value).toBe(999_999_999.9);
  });

  it("rejects unauthenticated comment mutations and non-admin moderation", async () => {
    installBrowser("?d_persona=guest");
    expect((await webDemoFetch("/api/public/comments/missing", { method: "DELETE" })).status).toBe(
      401
    );
    installBrowser("?d_persona=user");
    expect((await webDemoFetch("/api/public/comments/missing", { method: "PATCH" })).status).toBe(
      404
    );
    expect(
      (await webDemoFetch("/api/public/comments/missing/moderate", { method: "POST" })).status
    ).toBe(403);
    installBrowser("?d_persona=admin");
    expect(
      (await webDemoFetch("/api/public/comments/missing/moderate", { method: "POST" })).ok
    ).toBe(true);
  });

  it("keeps an unbound demo admin as an automatic frontend comment author", async () => {
    installBrowser("?d_persona=admin&d_github_binding=unbound&d_connection=online");
    const identity = await webDemoFetch("/api/public/frontend-auth/me");
    expect(await identity.json()).toMatchObject({
      authenticated: true,
      principal: {
        id: "demo-admin",
        kind: "admin",
        isAdmin: true,
        displayName: "Ivan",
        avatarUrl: "/site-assets/avatar.jpg",
        profileUrl: null,
        readerId: null,
        github: null,
      },
    });

    const commentsUrl =
      "/api/public/comments?slug=demo-article&targetType=article&targetKey=demo-article";
    const response = await webDemoFetch(commentsUrl, {
      method: "POST",
      body: JSON.stringify({
        content: "未绑定管理员评论",
        target: { type: "article", key: "demo-article" },
        submissionKey: "unbound-admin-comment",
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authorRole: "admin",
      status: "approved",
      message: "管理员评论已公开",
    });
    const commentsResponse = await webDemoFetch(commentsUrl);
    const commentsPayload = (await commentsResponse.json()) as {
      comments: Array<{ content: string; author: { avatarUrl: string } }>;
    };
    expect(
      commentsPayload.comments.find((comment) => comment.content === "未绑定管理员评论")?.author
        .avatarUrl
    ).toBe("/site-assets/avatar.jpg");
  });

  it("keeps valid empty comments distinct from an unavailable target", async () => {
    installBrowser("?d_data=empty&d_connection=online");
    const emptyResponse = await webDemoFetch(
      "/api/public/comments?slug=demo-article&targetType=article&targetKey=demo-article"
    );
    expect(emptyResponse.status).toBe(200);
    expect(await emptyResponse.json()).toMatchObject({ comments: [], totalPages: 1 });

    installBrowser("?d_scene=comments-target-unavailable&d_connection=online");
    const unavailableResponse = await webDemoFetch(
      "/api/public/comments?slug=demo-article&targetType=article&targetKey=demo-article"
    );
    expect(unavailableResponse.status).toBe(404);
    expect(await unavailableResponse.json()).toMatchObject({
      error: "评论目标不存在",
      code: "NOT_FOUND",
    });
  });

  it("keeps legacy slug-only comment reads compatible", async () => {
    installBrowser("?d_connection=online");
    const response = await webDemoFetch("/api/public/comments?slug=missing-legacy-article");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ comments: [], totalPages: 1 });
  });

  it("serves a broken avatar URL for the avatar fallback scene", async () => {
    installBrowser("?d_scene=comments-avatar-failure&d_persona=user&d_connection=online");
    const identity = await webDemoFetch("/api/public/reader-auth/me");
    expect(await identity.json()).toMatchObject({
      reader: { avatarUrl: "/site-assets/__missing-comment-avatar__.svg" },
    });
    const comments = await webDemoFetch(
      "/api/public/comments?slug=demo-article&targetType=article&targetKey=demo-article"
    );
    const payload = await comments.json();
    expect(payload.comments[0].author.avatarUrl).toBe(
      "/site-assets/__missing-comment-avatar__.svg"
    );
  });

  it("cancels direct admin uploads even when the caller supplies no signal", async () => {
    installBrowser("?d_persona=admin&d_delay=custom&d_delay_ms=2300");
    setupAdminDemoApiMocks();
    const pending = window.fetch("/api/files/local/blog/upload.png", {
      method: "POST",
      body: "fixture",
    });
    cancelWebDemoRequests();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("honors an AbortSignal carried by a Request object", async () => {
    installBrowser("?d_delay=custom&d_delay_ms=2300");
    const controller = new AbortController();
    const pending = webDemoFetch(
      new Request("http://127.0.0.1:38110/api/public/auth/me", { signal: controller.signal })
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels zero-delay responses before they leave the request boundary", async () => {
    installBrowser("?d_persona=admin&d_connection=online&d_delay=normal");
    const pending = webDemoFetch("/api/public/auth/me");
    cancelWebDemoRequests();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
