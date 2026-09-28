import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import SearchResultsList from "./SearchResultsList";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

afterEach(() => {
  cleanup();
});

describe("SearchResultsList titles", () => {
  test("omits a missing memo title without losing its snippet or link", () => {
    const { container, getByRole, getByText } = render(
      <SearchResultsList
        results={[
          {
            slug: "memo-without-title",
            title: null,
            snippet: "闪念正文仍然出现在搜索结果中。",
            type: "memo",
          },
        ]}
      />
    );

    const memoLink = getByRole("link", { name: "打开闪念：无标题闪念" });
    expect(memoLink.getAttribute("href")).toBe("/memos/memo-without-title");
    expect(getByText("闪念正文仍然出现在搜索结果中。")).toBeTruthy();
    expect(container.querySelector("h2")).toBeNull();
    const typeChip = container.querySelector(".nature-content-type-chip");
    expect(typeChip).not.toBeNull();
    expect(typeChip?.querySelector(".sr-only")?.textContent).toBe("闪念");
  });

  test("keeps the existing slug fallback for a post without a title", () => {
    const { getByRole } = render(
      <SearchResultsList
        results={[
          {
            slug: "untitled-post",
            title: null,
            snippet: "文章片段",
            type: "post",
          },
        ]}
      />
    );

    expect(getByRole("heading", { name: "untitled-post" })).toBeTruthy();
    expect(getByRole("link", { name: "打开文章：untitled-post" }).getAttribute("href")).toBe(
      "/posts/untitled-post"
    );
  });
});
