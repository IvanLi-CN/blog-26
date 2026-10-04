import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MarkdownRenderer from "../../src/components/common/MarkdownRenderer";
import { getMarkdownOutline } from "../../src/lib/markdown-outline";
import { createPlaybookContents } from "../../src/lib/playbook/outline";

describe("Playbook document outline", () => {
  test("preserves authored numbering and nests real headings, ignoring fenced code", () => {
    const markdown = [
      "### 1.1 **准备**与 `输入`",
      "#### 检查来源",
      "```markdown\n### This is code\n```",
      "### 1.2 发布",
    ].join("\n\n");
    const [section] = createPlaybookContents([{ id: "release", title: "1. 发布", markdown }]);
    expect(section.title).toBe("1. 发布");
    expect(section.children?.map((item) => item.title)).toEqual(["1.1 准备与 输入", "1.2 发布"]);
    expect(section.children?.[0].children?.[0].title).toBe("检查来源");
  });

  test("all outline destinations exist in sanitized SSR, including duplicate and setext headings", () => {
    const markdown =
      "### 同名\n\n### 同名\n\n同名\n-----\n\n### [链接](https://example.com) 与 <em>强调</em>";
    const outline = getMarkdownOutline(markdown, "section");
    expect(outline.map((item) => item.title)).toEqual(["同名", "同名", "同名", "链接 与 强调"]);
    expect(new Set(outline.map((item) => item.id)).size).toBe(4);
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        content: markdown,
        headingAnchorPrefix: "section",
        enableMermaid: false,
      })
    );
    for (const item of outline) expect(html).toContain(`id="${item.id}"`);
    expect(outline.every((item) => item.id.startsWith("user-content-playbook-section-"))).toBe(
      true
    );
  });

  test("heading anchors are opt-in and do not execute embedded markup", () => {
    const content = "### Safe\n\n<script>alert('private')</script>";
    const plain = renderToStaticMarkup(
      createElement(MarkdownRenderer, { content, enableMermaid: false })
    );
    const anchored = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        content,
        headingAnchorPrefix: "section",
        enableMermaid: false,
      })
    );
    expect(plain).not.toContain("user-content-playbook-");
    expect(anchored).not.toContain("<script");
    expect(anchored).toContain('id="user-content-playbook-section-safe"');
  });
});
