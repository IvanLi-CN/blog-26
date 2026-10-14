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
});
