import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  type ClippingArticle,
  type ClippingChat,
  ClippingDetail,
  type ClippingTransport,
} from "../../src/components/memos/ClippingDetail";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });

const article: ClippingArticle = {
  reading: {
    status: "completed",
    summaryState: "completed",
    translationState: "completed",
    sourceTranslationState: "completed",
    translatedSegments: 1,
    segmentCount: 1,
    error: null,
    warning: null,
    usingPreviousVersion: false,
    versionId: null,
    sourceUrl: null,
    targetUrl: "https://example.com/article",
  },
  source: "原文",
  translation: "译文",
  content: "旧的剪藏正文",
};

const transport: ClippingTransport = {
  request: async <T,>() => article as T,
  subscribe: () => () => undefined,
};

afterEach(() => cleanup());

describe("ClippingDetail", () => {
  test("shows the saved Memo body immediately when the parent content changes", async () => {
    const view = render(
      <ClippingDetail
        slug="clipping-memo"
        memoContent="保存前的 Memo 正文"
        initialArticle={article}
        transport={transport}
      />
    );

    expect(view.getByTestId("clipping-memo-content").textContent).toContain("旧的剪藏正文");

    view.rerender(
      <ClippingDetail
        slug="clipping-memo"
        memoContent="保存后的 Memo 正文"
        initialArticle={article}
        transport={transport}
      />
    );

    expect(view.getByTestId("clipping-memo-content").textContent).toContain("保存后的 Memo 正文");
    expect(view.getByTestId("clipping-memo-content").textContent).not.toContain("旧的剪藏正文");
    await act(async () => await Promise.resolve());
  });

  test("names the standalone AI panel when no tablist is present", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query === "(min-width: 1280px)",
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    try {
      const view = render(
        <ClippingDetail
          slug="clipping-preview"
          memoContent="预览正文"
          initialArticle={article}
          initialCanDiscuss
          transport={transport}
        />
      );

      expect(view.getByRole("region", { name: "文章对话" })).toBeTruthy();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  test("does not start the legacy live chat transport when chat is hidden", async () => {
    let chatReads = 0;
    let subscriptions = 0;
    const hiddenChatTransport: ClippingTransport = {
      request: async <T,>(path: string) => {
        if (path === "chat") chatReads += 1;
        return article as T;
      },
      subscribe: () => {
        subscriptions += 1;
        return () => undefined;
      },
    };

    const view = render(
      <ClippingDetail
        slug="clipping-live"
        memoId="Memos/clipping-live.md"
        memoContent="实时剪藏正文"
        initialArticle={article}
        initialCanDiscuss
        live
        hideChat
        transport={hiddenChatTransport}
      />
    );
    await act(async () => await Promise.resolve());
    expect(
      view.getByTestId("clipping-detail").getAttribute("data-assistant-clipping-memo-id")
    ).toBe("Memos/clipping-live.md");

    expect(chatReads).toBe(0);
    expect(subscriptions).toBe(0);
  });

  test("keeps the legacy chat roles and pending renderer identity across a terminal snapshot", async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query === "(min-width: 1280px)",
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    const partial = {
      messages: [{ id: "user-1", role: "user" as const, text: "**same**", timestamp: 1 }],
      generating: true,
      partial: "```ts\nconst value = 1;\n```",
      conversationId: "legacy-conversation",
    };
    const terminal = {
      messages: [
        ...partial.messages,
        {
          id: "assistant-1",
          role: "assistant" as const,
          text: "```ts\nconst value = 1;\n```\n\nfinal",
          timestamp: 2,
        },
      ],
      generating: false,
      partial: "",
      conversationId: "legacy-conversation",
    };
    const chatArticle = { ...article, canDiscuss: true };
    let current: ClippingChat = partial;
    let emit: ((snapshot: ClippingChat) => void) | undefined;
    const chatTransport: ClippingTransport = {
      request: async <T,>(path: string) => {
        if (path === "chat") return current as T;
        return chatArticle as T;
      },
      subscribe: (onSnapshot) => {
        emit = onSnapshot;
        onSnapshot(current);
        return () => undefined;
      },
    };
    try {
      const view = render(
        <ClippingDetail
          slug="clipping-chat"
          memoContent="正文"
          initialArticle={article}
          initialCanDiscuss
          live
          transport={chatTransport}
        />
      );
      const pending = await waitFor(() => view.getByRole("button", { name: "折叠代码" }));
      const pendingIdentity = pending.closest("[data-message-id]")?.getAttribute("data-message-id");
      expect(view.getByText("**same**")).toBeTruthy();
      fireEvent.click(view.getByRole("button", { name: "折叠代码" }));
      expect(view.getByRole("button", { name: "展开代码" })).toBeTruthy();

      current = terminal;
      await act(async () => {
        emit?.(current);
      });
      await waitFor(() => expect(view.getByText("final")).toBeTruthy());
      expect(
        view.getAllByTestId("clipping-chat")[0].querySelectorAll(".conversation-code-block")
      ).toHaveLength(1);
      expect(view.getByRole("button", { name: "展开代码" })).toBeTruthy();
      expect(view.getByText("final")).toBeTruthy();
      expect(
        view
          .getByRole("button", { name: "展开代码" })
          .closest("[data-message-id]")
          ?.getAttribute("data-message-id")
      ).toBe(pendingIdentity);
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  test("associates partial deduplication with the current user turn", async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query === "(min-width: 1280px)",
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    const initial = {
      messages: [
        { id: "old-user", role: "user" as const, text: "旧问题", timestamp: 1 },
        { id: "old-assistant", role: "assistant" as const, text: "共同前缀旧答案", timestamp: 2 },
        { id: "new-user", role: "user" as const, text: "新问题", timestamp: 3 },
      ],
      generating: true,
      partial: "共同前缀新正文",
      conversationId: "prefix-conversation",
    } satisfies ClippingChat;
    const terminalWithStalePartial = {
      messages: [
        ...initial.messages,
        {
          id: "new-assistant",
          role: "assistant" as const,
          text: "共同前缀新正文完成",
          timestamp: 4,
        },
      ],
      generating: false,
      partial: "共同前缀新正文",
      conversationId: "prefix-conversation",
    } satisfies ClippingChat;
    const chatArticle = { ...article, canDiscuss: true };
    let current: ClippingChat = initial;
    let emit: ((snapshot: ClippingChat) => void) | undefined;
    const chatTransport: ClippingTransport = {
      request: async <T,>(path: string) => (path === "chat" ? (current as T) : (chatArticle as T)),
      subscribe: (onSnapshot) => {
        emit = onSnapshot;
        onSnapshot(current);
        return () => undefined;
      },
    };
    try {
      const view = render(
        <ClippingDetail
          slug="clipping-prefix"
          memoContent="正文"
          initialArticle={article}
          initialCanDiscuss
          live
          transport={chatTransport}
        />
      );
      await waitFor(() => expect(view.getByText("共同前缀新正文")).toBeTruthy());
      expect(view.getByText("共同前缀旧答案")).toBeTruthy();

      current = terminalWithStalePartial;
      await act(async () => emit?.(current));
      await waitFor(() => expect(view.getByText("共同前缀新正文完成")).toBeTruthy());
      expect(view.getAllByText("共同前缀新正文完成")).toHaveLength(1);
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });

  test("preserves a scrolled reading position until the reader returns to the tail", async () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query === "(min-width: 1280px)",
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    const first = {
      messages: [{ id: "reader-user", role: "user" as const, text: "问题", timestamp: 1 }],
      generating: true,
      partial: "第一段",
      conversationId: "reader-position",
    } satisfies ClippingChat;
    const second = { ...first, partial: "第一段\n第二段" } satisfies ClippingChat;
    const chatArticle = { ...article, canDiscuss: true };
    let emit: ((snapshot: ClippingChat) => void) | undefined;
    const chatTransport: ClippingTransport = {
      request: async <T,>(path: string) => (path === "chat" ? (first as T) : (chatArticle as T)),
      subscribe: (onSnapshot) => {
        emit = onSnapshot;
        onSnapshot(first);
        return () => undefined;
      },
    };
    try {
      const view = render(
        <ClippingDetail
          slug="clipping-reader-position"
          memoContent="正文"
          initialArticle={article}
          initialCanDiscuss
          live
          transport={chatTransport}
        />
      );
      await waitFor(() => view.getByText("第一段"));
      const messages = view.getByTestId("clipping-chat").querySelector(".clipping-chat-messages");
      if (!messages) throw new Error("chat messages container missing");
      Object.defineProperties(messages, {
        scrollHeight: { configurable: true, value: 1000 },
        clientHeight: { configurable: true, value: 200 },
        scrollTop: { configurable: true, writable: true, value: 100 },
      });
      fireEvent.scroll(messages);
      await act(async () => emit?.(second));
      expect(messages.scrollTop).toBe(100);

      messages.scrollTop = 800;
      fireEvent.scroll(messages);
      await act(async () => emit?.({ ...second, partial: "第一段\n第二段\n第三段" }));
      expect(messages.scrollTop).toBe(1000);
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: originalMatchMedia,
      });
    }
  });
});
