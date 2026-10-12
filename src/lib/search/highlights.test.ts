import { describe, expect, test } from "bun:test";
import { positiveSearchTerms, searchHighlightSpans } from "./highlights";
import { planNativeQuery } from "./native-query";

describe("actual search highlights", () => {
  test("keeps technical boundaries without inventing full-width document matches", () => {
    const text = "archive Ａｒｃｈ 中文Arch中文 aarch64";
    expect(
      searchHighlightSpans(text, [{ value: "Arch" }]).map((span) =>
        text.slice(span.start, span.end)
      )
    ).toEqual(["Arch"]);
    expect(searchHighlightSpans("İ", [{ value: "i" }])).toEqual([]);
  });
  test("highlights literal aliases and prefixes without excluded terms", () => {
    const text = "NodeJS Node.js graph node";
    expect(
      searchHighlightSpans(text, positiveSearchTerms(planNativeQuery("NodeJS").ast)).map((span) =>
        text.slice(span.start, span.end)
      )
    ).toEqual(["NodeJS", "Node.js"]);
    expect(positiveSearchTerms(planNativeQuery("SQLite NOT Linux").ast)).toEqual([
      { value: "SQLite" },
    ]);
    expect(searchHighlightSpans("SQLite3", [{ value: "SQLite" }])).toEqual([]);
    expect(searchHighlightSpans("SQLite3", [{ value: "SQLite", prefix: true }])).toHaveLength(1);
  });
});
