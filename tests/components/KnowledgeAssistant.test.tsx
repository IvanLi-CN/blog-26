import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });

const { default: KnowledgeAssistant } = await import("../../site/components/KnowledgeAssistant");

const originalFetch = globalThis.fetch;

const quota = {
  policy: {
    maxConversations: 3,
    retentionMs: 86_400_000,
    tokenHourlyLimit: 10_000,
    tokenWeeklyLimit: 50_000,
    questionHourlyLimit: 20,
    questionWeeklyLimit: 100,
  },
  tokenHour: 0,
  tokenWeek: 0,
  questionHour: 0,
  questionWeek: 0,
  activeConversationCount: 0,
  unlimited: false,
  tokenHourlyRemaining: 10_000,
  tokenWeeklyRemaining: 50_000,
  questionHourlyRemaining: 20,
  questionWeeklyRemaining: 100,
};

const auth = {
  authenticated: true,
  loggedOut: false,
  expiresAt: Date.now() + 86_400_000,
  principal: {
    id: "test-user",
    kind: "reader",
    isAdmin: false,
    displayName: "Test User",
    email: "test@example.com",
    avatarUrl: "",
    profileUrl: null,
    adminUserId: null,
    readerId: "test-reader",
    github: null,
  },
};

function conversation(id: string, kind: "general" | "clipping", clippingMemoId: string | null) {
  return {
    id,
    frontendUserId: "test-user",
    kind,
    title: id,
    clippingMemoId,
    clippingVersionId: null,
    status: "active",
    createdAt: 1,
    lastUserMessageAt: 1,
    expiresAt: Date.now() + 86_400_000,
    deletedAt: null,
  };
}

function snapshot(id: string) {
  return {
    conversation: conversation(id, "general", null),
    messages: [],
    generationJobs: [],
    activeGenerationJob: null,
  };
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  document.documentElement.removeAttribute("data-web-demo-build");
  document.body.replaceChildren();
});

