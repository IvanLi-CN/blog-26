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

  test("keeps the full Playbook edition identity in shareable URLs", () => {
    const playbook = {
      edition: "a".repeat(64),
      sourceReleaseId: "42",
      sourceTag: "v3.0.0",
    };
    const href = buildSearchHref(
      "http://example.test/search?q=Node",
      "SQLite",
      "rag",
      "all",
      playbook
    );
    expect(new URL(href).searchParams.get("edition")).toBe(playbook.edition);
    expect(new URL(href).searchParams.get("sourceReleaseId")).toBe("42");
    expect(new URL(href).searchParams.get("sourceTag")).toBe("v3.0.0");
    expect(shouldPushSearchHref(href, "SQLite", "rag", "all", playbook)).toBe(false);
  });
});
