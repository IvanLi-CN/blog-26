import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import MemoTimeline from "./MemoTimeline";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

const initialMemo = {
  id: "memo-initial",
  slug: "memo-initial",
  title: "Already loaded Memo",
  excerpt: "This record must stay visible after a failed page request.",
  tags: [],
  createdAt: "2026-09-30T12:00:00.000Z",
  publishedAt: null,
};

const nextMemo = {
  id: "memo-next",
  slug: "memo-next",
  title: "Next Memo",
  excerpt: "Loaded after retry.",
  tags: [],
  createdAt: "2026-09-29T12:00:00.000Z",
  publishedAt: null,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  document.body.replaceChildren();
});

describe("MemoTimeline snapshot pagination", () => {
  test("keeps the current page and retries after a non-OK response with valid JSON", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      if (requests === 1) {
        return new Response(JSON.stringify({ memos: [], hasMore: false }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ memos: [nextMemo], hasMore: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const { getByRole, getByTestId, queryByTestId, getByText } = render(
      <MemoTimeline
        source="snapshot"
        initialMemos={[initialMemo]}
        initialHasMore
        initialNextCursor="older-cursor"
        iconMap={{}}
        iconSvgMap={{}}
      />
    );

    fireEvent.click(getByRole("button", { name: "加载较旧的 Memo" }));

    const retry = await waitFor(() => getByTestId("memo-pagination-retry"));
    expect(getByText("Already loaded Memo")).toBeTruthy();
    expect(queryByTestId("memo-pagination-end")).toBeNull();
    expect(retry.getAttribute("aria-label")).toContain("请求失败（503）");

    fireEvent.click(retry);

    await waitFor(() => expect(getByText("Next Memo")).toBeTruthy());
    expect(getByText("Already loaded Memo")).toBeTruthy();
    expect(requests).toBe(2);
  });
});
