import { describe, expect, it } from "bun:test";
import {
  analyzeFrontmatterDocument,
  autoFixFrontmatterStyle,
  buildFrontmatterSuggestions,
  getRecommendedFrontmatterDateString,
  lintFrontmatterStyle,
  parseFrontmatterDocument,
  parseFrontmatterMap,
  stringifyFrontmatterDocument,
  stripFrontmatter,
  updateDocumentBody,
  updateFrontmatterDocument,
  validateFrontmatterText,
} from "@/lib/frontmatter-document";
import {
  buildPostAuthoringDocument,
  extractPostDraftFields,
  normalizePostBody,
} from "@/lib/post-body-contract";

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

  it("preserves frontmatter whitespace while updating the document", () => {
    const updated = updateFrontmatterDocument(sampleDocument, "title: \nsubtitle: draft\n");

    expect(updated).toStartWith("---\ntitle: \nsubtitle: draft\n\n---\n");
    expect(parseFrontmatterDocument(updated).frontmatterText).toBe("title: \nsubtitle: draft\n");
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

  it("flags unknown fields as warnings without blocking the document", () => {
    const validation = validateFrontmatterText(
      "title: Example\nslug: example-post\nmysteryField: keep-me"
    );

    expect(validation.hasErrors).toBe(false);
    expect(validation.hasWarnings).toBe(true);
    expect(validation.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        field: "mysteryField",
      })
    );
  });

  it("requires tags to use YAML list syntax", () => {
    const validation = validateFrontmatterText("title: Example\ntags: { primary: React }");

    expect(validation.hasErrors).toBe(true);
    expect(validation.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        field: "tags",
        message: "tags 必须写成数组：\ntags:\n  - React\n  - Hooks",
      })
    );
  });

  it("accepts YAML flow sequence syntax for tags", () => {
    const validation = validateFrontmatterText("title: Example\ntags: [React, Hooks]");

    expect(validation.hasErrors).toBe(false);
    expect(validation.diagnostics).not.toContainEqual(
      expect.objectContaining({
        severity: "error",
        field: "tags",
      })
    );
  });

  it("keeps nested tags indentation as a non-blocking style lint finding", () => {
    const validation = validateFrontmatterText("title: Example\ntags:\n  - Reactd\n      - Hooks");
    const styleDiagnostics = lintFrontmatterStyle(
      "title: Example\ntags:\n  - Reactd\n      - Hooks"
    );

    expect(validation.hasErrors).toBe(false);
    expect(validation.diagnostics).not.toContainEqual(
      expect.objectContaining({
        field: "tags",
      })
    );
    expect(styleDiagnostics).toContainEqual(
      expect.objectContaining({
        field: "tags",
        message: "tags 列表缩进不一致。当前 YAML 仍可解析，但建议保持同层 `- item` 缩进。",
      })
    );
  });

  it("auto-fixes inconsistent tags indentation without changing parsed tag semantics", () => {
    const input = "title: Example\ntags:\n  - React\n      - Hooks";
    const fixed = autoFixFrontmatterStyle(input);

    expect(fixed.fixedFields).toEqual(["tags"]);
    expect(fixed.frontmatterText).toBe("title: Example\ntags:\n  - React - Hooks");
    expect(parseFrontmatterDocument(`---\n${input}\n---`).frontmatter.tags).toEqual(
      parseFrontmatterDocument(`---\n${fixed.frontmatterText}\n---`).frontmatter.tags
    );
    expect(validateFrontmatterText(fixed.frontmatterText).hasErrors).toBe(false);
  });

  it("canonicalizes safe tags list indentation into the standard YAML array style", () => {
    const fixed = autoFixFrontmatterStyle("title: Example\ntags:\n    - React\n    - Hooks");

    expect(fixed.fixedFields).toEqual(["tags"]);
    expect(fixed.frontmatterText).toBe("title: Example\ntags:\n  - React\n  - Hooks");
    expect(validateFrontmatterText(fixed.frontmatterText).hasErrors).toBe(false);
  });

  it("validates boolean, slug, and date fields", () => {
    const validation = validateFrontmatterText(
      "slug: Invalid Slug\ndraft: yes\npublishDate: definitely-not-a-date\ndate: 2026-06-17"
    );

    expect(validation.hasErrors).toBe(true);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "slug", severity: "error" }),
        expect.objectContaining({ field: "draft", severity: "error" }),
        expect.objectContaining({ field: "publishDate", severity: "error" }),
      ])
    );
  });

  it("analyzes a full document and keeps parse result plus diagnostics together", () => {
    const analysis = analyzeFrontmatterDocument(
      `---
title: Example
tags: foo
unknown: keep
---

Body`
    );

    expect(analysis.frontmatter.title).toBe("Example");
    expect(analysis.body).toBe("\nBody");
    expect(analysis.hasErrors).toBe(true);
    expect(analysis.hasWarnings).toBe(true);
  });

  it("normalizes suggestion sources and formats recommended publish dates", () => {
    const suggestions = buildFrontmatterSuggestions({
      tags: ["Hooks", "React", "Hooks", "  "],
      categories: ["frontend", "backend", "frontend"],
    });

    expect(suggestions.tags).toEqual(["Hooks", "React"]);
    expect(suggestions.categories).toEqual(["backend", "frontend"]);
    expect(getRecommendedFrontmatterDateString(new Date("2026-06-17T09:00:00.000Z"))).toBe(
      "2026-06-17"
    );
  });

  it("normalizes contaminated post rows into body-only content without repeated stripping", () => {
    const contaminated = `---
title: USB-C 安全 5V Sink
slug: usb-c-safe-5v-sink
draft: true
---

# USB-C 安全 5V Sink

纯正文。`;

    const once = normalizePostBody(contaminated);
    const twice = normalizePostBody(once.body);

    expect(once.wasContaminated).toBeTrue();
    expect(once.body).toBe("\n# USB-C 安全 5V Sink\n\n纯正文。");
    expect(once.frontmatter.title).toBe("USB-C 安全 5V Sink");
    expect(twice.wasContaminated).toBeFalse();
    expect(twice.body).toBe(once.body);
  });

  it("rebuilds authoring documents from structured post fields and clean body", () => {
    const document = buildPostAuthoringDocument({
      title: "Body Only Canonical",
      slug: "body-only-canonical",
      excerpt: "摘要",
      draft: false,
      public: true,
      category: "hardware",
      author: "Ivan Li",
      image: "./assets/cover.png",
      tags: ["usb-c", "sink"],
      publishDate: Date.UTC(2026, 5, 20),
      updateDate: Date.UTC(2026, 5, 21),
      body: "\n# Body Only Canonical\n\n纯正文。",
    });

    expect(document.wasContaminated).toBeFalse();
    expect(document.content).toContain("title: Body Only Canonical");
    expect(document.content).toContain("slug: body-only-canonical");
    expect(document.content).toContain("category: hardware");
    expect(document.content).toContain("author: Ivan Li");
    expect(document.content).toContain("image: ./assets/cover.png");
    expect(document.content).toContain("tags:");
    expect(document.content).toContain("# Body Only Canonical");
  });

  it("extracts body-only canonical post fields from an authoring document", () => {
    const extracted = extractPostDraftFields(
      `---
title: USB-C 安全 5V Sink
slug: usb-c-safe-5v-sink
excerpt: 面向作者态预览的摘要。
draft: true
public: false
category: hardware
author: Ivan Li
image: ./assets/cover.png
tags:
  - usb-c
  - sink
publishDate: 2026-06-20
updateDate: 2026-06-21
---

![1.00](./assets/cover.png)

纯正文第一段。`,
      {
        title: "Persisted fallback",
        slug: "persisted-fallback",
        excerpt: "旧摘要",
        draft: false,
        public: true,
      }
    );

    expect(extracted.title).toBe("USB-C 安全 5V Sink");
    expect(extracted.slug).toBe("usb-c-safe-5v-sink");
    expect(extracted.excerpt).toBe("面向作者态预览的摘要。");
    expect(extracted.draft).toBeTrue();
    expect(extracted.public).toBeFalse();
    expect(extracted.category).toBe("hardware");
    expect(extracted.author).toBe("Ivan Li");
    expect(extracted.image).toBe("./assets/cover.png");
    expect(extracted.tags).toEqual(["usb-c", "sink"]);
    expect(extracted.body).toBe("\n![1.00](./assets/cover.png)\n\n纯正文第一段。");
  });
});
