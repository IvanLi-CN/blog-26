import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantMessageContent } from "../../../site/components/AssistantMessageContent";
import {
  codeCases,
  completeMarkdown,
  escapingAndCurrency,
  footnoteInstances,
  maliciousHtml,
} from "../../../tests/fixtures/assistant-markdown";
import {
  duplicateIds,
  getMessageBody,
  inspectFootnoteReferences,
} from "../../../tests/helpers/assistant-markdown-contract";
import { ConversationMarkdown } from "./ConversationMarkdown";

if (!GlobalRegistrator.isRegistered)
  GlobalRegistrator.register({ url: "https://chat.example.invalid/" });
afterEach(cleanup);

function renderMessage(message = completeMarkdown.message) {
  return render(
    <div data-message-id={message.messageId} data-presentation-id={message.presentationId}>
      <div data-message-body>
        <ConversationMarkdown {...message} />
      </div>
    </div>
  );
}

describe("ConversationMarkdown", () => {
  test("composes with AssistantMessageContent without duplicating the message boundary", () => {
    const message = { ...completeMarkdown.message, status: "completed" as const };
    const view = render(
      <AssistantMessageContent {...message} renderMarkdown={ConversationMarkdown} />
    );
    const body = getMessageBody(view.container, message);
    expect(body.querySelector("h1")?.textContent).toBe("阅读合同");
    expect(view.container.querySelectorAll("[data-message-body]")).toHaveLength(1);
    expect(
      view.container.querySelectorAll(`[data-message-id="${message.messageId}"]`)
    ).toHaveLength(1);
    expect(
      view.container.querySelectorAll(`[data-presentation-id="${message.presentationId}"]`)
    ).toHaveLength(1);
  });

  test("keeps raw HTML literal and renders the standard GFM contract", () => {
    const view = renderMessage();
    const body = getMessageBody(view.container, completeMarkdown.message);
    expect(body.querySelector("h1")?.textContent).toBe("阅读合同");
    expect(body.querySelector("ol")?.getAttribute("start")).toBe("7");
    expect(body.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(
      [...body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(
        (input) => input.disabled
      )
    ).toBe(true);
    expect(body.querySelector('a[title="合同标题"]')).not.toBeNull();
    expect(body.textContent).toContain("[3]");
    expect(body.querySelector("table")?.querySelector("td")?.className).toContain(
      "whitespace-normal"
    );

    const malicious = renderMessage(maliciousHtml.message);
    const maliciousBody = getMessageBody(malicious.container, maliciousHtml.message);
    expect(maliciousBody.querySelector("script, b, iframe, video, img")).toBeNull();
    expect(maliciousBody.textContent).toContain("<script>globalThis.__amrExecuted = true</script>");
    expect(maliciousBody.textContent).toContain('<b data-untrusted="true">不是粗体 DOM</b>');
  });

  test("namespaces each footnote graph by message and presentation", () => {
    const view = render(
      footnoteInstances.map((message) => (
        <div
          key={`${message.presentationId}-${message.messageId}`}
          data-message-id={message.messageId}
          data-presentation-id={message.presentationId}
        >
          <div data-message-body>
            <ConversationMarkdown {...message} />
          </div>
        </div>
      ))
    );
    expect(duplicateIds(view.container)).toEqual([]);
    for (const message of footnoteInstances) {
      const body = getMessageBody(view.container, message);
      expect(inspectFootnoteReferences(body)).toHaveLength(1);
    }
  });

  test("uses AST block identity and exact source for every code fixture", () => {
    for (const entry of codeCases) {
      const message = {
        ...completeMarkdown.message,
        messageId: `code-${entry.id}`,
        content: entry.content,
      };
      const html = renderToStaticMarkup(<ConversationMarkdown {...message} />);
      const view = renderMessage(message);
      const body = getMessageBody(view.container, message);
      const code = body.querySelector("pre > code");
      expect(code).not.toBeNull();
      expect(code?.textContent).toBe(entry.source);
      expect(html).toContain("复制代码");
      if (entry.language) expect(code?.className).toContain(`language-${entry.language}`);
    }
  });

  test("renders math locally and preserves escaped dollars and incomplete links", () => {
    const view = renderMessage(escapingAndCurrency.message);
    const body = getMessageBody(view.container, escapingAndCurrency.message);
    expect(body.querySelectorAll(".katex").length).toBeGreaterThan(0);
    expect(body.textContent).toContain("价格 $5 与 $10");
    expect(body.textContent).toContain("旧 TeX 分隔符 (x) 与 [y]");

    const partial = {
      ...escapingAndCurrency.message,
      messageId: "partial",
      content: "[x](https://exa",
    };
    const partialView = renderMessage(partial);
    const partialBody = getMessageBody(partialView.container, partial);
    expect(partialBody.querySelector("a")).toBeNull();
    expect(partialBody.textContent).toContain("[x](https://exa");
  });
});
