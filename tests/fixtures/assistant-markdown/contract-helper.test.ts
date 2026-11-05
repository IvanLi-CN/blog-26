import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  duplicateIds,
  getMessageBody,
  inspectFootnoteReferences,
  messageBodySelector,
} from "../../helpers/assistant-markdown-contract";

// Test the evidence helper with actual upstream footnote DOM, never claim product coverage.
function footnoteDom() {
  return new JSDOM(
    renderToStaticMarkup(
      createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, "正文[^a]。\n\n[^a]: 定义。")
    )
  );
}

describe("assistant Markdown evidence helper (not product acceptance)", () => {
  test("locates exactly one body with arbitrary IDs and excludes source lists", () => {
    const dom = new JSDOM("<main></main>");
    const root = dom.window.document.body;
    const message = dom.window.document.createElement("article");
    const identity = { presentationId: 'panel"\\\n]', messageId: "消息 ]'" };
    message.setAttribute("data-presentation-id", identity.presentationId);
    message.setAttribute("data-message-id", identity.messageId);
    message.innerHTML =
      '<div data-message-body>正文</div><ul aria-label="回答来源"><li>来源</li></ul>';
    root.append(message);
    expect(getMessageBody(root, identity).textContent).toBe("正文");
    expect(getMessageBody(root, identity).querySelector("ul")).toBeNull();
    expect(root.querySelector(messageBodySelector(identity))).toBe(getMessageBody(root, identity));
    root.append(message.cloneNode(true));
    expect(() => getMessageBody(root, identity)).toThrow("found 2");
    expect(() => getMessageBody(root, { ...identity, messageId: "missing" })).toThrow("found 0");
  });

  test("checks real parser reference/definition/backlink and ARIA edges", () => {
    const body = footnoteDom().window.document.body;
    const references = inspectFootnoteReferences(body);
    expect(references).toHaveLength(1);
    expect(references[0]?.backlinkCount).toBe(1);
    body.querySelector("a[data-footnote-backref]")?.remove();
    expect(() => inspectFootnoteReferences(body)).toThrow("no backlink");
  });

  test("rejects cross-message targets instead of finding a definition elsewhere", () => {
    const dom = footnoteDom();
    const body = dom.window.document.body;
    const target = body.querySelector("li[id]");
    if (!target) throw new Error("Expected parser-generated footnote definition");
    target.remove();
    expect(() => inspectFootnoteReferences(body)).toThrow("no unique in-message target");
  });

  test("detects duplicate IDs across independent parser instances", () => {
    const dom = footnoteDom();
    expect(duplicateIds(dom.window.document)).toEqual([]);
    dom.window.document.body.insertAdjacentHTML(
      "beforeend",
      footnoteDom().window.document.body.innerHTML
    );
    expect(duplicateIds(dom.window.document).length).toBeGreaterThan(0);
  });

  test("rejects missing ARIA labels even when the target and backlink exist", () => {
    const body = footnoteDom().window.document.body;
    body.querySelector("a[data-footnote-ref]")?.setAttribute("aria-describedby", "missing-label");
    expect(() => inspectFootnoteReferences(body)).toThrow("out-of-message aria-describedby");
  });
});
