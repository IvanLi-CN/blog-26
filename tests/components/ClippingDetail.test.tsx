import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, render, waitFor } from "@testing-library/react";
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
      partial: "**answer**",
      conversationId: "legacy-conversation",
    };
    const terminal = {
      messages: [
        ...partial.messages,
        {
          id: "assistant-1",
          role: "assistant" as const,
          text: "**answer**\n\nfinal",
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
      const pending = await waitFor(() => view.getByText("answer", { exact: false }));
      const pendingIdentity = pending.closest("[data-message-id]")?.getAttribute("data-message-id");
      expect(view.getByText("**same**")).toBeTruthy();
      expect(view.getByText("answer", { exact: false }).closest("strong")).toBeTruthy();

      current = terminal;
      await act(async () => {
        emit?.(current);
      });
      await waitFor(() => expect(view.getByText("final")).toBeTruthy());
      expect(view.getAllByText("answer", { exact: false })).toHaveLength(1);
      expect(view.getByText("final")).toBeTruthy();
      expect(
        view
          .getByText("answer", { exact: false })
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
});
