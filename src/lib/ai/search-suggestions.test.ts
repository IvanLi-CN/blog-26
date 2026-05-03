import { describe, expect, test } from "bun:test";
import {
  buildFallbackSearchSuggestions,
  normalizeSearchSuggestionItems,
  normalizeSearchSuggestions,
} from "./search-suggestions";

describe("search suggestions", () => {
  test("normalizes LLM suggestions", () => {
    expect(
      normalizeSearchSuggestions(
        [" React Hooks ", "react hooks", "Hooks", "Zettelkasten", "React"],
        "React",
        4
      )
    ).toEqual(["React Hooks", "Hooks", "Zettelkasten"]);
  });

  test("normalizes structured suggestion directions", () => {
    expect(
      normalizeSearchSuggestionItems(
        [
          { term: " 知识管理 ", strategy: "broader_by_domain", concept: "Zettelkasten" },
          { term: "知识管理", strategy: "related" },
          { term: "Zettelkasten", strategy: "alternative_label" },
          { term: "双链笔记", strategy: "related" },
        ],
        "Zettelkasten",
        4
      )
    ).toEqual([
      {
        term: "知识管理",
        strategy: "broader_by_domain",
        concept: "Zettelkasten",
        domain: undefined,
        rationale: undefined,
      },
      {
        term: "双链笔记",
        strategy: "related",
        concept: undefined,
        domain: undefined,
        rationale: undefined,
      },
    ]);
  });

  test("builds concept-relation fallback terms for known queries", () => {
    const suggestions = buildFallbackSearchSuggestions(
      "Zettelkasten",
      [
        {
          title: "React Hooks 深度解析",
          excerpt: "从依赖数组、闭包和渲染时机解释 Hook 的稳定用法。",
          tags: ["frontend/react", "programming/hooks"],
        },
        {
          title: "Arch Linux on Apple Silicon",
          excerpt: "网络、驱动和引导配置记录。",
          tags: ["linux/arch", "apple-silicon"],
        },
      ],
      5
    );

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions).toEqual(expect.arrayContaining(["卡片笔记", "知识管理"]));
    expect(suggestions.some((term) => term.toLowerCase().includes("react"))).toBe(false);
    expect(suggestions).not.toContain("Zettelkasten");
  });

  test("does not mine unrelated seed terms for unknown queries", () => {
    expect(
      buildFallbackSearchSuggestions(
        "Zettelkasten",
        [
          {
            title: "React Hooks 深度解析",
            excerpt: "从依赖数组、闭包和渲染时机解释 Hook 的稳定用法。",
            tags: ["frontend/react", "programming/hooks"],
          },
        ],
        5
      ).some((term) => term.toLowerCase().includes("react"))
    ).toBe(false);
  });
});
