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
});
