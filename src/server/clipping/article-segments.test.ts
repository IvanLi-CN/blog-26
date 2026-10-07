import { describe, expect, test } from "bun:test";
import { articleSegments, retrievePassages, validateTranslation } from "./article-segments";

describe("article structure and complete segment coverage", () => {
  test("keeps every chapter and literal code while bounding prose segments", () => {
    const code = "```ts\nconst text = `中文\\n`;\n```";
    const source = `# Opening\n\n${"A paragraph about recovery. ".repeat(800)}\n\n${code}\n\n## Last chapter\n\nThe final observation.`;
    const segments = articleSegments(source);
    expect(segments.filter((segment) => segment.literal).map((segment) => segment.content)).toEqual(
      [code]
    );
    expect(segments.at(-1)?.content).toContain("The final observation.");
    expect(
      segments
        .filter((segment) => !segment.literal)
        .every((segment) => segment.content.length <= 6000)
    ).toBe(true);
    expect(
      segments
        .map((segment) => segment.content)
        .join("")
        .replace(/\s/g, "")
    ).toBe(source.replace(/\s/g, ""));
  });
  test("rejects translations that lose headings, links or table rows", () => {
    const source = "# Topic\n\n[Link](https://example.com)\n\n| A | B |\n| - | - |\n| 1 | 2 |";
    expect(() => validateTranslation(source, source.replace("Topic", "主题"))).not.toThrow();
    expect(() =>
      validateTranslation(`# Topic\n\n${"Long paragraph. ".repeat(100)}`, "# 主题")
    ).toThrow("缺少正文");
    expect(() => validateTranslation(source, source.replace("# Topic", "Topic"))).toThrow("章节");
    expect(() =>
      validateTranslation(source, source.replace("https://example.com", "https://other.example"))
    ).toThrow("链接");
    expect(() => validateTranslation(source, source.replace("\n| 1 | 2 |", ""))).toThrow("表格");
  });
  test("returns stable numbered evidence for passages beyond the introduction", () => {
    const source =
      [...Array(9)].map((_, i) => `Intro ${i}`).join("\n\n") +
      "\n\nEpoch fencing prevents stale owner writes.";
    expect(retrievePassages(source, "epoch fencing")).toContain("[原文段落 10]");
    expect(retrievePassages("前言\n\n租约保护过期写入", "租约保护", "译文")).toContain(
      "[译文段落 2]"
    );
    expect(retrievePassages(`${"Intro. ".repeat(1200)}Epoch fencing`, "epoch fencing")).toContain(
      "Epoch fencing"
    );
  });
});