describe.serial("KnowledgeAssistant interaction boundaries", () => {
  test("does not let a delayed context refresh overwrite a newer conversation choice", async () => {
    let listCalls = 0;
    let releaseSecondList: (() => void) | undefined;
    const secondList = new Promise<void>((resolve) => {
      releaseSecondList = resolve;
    });
    const clipping = conversation("clip-a-conversation", "clipping", "clip-a");
    const general = conversation("general-conversation", "general", null);

    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/public/frontend-auth/me") return json(auth);
      if (url.pathname === "/api/public/chat/quota") return json(quota);
      if (url.pathname === "/api/public/chat" && init?.method !== "POST") {
        if (url.searchParams.has("conversation")) {
          const conversationId = url.searchParams.get("conversation");
          if (!conversationId) throw new Error("Missing conversation id");
          return json(snapshot(conversationId));
        }
        listCalls += 1;
        if (listCalls === 2) await secondList;
        return json({ conversations: [clipping, general], quota });
      }
      throw new Error(`Unexpected request: ${url.pathname} ${init?.method ?? "GET"}`);
    }) as typeof fetch;

    window.history.replaceState({}, "", "/posts/a/?clipping=clip-a");
    const clippingMarker = document.createElement("div");
    clippingMarker.dataset.assistantClippingSlug = "clip-a";
    document.body.append(clippingMarker);
    const view = render(<KnowledgeAssistant />);

    const fab = await waitFor(() => view.getByTestId("assistant-fab"));
    fireEvent.click(fab);
    const generalButton = await waitFor(
      () => view.getAllByRole("button", { name: /general-conversation/ })[0]
    );

    document.dispatchEvent(new Event("astro:page-load"));
    fireEvent.click(generalButton);
    releaseSecondList?.();

    await waitFor(() => expect(generalButton.getAttribute("aria-current")).toBe("true"));
    expect(
      view.getAllByRole("button", { name: /clip-a-conversation/ })[0].getAttribute("aria-current")
    ).not.toBe("true");
  });

  test("migrates a new draft after an idempotent replay even when the replay says it was not created", async () => {
    let postCalls = 0;
    let listCalls = 0;
    const postedBodies: Array<Record<string, unknown>> = [];
    const persisted = conversation("replayed-conversation", "general", null);

    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/public/frontend-auth/me") return json(auth);
      if (url.pathname === "/api/public/chat/quota") return json(quota);
      if (url.pathname === "/api/public/chat" && init?.method === "POST") {
        postCalls += 1;
        postedBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        if (postCalls === 1) throw new Error("response lost");
        return json(
          {
            status: "queued",
            conversationId: persisted.id,
            turnId: "replayed-turn",
            requestId: postedBodies[0].requestId,
            userMessageId: "replayed-user",
            assistantMessageId: "replayed-assistant",
            createdConversation: false,
          },
          202
        );
      }
      if (url.pathname === "/api/public/chat" && url.searchParams.has("conversation"))
        return json(snapshot(persisted.id));
      if (url.pathname === "/api/public/chat") {
        listCalls += 1;
        return json({ conversations: [persisted], quota });
      }
      throw new Error(`Unexpected request: ${url.pathname} ${init?.method ?? "GET"}`);
    }) as typeof fetch;

    const view = render(<KnowledgeAssistant fullPage />);
    await waitFor(() => expect(listCalls).toBe(1));
    await waitFor(() => view.getAllByRole("button", { name: /replayed-conversation/ })[0]);
    await waitFor(() =>
      expect(view.getByRole("heading", { name: "replayed-conversation" })).toBeTruthy()
    );
    const newConversation = await waitFor(() => view.getByRole("button", { name: /新建对话/ }));
    const user = userEvent.setup({ document: window.document });
    fireEvent.click(newConversation);
    await waitFor(() => expect(view.getByRole("heading", { name: "新对话" })).toBeTruthy());
    const textarea = view.getByLabelText("知识助手问题") as HTMLTextAreaElement;
    await user.type(textarea, "保留这份问题");
    fireEvent.keyDown(view.getByLabelText("知识助手问题"), { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(postCalls).toBe(1));
    const send = view.getByRole("button", { name: "发送" }) as HTMLButtonElement;
    await waitFor(() => expect(send.disabled).toBe(false));

    fireEvent.click(send);
    await waitFor(() => expect(postCalls).toBe(2));
    await waitFor(() => {
      const rawState = window.sessionStorage.getItem("site-knowledge-assistant-ui:test-user");
      expect(rawState).toBeTruthy();
      const state = JSON.parse(rawState ?? "{}");
      expect(state.drafts[persisted.id]).toBe("保留这份问题");
      expect(state.drafts.new).toBeUndefined();
    });
    expect(postedBodies[1].requestId).toBe(postedBodies[0].requestId);
  });

  test("rebinds an empty auto-prepared clipping conversation to the next clipping page", async () => {
    let listCalls = 0;
    let postedBody: Record<string, unknown> | null = null;
    const created = conversation("clip-b-conversation", "clipping", "clip-b");

    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/public/frontend-auth/me") return json(auth);
      if (url.pathname === "/api/public/chat/quota") return json(quota);
      if (url.pathname === "/api/public/chat" && init?.method === "POST") {
        postedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return json(
          {
            status: "queued",
            conversationId: created.id,
            turnId: "clip-b-turn",
            requestId: postedBody.requestId,
            userMessageId: "clip-b-user",
            assistantMessageId: "clip-b-assistant",
            createdConversation: true,
          },
          202
        );
      }
      if (url.pathname === "/api/public/chat" && url.searchParams.has("conversation"))
        return json({ ...snapshot(created.id), conversation: created });
      if (url.pathname === "/api/public/chat") {
        listCalls += 1;
        return json({ conversations: [], quota });
      }
      throw new Error(`Unexpected request: ${url.pathname} ${init?.method ?? "GET"}`);
    }) as typeof fetch;

    window.history.replaceState({}, "", "/posts/a/?clipping=clip-a");
    const clippingMarker = document.createElement("div");
    clippingMarker.dataset.assistantClippingSlug = "clip-a";
    document.body.append(clippingMarker);
    const view = render(<KnowledgeAssistant />);
    await waitFor(() => expect(listCalls).toBe(1));
    await waitFor(() => expect(view.getByTestId("assistant-fab")).toBeTruthy());
    fireEvent.click(view.getByTestId("assistant-fab"));
    await waitFor(() => expect(view.getByRole("heading", { name: "新对话" })).toBeTruthy());
    fireEvent.click(view.getAllByRole("button", { name: "关闭知识助手" })[1]);

    window.history.replaceState({}, "", "/posts/b/?clipping=clip-b");
    clippingMarker.dataset.assistantClippingSlug = "clip-b";
    document.dispatchEvent(new Event("astro:page-load"));
    await waitFor(() => expect(listCalls).toBe(2));
    await waitFor(() => {
      const rawState = window.sessionStorage.getItem("site-knowledge-assistant-ui:test-user");
      expect(rawState).toBeTruthy();
      const state = JSON.parse(rawState ?? "{}");
      expect(state.newConversationContext.slug).toBe("clip-b");
    });

    fireEvent.click(view.getByTestId("assistant-fab"));
    const user = userEvent.setup({ document: window.document });
    const textarea = view.getByLabelText("知识助手问题") as HTMLTextAreaElement;
    await user.type(textarea, "询问 B");
    fireEvent.keyDown(view.getByLabelText("知识助手问题"), { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(postedBody?.clippingMemoId).toBe("clip-b"));
    expect(postedBody?.clippingMemoId).not.toBe("clip-a");
    expect(postedBody?.kind).toBe("clipping");
  });
});
