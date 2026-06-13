import { describe, expect, it } from "bun:test";
import {
  parseFrontmatterDocument,
  parseFrontmatterMap,
  stringifyFrontmatterDocument,
  stripFrontmatter,
  updateDocumentBody,
  updateFrontmatterDocument,
} from "@/lib/frontmatter-document";

const sampleDocument = `---
title: React Hooks 深度解析
slug: react-hooks-deep-dive
draft: false
public: true
tags:
  - React
  - Hooks
category: frontend
---

# React Hooks 深度解析

正文内容。`;

describe("frontmatter-document", () => {
  it("parses frontmatter and body separately", () => {
    const parsed = parseFrontmatterDocument(sampleDocument);

    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter.title).toBe("React Hooks 深度解析");
    expect(parsed.frontmatter.slug).toBe("react-hooks-deep-dive");
    expect(parsed.frontmatter.tags).toEqual(["React", "Hooks"]);
    expect(parsed.body).toContain("# React Hooks 深度解析");
    expect(parsed.frontmatterText).toContain("category: frontend");
  });

  it("updates only frontmatter while preserving body", () => {
    const updated = updateFrontmatterDocument(
      sampleDocument,
      "title: 新标题\nslug: new-slug\ndraft: true"
    );

    expect(updated).toContain("title: 新标题");
    expect(updated).toContain("slug: new-slug");
    expect(updated).toContain("draft: true");
    expect(updated).toContain("# React Hooks 深度解析");
    expect(updated).not.toContain("category: frontend");
  });

  it("updates only body while preserving frontmatter", () => {
    const updated = updateDocumentBody(sampleDocument, "# 新正文\n\n新的内容。");

    expect(updated).toContain("title: React Hooks 深度解析");
    expect(updated).toContain("slug: react-hooks-deep-dive");
    expect(updated).toContain("# 新正文");
    expect(updated).not.toContain("# React Hooks 深度解析\n\n正文内容。");
  });

  it("maps scalar and array frontmatter values to strings for editor consumers", () => {
    const mapped = parseFrontmatterMap(sampleDocument);

    expect(mapped.title).toBe("React Hooks 深度解析");
    expect(mapped.slug).toBe("react-hooks-deep-dive");
    expect(mapped.draft).toBe("false");
    expect(mapped.tags).toBe("React, Hooks");
  });

  it("removes frontmatter when asked for stripped body", () => {
    expect(stripFrontmatter(sampleDocument)).toBe("\n# React Hooks 深度解析\n\n正文内容。");
  });

  it("stringifies a document without frontmatter when frontmatter text is blank", () => {
    expect(stringifyFrontmatterDocument("# Hello", "")).toBe("# Hello");
  });
});
