import { describe, expect, test } from "bun:test";
import { buildFallbackSearchSuggestions, normalizeSearchSuggestions } from "./search-suggestions";

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

  test("builds fallback terms from public content seeds", () => {
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
    expect(suggestions.some((term) => term.toLowerCase().includes("react"))).toBe(true);
    expect(suggestions).not.toContain("Zettelkasten");
  });
});
