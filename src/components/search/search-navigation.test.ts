import { describe, expect, test } from "bun:test";
import {
  buildSearchHref,
  readSearchQueryFromHref,
  shouldPushSearchHref,
} from "./search-navigation";

describe("search navigation", () => {
  test("builds route URLs from search terms", () => {
    expect(buildSearchHref("http://example.test/search", "React")).toBe(
      "http://example.test/search?q=React"
    );
    expect(buildSearchHref("http://example.test/search?q=React&page=2", "Arch Linux")).toBe(
      "http://example.test/search?q=Arch+Linux&page=2"
    );
    expect(buildSearchHref("http://example.test/search?q=React", "")).toBe(
      "http://example.test/search"
    );
  });

  test("pushes only when the committed search term changes", () => {
    expect(shouldPushSearchHref("http://example.test/search?q=React", "Arch")).toBe(true);
    expect(shouldPushSearchHref("http://example.test/search?q=React", " React ")).toBe(false);
    expect(shouldPushSearchHref("http://example.test/search", "React")).toBe(true);
    expect(shouldPushSearchHref("http://example.test/search", "")).toBe(false);
  });

  test("reads the current search term from a route", () => {
    expect(readSearchQueryFromHref("http://example.test/search?q=React+Hooks")).toBe("React Hooks");
  });

  test("preserves explicit modes in shareable URLs and history entries", () => {
    expect(buildSearchHref("http://example.test/search?q=Node&mode=rag", "SQLite", "rewrite")).toBe(
      "http://example.test/search?q=SQLite&mode=rewrite"
    );
    expect(
      shouldPushSearchHref("http://example.test/search?q=Node&mode=rag", "Node", "keyword")
    ).toBe(true);
    expect(
      shouldPushSearchHref("http://example.test/search?q=Node&mode=keyword", "Node", "keyword")
    ).toBe(false);
  });

  test("removes legacy Playbook identity from shareable URLs", () => {
    const href = buildSearchHref(
      "http://example.test/search?q=Node&edition=stale&sourceReleaseId=42&sourceTag=unknown",
      "SQLite",
      "rag",
      "all"
    );
    const params = new URL(href).searchParams;
    expect(params.get("edition")).toBeNull();
    expect(params.get("sourceReleaseId")).toBeNull();
    expect(params.get("sourceTag")).toBeNull();
    expect(
      shouldPushSearchHref(
        "http://example.test/search?q=SQLite&mode=rag&edition=stale&sourceReleaseId=42&sourceTag=unknown",
        "SQLite",
        "rag",
        "all"
      )
    ).toBe(true);
    expect(shouldPushSearchHref(href, "SQLite", "rag", "all")).toBe(false);
  });
});
