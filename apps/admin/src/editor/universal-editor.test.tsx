import { afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";

GlobalRegistrator.register();

mock.module("@/components/memos/MilkdownEditor", () => ({
  MilkdownEditor: ({
    content,
    "data-testid": dataTestId,
  }: {
    content: string;
    "data-testid"?: string;
  }) => <div data-testid={dataTestId ?? "milkdown-editor"}>{content}</div>,
}));

mock.module("~/editor/source-editor", () => ({
  SourceEditor: ({
    content,
    onChange,
    textareaLabel = "Markdown source editor",
  }: {
    content: string;
    onChange: (content: string) => void;
    textareaLabel?: string;
  }) => (
    <div>
      <textarea
        aria-label={textareaLabel}
        value={content}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" onClick={() => onChange(BROKEN_DOCUMENT)}>
        mutate-source
      </button>
    </div>
  ),
}));

mock.module("~/editor/frontmatter-block", () => ({
  FrontmatterBlock: ({
    value,
    diagnostics,
    onChange,
  }: {
    value: string;
    diagnostics?: Array<{ severity: "error" | "warning"; message: string }>;
    onChange?: (value: string) => void;
  }) => (
    <div>
      <pre data-testid="frontmatter-block-value">{value}</pre>
      <div data-testid="frontmatter-block-diagnostics">{diagnostics?.length ?? 0}</div>
      <div data-testid="frontmatter-block-errors">
        {diagnostics
          ?.filter((diagnostic) => diagnostic.severity === "error")
          .map((diagnostic) => diagnostic.message)
          .join("\n") ?? ""}
      </div>
      <button
        type="button"
        onClick={() => onChange?.("title: Broken Draft\npublishDate: not-a-date")}
      >
        mutate-frontmatter
      </button>
    </div>
  ),
}));

const { UniversalEditor } = await import("./universal-editor");

afterEach(() => {
  cleanup();
});

const INITIAL_DOCUMENT = `---
title: React Hooks 深度解析
slug: react-hooks-deep-dive
draft: false
public: true
createdVia: demo
tags:
  - React
  - Hooks
category: frontend
---

# React Hooks 深度解析`;

const BROKEN_DOCUMENT = `---
title: Broken Draft
slug: broken-draft
tags: true
publishDate: not-a-date
---

# Broken Draft`;

describe("UniversalEditor", () => {
  test("keeps the latest source content when switching to WYSIWYG mode", () => {
    const { getByRole, getByTestId, rerender } = render(
      <UniversalEditor initialContent={INITIAL_DOCUMENT} mode="source" />
    );

    fireEvent.click(getByRole("button", { name: "mutate-source" }));

    rerender(<UniversalEditor initialContent={INITIAL_DOCUMENT} mode="wysiwyg" />);

    expect(getByTestId("frontmatter-block-value").textContent).toContain("title: Broken Draft");
    expect(getByTestId("frontmatter-block-value").textContent).toContain("publishDate: not-a-date");
    expect(getByTestId("frontmatter-block-diagnostics").textContent).toBe("2");
    expect(getByTestId("frontmatter-block-errors").textContent).toContain(
      "tags 必须写成数组：\ntags:\n  - React\n  - Hooks"
    );
  });

  test("ref.getContent returns the latest unsynced editor content", () => {
    const editorRef = createRef<{
      getContent: () => string;
      processInlineImages: (content: string) => Promise<string>;
      setContent: (content: string) => void;
    }>();

    const { getByRole } = render(
      <UniversalEditor ref={editorRef} initialContent={INITIAL_DOCUMENT} mode="source" />
    );

    fireEvent.click(getByRole("button", { name: "mutate-source" }));

    expect(editorRef.current?.getContent()).toBe(BROKEN_DOCUMENT);
  });

  test("ref.setContent replaces the current editor document", () => {
    const editorRef = createRef<{
      getContent: () => string;
      processInlineImages: (content: string) => Promise<string>;
      setContent: (content: string) => void;
    }>();

    const { getByTestId } = render(
      <UniversalEditor ref={editorRef} initialContent={INITIAL_DOCUMENT} mode="wysiwyg" />
    );

    act(() => {
      editorRef.current?.setContent(BROKEN_DOCUMENT);
    });

    expect(editorRef.current?.getContent()).toBe(BROKEN_DOCUMENT);
    expect(getByTestId("frontmatter-block-value").textContent).toContain("title: Broken Draft");
  });

  test("frontmatter change updates the latest document content", () => {
    const editorRef = createRef<{
      getContent: () => string;
      processInlineImages: (content: string) => Promise<string>;
      setContent: (content: string) => void;
    }>();

    const { getByRole } = render(
      <UniversalEditor ref={editorRef} initialContent={INITIAL_DOCUMENT} mode="wysiwyg" />
    );

    fireEvent.click(getByRole("button", { name: "mutate-frontmatter" }));

    expect(editorRef.current?.getContent()).toContain("title: Broken Draft");
    expect(editorRef.current?.getContent()).toContain("publishDate: not-a-date");
    expect(editorRef.current?.getContent()).toContain("# React Hooks 深度解析");
  });
});
