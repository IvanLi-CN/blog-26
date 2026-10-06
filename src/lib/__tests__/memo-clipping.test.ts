import { describe, expect, it } from "bun:test";
import { composeClippingMemo, recognizeMemoClipping } from "../memo-clipping";

describe("authored clipping recognition", () => {
  it.each([
    ["https://example.com/article", null],
    ["[文章](https://example.com/article)", "文章"],
    ["# https://example.com/article", null],
    ["## [文章](https://example.com/article)", "文章"],
    ["### https://example.com/article", null],
  ])("recognizes the complete target line %s", (line, label) => {
    const result = recognizeMemoClipping(`\n\n${line}\n\n备注\n#剪藏`, {});
    expect(result.targetUrl).toBe("https://example.com/article");
    expect(result.linkLabel).toBe(label);
    expect(result.remarks).toBe("备注");
  });

  it.each([
    "正文\nhttps://example.com/article",
    "阅读 https://example.com/article",
    "`https://example.com/article`",
    "ftp://example.com/article",
    "#### https://example.com/article",
    "https://user:password@example.com/article",
  ])("keeps invalid input and never skips to a later URL: %s", (body) => {
    const result = recognizeMemoClipping(body, { tags: ["剪藏"] });
    expect(result.enabled).toBe(true);
    expect(result.targetUrl).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.remarks).toBe(body);
  });

  it.each([
    "https://example.com/article#剪藏",
    "https://example.com/article\n\n`#剪藏`",
    "https://example.com/article\n\n```text\n#剪藏\n```",
    "https://example.com/article\n\n[链接](https://example.com/#剪藏)",
    "https://example.com/article\n\n#剪藏笔记",
  ])("ignores non-tag contexts: %s", (body) => {
    expect(recognizeMemoClipping(body, {}).enabled).toBe(false);
  });

  it.each(["#剪藏", "\\#剪藏"])("recognizes editor-authored tags: %s", (tag) => {
    const result = recognizeMemoClipping(`<https://example.com/article>\n\n作者备注\n\n${tag}`, {
      tags: null,
    });
    expect(result).toMatchObject({
      enabled: true,
      targetUrl: "https://example.com/article",
      remarks: "作者备注",
    });
  });

  it("removes a repeated target line when the saved title is the same link", () => {
    const result = recognizeMemoClipping("<https://example.com/article>\n\n\\#剪藏", {
      title: "<https://example.com/article>",
      tags: null,
    });
    expect(result).toMatchObject({ enabled: true, remarks: "", authorTitle: null });
  });

  it("uses a URL-only title as target and retains a custom title", () => {
    expect(
      recognizeMemoClipping("备注", {
        title: "[标题](https://example.com/article)",
        tags: ["剪藏"],
      })
    ).toMatchObject({
      targetUrl: "https://example.com/article",
      linkLabel: "标题",
      authorTitle: null,
      remarks: "备注",
    });
    expect(
      recognizeMemoClipping("https://example.com/article\n\n备注", {
        title: "作者标题",
        tags: ["剪藏"],
      })
    ).toMatchObject({ authorTitle: "作者标题", remarks: "备注" });
  });

  it("preserves code remarks and composes exactly one generated summary", () => {
    const result = recognizeMemoClipping("https://example.com/article\n\n```text\n#剪藏\n```", {
      tags: ["剪藏"],
    });
    expect(result.remarks).toBe("```text\n#剪藏\n```");
    expect(composeClippingMemo(result.remarks, "总结")).toBe(
      "```text\n#剪藏\n```\n\n---\n\n**Agent 摘要**\n\n总结"
    );
    expect(composeClippingMemo("", "总结")).toBe("**Agent 摘要**\n\n总结");
  });
});
