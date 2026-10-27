import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, render } from "@testing-library/react";
import {
  type ClippingArticle,
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

    render(
      <ClippingDetail
        slug="clipping-live"
        memoContent="实时剪藏正文"
        initialArticle={article}
        initialCanDiscuss
        live
        hideChat
        transport={hiddenChatTransport}
      />
    );
    await act(async () => await Promise.resolve());

    expect(chatReads).toBe(0);
    expect(subscriptions).toBe(0);
  });
});
