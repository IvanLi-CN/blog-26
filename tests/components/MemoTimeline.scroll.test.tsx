import { afterEach, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import MemoTimeline from "../../site/components/MemoTimeline";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: "http://localhost/" });

const originalFetch = globalThis.fetch;
const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");

function scrollTo(top: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: top });
  fireEvent.scroll(window);
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  if (originalScrollY) Object.defineProperty(window, "scrollY", originalScrollY);
});

test("loads another newer page after scrolling away and back to the same top position", async () => {
  let requests = 0;
  const memo = (id: string) => ({
    id,
    slug: id,
    title: id,
    excerpt: id,
    isPublic: true,
    tags: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    publishedAt: null,
  });
  globalThis.fetch = (async () => {
    requests += 1;
    return Response.json({
      memos: [memo(`newer-${requests}`)],
      hasMore: true,
      nextCursor: null,
      hasPrevious: true,
      previousCursor: `newer-page-${requests + 1}`,
    });
  }) as typeof fetch;

  const { container } = render(
    <MemoTimeline
      source="database"
      initialMemos={[memo("middle")]}
      initialHasMore={false}
      initialNextCursor={null}
      initialHasNewer
      initialPreviousCursor="newer-page-1"
      iconMap={{}}
      iconSvgMap={{}}
    />
  );

  scrollTo(80);
  scrollTo(0);
  await waitFor(() => expect(requests).toBe(1));
  await waitFor(() =>
    expect(container.querySelector("[data-loaded-memos]")?.getAttribute("data-loaded-memos")).toBe(
      "2"
    )
  );

  fireEvent.scroll(window);
  expect(requests).toBe(1);
  scrollTo(80);
  scrollTo(0);
  await waitFor(() => expect(requests).toBe(2));
  await waitFor(() =>
    expect(container.querySelector("[data-loaded-memos]")?.getAttribute("data-loaded-memos")).toBe(
      "3"
    )
  );
});
