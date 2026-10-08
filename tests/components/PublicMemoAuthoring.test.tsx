import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });
const { PublicMemoComposerIsland, PublicMemoDetailControlsIsland } = await import(
  "../../site/components/PublicMemoAuthoring"
);

const originalFetch = globalThis.fetch;
const originalConfirm = window.confirm;
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
  window.history.replaceState(null, "", "/");
  document.body.replaceChildren();
});

describe("Author request lifetime", () => {
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

describe("Administrator Memo pagination", () => {
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
