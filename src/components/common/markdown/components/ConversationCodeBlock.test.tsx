import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { unified } from "unified";
import { codeCases } from "../../../../../tests/fixtures/assistant-markdown";
import { ConversationCodeBlock } from "./ConversationCodeBlock";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
afterEach(cleanup);

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
}

describe("ConversationCodeBlock source boundary", () => {
  for (const entry of codeCases) {
    test(`renders ${entry.id} as a block with its exact AST source`, () => {
      const { container } = render(
        <ConversationCodeBlock source={entry.source} language={entry.language} />
      );
      const code = container.querySelector("pre > code");
      expect(code).not.toBeNull();
      expect(code?.textContent).toBe(entry.source);
      if (entry.language) expect(code?.classList.contains(`language-${entry.language}`)).toBe(true);
    });
  }

  test("highlights supported languages without interpreting code HTML", () => {
    const source = '<script>alert("$5 \\\\alpha")</script><img src=x onerror=alert(1)>';
    const { container } = render(<ConversationCodeBlock source={source} language="html" />);
    expect(container.querySelector("code span")).not.toBeNull();
    expect(container.querySelector("code")?.textContent).toBe(source);
    expect(container.querySelector("script, img, iframe")).toBeNull();
  });

  test("keeps readable source when the highlighter throws", () => {
    const processor = Object.getPrototypeOf(unified());
    const failure = spyOn(processor, "runSync").mockImplementation(() => {
      throw new Error("Highlight failure");
    });
    try {
      const source = '<img onerror="throw 1">\n$5 \\alpha\n';
      const { container } = render(<ConversationCodeBlock source={source} language="html" />);
      expect(container.querySelector("code")?.textContent).toBe(source);
      expect(container.querySelector("img")).toBeNull();
    } finally {
      failure.mockRestore();
    }
  });
});

describe("ConversationCodeBlock actions", () => {
  for (const entry of codeCases) {
    test(`copies exact ${entry.id} source even when collapsed`, async () => {
      const writeText = mock(async (_text: string) => undefined);
      mockClipboard(writeText);
      const { getByRole } = render(
        <ConversationCodeBlock source={entry.source} language={entry.language} />
      );
      fireEvent.click(getByRole("button", { name: "折叠代码" }));
      fireEvent.click(getByRole("button", { name: "复制代码" }));
      await waitFor(() => expect(getByRole("status").textContent).toBe("代码已复制"));
      expect(writeText).toHaveBeenCalledWith(entry.source);
      expect(writeText).toHaveBeenCalledTimes(1);
    });
  }

  test("preserves blank lines, dollars, backslashes, tabs and trailing whitespace", async () => {
    const source = '\n\n\tconst price = "$5";  \n\\alpha \\*literal\\*\n\n';
    const writeText = mock(async (_text: string) => undefined);
    mockClipboard(writeText);
    const { getByRole } = render(<ConversationCodeBlock source={source} language="javascript" />);
    fireEvent.click(getByRole("button", { name: "复制代码" }));
    await waitFor(() => expect(getByRole("status").textContent).toBe("代码已复制"));
    expect(writeText.mock.calls[0]?.[0]).toBe(source);
  });

  test("announces clipboard rejection and allows retry", async () => {
    const writeText = mock(async (_text: string): Promise<void> => {
      throw new Error("Permission denied");
    });
    mockClipboard(writeText);
    const { getByRole } = render(<ConversationCodeBlock source="example" />);
    fireEvent.click(getByRole("button", { name: "复制代码" }));
    await waitFor(() => expect(getByRole("status").textContent).toContain("复制失败"));
    expect(getByRole("status").textContent).not.toContain("已复制");
    writeText.mockImplementation(async (_text: string) => undefined);
    fireEvent.click(getByRole("button", { name: "复制代码" }));
    await waitFor(() => expect(getByRole("status").textContent).toBe("代码已复制"));
  });

  test("reports an unavailable clipboard as failure", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const { getByRole } = render(<ConversationCodeBlock source="example" />);
    fireEvent.click(getByRole("button", { name: "复制代码" }));
    await waitFor(() => expect(getByRole("status").textContent).toContain("复制失败"));
  });

  test("starts expanded and retains user choice across streaming growth and shrinkage", () => {
    const long = codeCases.find((entry) => entry.id === "long")?.source ?? "";
    const { getByRole, rerender, container } = render(<ConversationCodeBlock source="first" />);
    const pre = () => container.querySelector("pre");
    expect(pre()?.hidden).toBe(false);
    rerender(<ConversationCodeBlock source={long} />);
    expect(pre()?.hidden).toBe(false);
    fireEvent.click(getByRole("button", { name: "折叠代码" }));
    expect(pre()?.hidden).toBe(true);
    const expand = getByRole("button", { name: "展开代码" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    expect(expand.getAttribute("aria-controls")).toBe(pre()?.id ?? "");
    rerender(<ConversationCodeBlock source="" />);
    expect(pre()?.hidden).toBe(true);
    rerender(<ConversationCodeBlock source={`${long}\nnext`} />);
    expect(pre()?.hidden).toBe(true);
    fireEvent.click(getByRole("button", { name: "展开代码" }));
    rerender(<ConversationCodeBlock source={`${long}\nnext\nlast`} />);
    expect(pre()?.hidden).toBe(false);
  });

  test("does not announce an old copy result for a newer source", async () => {
    let resolveCopy: (() => void) | undefined;
    mockClipboard(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve;
        })
    );
    const { getByRole, rerender } = render(<ConversationCodeBlock source="old" />);
    fireEvent.click(getByRole("button", { name: "复制代码" }));
    expect(getByRole("button", { name: "正在复制" }).hasAttribute("disabled")).toBe(true);
    rerender(<ConversationCodeBlock source="new" />);
    await act(async () => resolveCopy?.());
    expect(getByRole("status").textContent).toBe("");
  });
});
