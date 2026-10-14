import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });
const { PublicMemoComposerIsland, PublicMemoDetailControlsIsland } = await import(
  "../../site/components/PublicMemoAuthoring"
);

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;
const originalPublicSiteBasePath = process.env.PUBLIC_SITE_BASE_PATH;
const memo = (id: string) => ({
  id,
  slug: id,
  title: id,
  content: `Content for ${id}`,
  isPublic: true,
  tags: [],
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.confirm = originalConfirm;
  if (originalPublicSiteBasePath === undefined) delete process.env.PUBLIC_SITE_BASE_PATH;
  else process.env.PUBLIC_SITE_BASE_PATH = originalPublicSiteBasePath;
  window.history.replaceState(null, "", "/");
  document.body.replaceChildren();
});

describe.serial("Author request lifetime", () => {
  for (const boundary of ["route-start", "unmount"]) {
    test(`ignores a late successful delete after ${boundary}`, async () => {
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let writeSignal: AbortSignal | null | undefined;
      globalThis.fetch = (async (input, init) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/api/public/auth/me") return Response.json({ isAdmin: true });
        if (init?.method === "DELETE") {
          writeSignal = init.signal;
          // Deliberately return success even after cancellation to exercise the completion guard.
          await gate;
          return Response.json({ success: true });
        }
        return Response.json(memo("local-memo"));
      }) as typeof fetch;
      window.confirm = () => true;
      const view = render(<PublicMemoDetailControlsIsland slug="local-memo" />);
      try {
        const button = await waitFor(() => {
          const candidate = view.getByTestId("admin-live-memo-delete") as HTMLButtonElement;
          expect(candidate.disabled).toBe(false);
          return candidate;
        });
        fireEvent.click(button);
        await waitFor(() => expect(writeSignal).toBeDefined());
        if (boundary === "route-start") document.dispatchEvent(new Event("astro:before-swap"));
        else view.unmount();
        expect(writeSignal?.aborted).toBe(true);
        window.history.replaceState(null, "", "/projects/");
        await act(async () => {
          release?.();
          await gate;
        });
        expect(window.location.pathname).toBe("/projects/");
      } finally {
        release?.();
      }
    });
  }
});

describe.serial("Administrator Memo pagination", () => {
  for (const activeDirection of ["older", "newer"] as const) {
    const queuedDirection = activeDirection === "older" ? "newer" : "older";

    test(`loads ${queuedDirection} after an in-flight ${activeDirection} page`, async () => {
      const requests: string[] = [];
      let releaseActivePage: (() => void) | undefined;
      const activePageReleased = new Promise<void>((resolve) => {
        releaseActivePage = resolve;
      });
      globalThis.fetch = (async (input) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/api/public/auth/me") {
          return Response.json({ isAdmin: true });
        }
        const direction = url.searchParams.get("direction") ?? "older";
        requests.push(direction);
        if (direction === activeDirection) await activePageReleased;
        return Response.json({
          memos: [memo(direction)],
          hasMore: false,
          nextCursor: null,
          hasPrevious: false,
          previousCursor: null,
        });
      }) as typeof fetch;

      const { getByRole, getByTestId } = render(
        <PublicMemoComposerIsland
          initialIsAdmin
          initialMemos={[memo("middle")]}
          initialHasMore
          initialNextCursor="older-cursor"
          initialHasNewer
          initialPreviousCursor="newer-cursor"
          localSourceEnabled={false}
        />
      );

      try {
        const active = await waitFor(() =>
          getByRole("button", {
            name: activeDirection === "older" ? "加载较旧的 Memo" : "加载较新的 Memo",
          })
        );
        fireEvent.click(active);
        fireEvent.click(
          getByRole("button", {
            name: queuedDirection === "older" ? "加载较旧的 Memo" : "加载较新的 Memo",
          })
        );
        expect(requests).toEqual([activeDirection]);

        releaseActivePage?.();
        await waitFor(() => expect(requests).toEqual([activeDirection, queuedDirection]));
        await waitFor(() =>
          expect(getByTestId("admin-live-memo-list-items").getAttribute("data-loaded-memos")).toBe(
            "3"
          )
        );
        const ids = Array.from(
          getByTestId("admin-live-memo-list-items").querySelectorAll(
            "[data-testid='admin-live-memo-card']"
          )
        ).map((card) => card.getAttribute("data-id"));
        expect(ids).toEqual(["newer", "middle", "older"]);
      } finally {
        releaseActivePage?.();
      }
    });
  }
});

describe.serial("Memo detail boundary", () => {
  test("points the eye action to the same-origin Console detail route", async () => {
    let authParsed = false;
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/public/auth/me")
        return {
          ok: true,
          status: 200,
          json: async () => {
            authParsed = true;
            return { isAdmin: true };
          },
        } as Response;
      throw new Error(`Unexpected request: ${url.pathname}`);
    }) as typeof fetch;

    const view = render(
      <PublicMemoComposerIsland
        initialIsAdmin
        initialMemos={[memo("memo-detail")]}
        localSourceEnabled={false}
      />
    );

    const eye = await waitFor(() => view.getByRole("link", { name: "查看详情" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(authParsed).toBe(true);
    expect(eye.getAttribute("href")).toBe("/memos/memo-detail/");
  });

  test("keeps the configured public site base path on the detail route", async () => {
    process.env.PUBLIC_SITE_BASE_PATH = "/console";
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/public/auth/me") {
        return Response.json({ isAdmin: true });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }) as typeof fetch;

    const view = render(
      <PublicMemoComposerIsland
        initialIsAdmin
        initialMemos={[memo("memo-base-path")]}
        localSourceEnabled={false}
      />
    );

    const eye = await waitFor(() => view.getByRole("link", { name: "查看详情" }));
    expect(eye.getAttribute("href")).toBe("/console/memos/memo-base-path/");
  });

  test("removes an SSR admin detail when the refreshed session is no longer admin", async () => {
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input), "http://localhost");
      const json = (payload: unknown) =>
        ({ ok: true, status: 200, json: async () => payload }) as Response;
      if (url.pathname === "/api/public/auth/me") return json(null);
      if (url.pathname === "/api/public/memos/private-memo") {
        return json({ ...memo("private-memo"), isPublic: true });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }) as typeof fetch;

    const view = render(
      <PublicMemoDetailControlsIsland
        slug="private-memo"
        initialIsAdmin
        initialMemo={{ ...memo("private-memo"), isPublic: false }}
      />
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(view.queryByRole("button", { name: "编辑 Memo" })).toBeNull();
  });
});
