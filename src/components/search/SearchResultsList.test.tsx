import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import SearchResultsList from "./SearchResultsList";
import { groupedSearchFixture } from "./search-fixture";

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

describe("content groups and highlight text", () => {
  for (const count of [0, 1, 2, 3, 5]) {
    test(`${count} chapters use one main entry and only useful child links`, () => {
      const { container, queryByRole, getByRole } = render(
        <SearchResultsList results={[groupedSearchFixture(count)]} query="版本" />
      );
      expect(container.querySelectorAll("[data-search-result-card]")).toHaveLength(1);
      expect(container.querySelectorAll("[data-search-section]")).toHaveLength(
        count < 2 ? 0 : Math.min(3, count)
      );
      expect(container.querySelector("a a, a button")).toBeNull();
      if (count > 3) {
        const button = getByRole("button", { name: "展开更多匹配（2）" });
        expect(button.getAttribute("aria-expanded")).toBe("false");
        expect(document.getElementById(button.getAttribute("aria-controls") ?? "")).not.toBeNull();
        fireEvent.click(button);
        expect(container.querySelectorAll("[data-search-section]")).toHaveLength(5);
        fireEvent.click(getByRole("button", { name: "收起更多匹配" }));
        expect(container.querySelectorAll("[data-search-section]")).toHaveLength(3);
      } else expect(queryByRole("button")).toBeNull();
    });
  }
  test("multiple highlights retain punctuation and text exactly without spacing classes", () => {
    const text = "最新版本，并更新 package.json 中的版本。";
    const { container } = render(
      <SearchResultsList results={[{ slug: "text", snippet: text }]} query="版本" />
    );
    expect(container.querySelector("[data-search-snippet]")?.textContent).toBe(text);
    expect(container.querySelectorAll("mark")).toHaveLength(2);
    for (const mark of container.querySelectorAll("mark")) {
      expect(mark.textContent).toBe("版本");
      expect(mark.className).not.toContain("font-semibold");
      expect(mark.className).not.toContain("px-1");
    }
  });
  test("highlighted code copies the same indentation as the existing code presentation", () => {
    const props = {
      results: [{ slug: "code", snippet: "    release 版本\n        package.json 版本" }],
    };
    const { container, rerender } = render(<SearchResultsList {...props} />);
    const plain = container.querySelector("code")?.textContent;
    rerender(<SearchResultsList {...props} query="版本" />);
    expect(container.querySelector("code")?.textContent).toBe(plain);
    expect(plain).toBe("release 版本\n    package.json 版本");
  });
});
