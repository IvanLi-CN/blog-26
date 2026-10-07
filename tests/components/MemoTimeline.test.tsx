import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import MemoTimeline from "../../site/components/MemoTimeline";
import { parseConsoleInitialMemoPage } from "../../site/lib/memo-pagination";
import { getWebDemoRuntimeState, WEB_DEMO_STATE_EVENT } from "../../src/lib/web-demo-runtime";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });

const initialMemo = {
  id: "memo-initial",
  slug: "memo-initial",
  title: "Already loaded Memo",
  excerpt: "This record must stay visible after a failed page request.",
  tags: [],
  isPublic: true,
  createdAt: "2026-09-30T12:00:00.000Z",
  publishedAt: null,
};

const nextMemo = {
  id: "memo-next",
  slug: "memo-next",
  title: "Next Memo",
  excerpt: "Loaded after retry.",
  tags: [],
  isPublic: true,
  createdAt: "2026-09-29T12:00:00.000Z",
  publishedAt: null,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.history.replaceState({}, "", "/");
  document.body.replaceChildren();
});

describe("MemoTimeline Web Demo initial read", () => {
  test.each(["theme", "motion"] as const)(
    "keeps in-flight pagination when only %s changes",
    async (key) => {
      window.history.replaceState({}, "", "/memos/?d_scene=memo-newest&d_connection=online");
      let finishPage:
        | ((page: { memos: (typeof nextMemo)[]; hasMore: boolean }) => void)
        | undefined;
      const pendingPage = new Promise<{ memos: (typeof nextMemo)[]; hasMore: boolean }>(
        (resolve) => {
          finishPage = resolve;
        }
      );
      const { getByRole, getByText } = render(
        <MemoTimeline
          source="demo"
          initialMemos={[initialMemo]}
          initialHasMore
          initialNextCursor="older-cursor"
          pageLoader={() => pendingPage}
          iconMap={{}}
          iconSvgMap={{}}
        />
      );
      fireEvent.click(getByRole("button", { name: "加载较旧的 Memo" }));
      const state = getWebDemoRuntimeState(window.location, "public");
      fireEvent(
        window,
        new CustomEvent(WEB_DEMO_STATE_EVENT, { detail: { ...state, changed: [key] } })
      );
      finishPage?.({ memos: [nextMemo], hasMore: false });
      await waitFor(() => expect(getByText("Next Memo")).toBeTruthy());
    }
  );

  test("retains SSR memos when the first client read is offline", async () => {
    window.history.replaceState({}, "", "/memos/?d_connection=offline");

    const { getByTestId, getByText, queryByTestId } = render(
      <MemoTimeline
        source="demo"
        initialMemos={[initialMemo]}
        initialHasMore
        initialNextCursor="older-cursor"
        iconMap={{}}
        iconSvgMap={{}}
      />
    );

    expect(getByText("Already loaded Memo")).toBeTruthy();
    await waitFor(() =>
      expect(getByTestId("memo-list-demo-status").textContent).toContain("网络故障")
    );
    expect(queryByTestId("memos-empty")).toBeNull();
    expect(getByTestId("memo-list-demo-status").textContent).toContain("网络故障");
  });
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

describe("MemoTimeline console guest recovery", () => {
  test("retries the first database page after the SSR request failed", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ memos: [nextMemo], hasMore: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const { getByTestId, getByText } = render(
      <MemoTimeline
        source="database"
        initialMemos={[]}
        initialHasMore={false}
        initialNextCursor={null}
        initialError="Memo request failed"
        iconMap={{}}
        iconSvgMap={{}}
      />
    );

    fireEvent.click(getByTestId("memo-pagination-retry"));

    expect(requests).toHaveLength(1);
    await waitFor(() => expect(getByText("Next Memo")).toBeTruthy());
    expect(requests[0]).not.toContain("cursor=");
  });
});

describe("Console SSR Memo page validation", () => {
  test("rejects malformed public records before they reach the guest timeline", () => {
    expect(() =>
      parseConsoleInitialMemoPage(
        { memos: [{ ...initialMemo, tags: "private" }], hasMore: false },
        false
      )
    ).toThrow("Memo 分页响应格式无效。");
  });

  test("rejects an initial page that advertises more records without a cursor", () => {
    expect(() =>
      parseConsoleInitialMemoPage({ memos: [initialMemo], hasMore: true }, false)
    ).toThrow("Memo 分页响应格式无效。");
  });

  test("rejects advertised newer records without a previous cursor", () => {
    expect(() =>
      parseConsoleInitialMemoPage(
        { memos: [initialMemo], hasMore: false, hasPrevious: true, previousCursor: null },
        false
      )
    ).toThrow("Memo 分页响应格式无效。");
  });

  test("allows complete administrator records, including private visibility", () => {
    const page = parseConsoleInitialMemoPage(
      {
        items: [
          {
            id: "private-admin-memo",
            slug: "private-admin-memo",
            title: "Private Memo",
            content: "private content",
            excerpt: "private content",
            isPublic: false,
            tags: [],
          },
        ],
        hasMore: false,
      },
      true
    );

    expect(page.memos[0]?.isPublic).toBe(false);
  });
});

describe("MemoTimeline public page validation", () => {
  test("keeps the current page and retry state when a successful response is malformed", async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      if (requests === 1) {
        return new Response(JSON.stringify({ memos: [], hasMore: true }), {
          status: 200,
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

    fireEvent.click(retry);

    await waitFor(() => expect(getByText("Next Memo")).toBeTruthy());
    expect(getByText("Already loaded Memo")).toBeTruthy();
    expect(requests).toBe(2);
  });

  test("rejects non-public records from a guest page without hiding loaded records", async () => {
    const privateMemo = { ...nextMemo, title: "Private Memo", isPublic: false };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ memos: [privateMemo], hasMore: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const { getByRole, getByTestId, getByText, queryByText, queryByTestId } = render(
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

    await waitFor(() => expect(getByTestId("memo-pagination-retry")).toBeTruthy());
    expect(getByText("Already loaded Memo")).toBeTruthy();
    expect(queryByText("Private Memo")).toBeNull();
    expect(queryByTestId("memo-pagination-end")).toBeNull();
  });
});
