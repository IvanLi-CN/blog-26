import { describe, expect, it } from "bun:test";
import { formatMarkdownBody, MarkdownFormatError } from "@/lib/markdown-format";

describe("formatMarkdownBody", () => {
  it("formats cramped headings, paragraphs, and lists", () => {
    expect(formatMarkdownBody("# Title\nText\n- one\n- two")).toBe(
      ["# Title", "", "Text", "", "- one", "- two", ""].join("\n")
    );
  });

  it("preserves GFM tables, task lists, fenced code, and math", () => {
    const formatted = formatMarkdownBody(
      ["|A|B|", "|-|-|", "|1|2|", "- [x] done", "```ts", "const value = 1", "```", "$a^2$"].join(
        "\n"
      )
    );

    expect(formatted).toContain("| A | B |");
    expect(formatted).toContain("- [x] done");
    expect(formatted).toContain("```ts\nconst value = 1\n```");
    expect(formatted).toContain("$a^2$");
    expect(formatted.endsWith("\n")).toBe(true);
  });

  it("preserves wiki links used by content features", () => {
    expect(formatMarkdownBody("Cover ![[wiki-cover.png|1200]] and [[Note Page]]")).toBe(
      "Cover ![[wiki-cover.png|1200]] and [[Note Page]]\n"
    );
  });

  it("returns a diagnostic error for content that cannot be formatted", () => {
    expect(() => formatMarkdownBody("invalid\0markdown")).toThrow(MarkdownFormatError);
  });
});
