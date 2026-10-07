import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import MemoTimeline from "../../site/components/MemoTimeline";
import { parseConsoleInitialMemoPage } from "../../site/lib/memo-pagination";
import {
  cancelWebDemoRequests,
  getWebDemoRuntimeState,
  setWebDemoRuntimeState,
  WEB_DEMO_STATE_EVENT,
  waitForWebDemoRequest,
} from "../../src/lib/web-demo-runtime";

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
  cancelWebDemoRequests();
  globalThis.fetch = originalFetch;
  window.history.replaceState({}, "", "/");
  window.sessionStorage.removeItem("web-demo-global-environment");
  delete document.documentElement.dataset.webDemoBuild;
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

  test.each(["online", "offline"] as const)(
    "hydrates %s SSR content without inventing a failed request",
    (connection) => {
      window.history.replaceState({}, "", `/memos/?d_connection=${connection}`);
      let requests = 0;
      const { getByTestId, getByText, queryByTestId } = render(
        <MemoTimeline
          source="demo"
          initialMemos={[initialMemo]}
          initialHasMore
          initialNextCursor="older-cursor"
          pageLoader={async () => {
            requests += 1;
            return { memos: [nextMemo], hasMore: false };
          }}
          iconMap={{}}
          iconSvgMap={{}}
        />
      );

      expect(getByText("Already loaded Memo")).toBeTruthy();
      expect(requests).toBe(0);
      expect(queryByTestId("memos-empty")).toBeNull();
      expect(queryByTestId("memo-pagination-retry")).toBeNull();
      expect(getByTestId("memo-list-demo-status").textContent).not.toContain("网络故障");
    }
  );

  test("reports offline failure only after pagination, then recovers online", async () => {
    document.documentElement.dataset.webDemoBuild = "true";
    window.history.replaceState({}, "", "/memos/?d_connection=online&d_delay=normal");
    let requests = 0;
    const { getByTestId, getByText, getByRole, queryByTestId } = render(
      <MemoTimeline
        source="demo"
        initialMemos={[initialMemo]}
        initialHasMore
        initialNextCursor="older-cursor"
        pageLoader={async () => {
          requests += 1;
          await waitForWebDemoRequest(
            getWebDemoRuntimeState(window.location, "public").environment
          );
          return { memos: [nextMemo], hasMore: false };
        }}
        iconMap={{}}
        iconSvgMap={{}}
      />
    );

    const changeConnection = (connection: "online" | "offline") => {
      const state = getWebDemoRuntimeState(window.location, "public");
      act(() =>
        setWebDemoRuntimeState(
          { ...state, environment: { ...state.environment, connection } },
          { syncTheme: false }
        )
      );
    };
    changeConnection("offline");
    expect(requests).toBe(0);
    expect(queryByTestId("memo-pagination-retry")).toBeNull();
    expect(getByTestId("memo-list-demo-status").textContent).not.toContain("网络故障");
    fireEvent.click(getByRole("button", { name: "加载较旧的 Memo" }));
    await waitFor(() => expect(getByTestId("memo-pagination-retry")).toBeTruthy());
    expect(requests).toBe(1);
    expect(getByText("Already loaded Memo")).toBeTruthy();
    changeConnection("online");
    fireEvent.click(getByRole("button", { name: "加载较旧的 Memo" }));
    await waitFor(() => expect(getByText("Next Memo")).toBeTruthy());
    expect(getByText("Already loaded Memo")).toBeTruthy();
    expect(requests).toBe(2);
  });
});

describe("MemoTimeline snapshot pagination", () => {
  test.each(["snapshot", "database"] as const)(
    "keeps real fetch errors for the %s source",
    async (source) => {
      globalThis.fetch = (async () => {
        throw new TypeError("Failed to fetch the real Memo page");
      }) as typeof fetch;
      const { getByRole, getByTestId, getByText } = render(
        <MemoTimeline
          source={source}
          initialMemos={[initialMemo]}
          initialHasMore
          initialNextCursor="older-cursor"
          iconMap={{}}
          iconSvgMap={{}}
        />
      );

      fireEvent.click(getByRole("button", { name: "加载较旧的 Memo" }));
      const retry = await waitFor(() => getByTestId("memo-pagination-retry"));
      expect(retry.getAttribute("aria-label")).toContain("Failed to fetch the real Memo page");
      expect(retry.getAttribute("aria-label")).not.toContain("模拟网络故障");
      expect(getByText("Already loaded Memo")).toBeTruthy();
    }
  );

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
