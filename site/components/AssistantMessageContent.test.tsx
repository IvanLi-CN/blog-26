import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  AssistantMessageContentProps,
  ConversationMarkdownProps,
} from "../../src/components/common/conversation/types";
import {
  dualRoleMessages,
  incrementalSequences,
  maliciousHtml,
} from "../../tests/fixtures/assistant-markdown";
import { getMessageBody } from "../../tests/helpers/assistant-markdown-contract";
import { AssistantMessageContent } from "./AssistantMessageContent";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
afterEach(() => {
  cleanup();
  mock.restore();
});

function PlainRenderer({ content }: ConversationMarkdownProps) {
  return <span>{content}</span>;
}

const base: AssistantMessageContentProps = {
  messageId: "message-a",
  presentationId: "page",
  role: "assistant",
  status: "streaming",
  content: "received",
  renderMarkdown: PlainRenderer,
};

describe("AssistantMessageContent role routing", () => {
  test("dual-role fixture sends only the assistant source and identities to a component slot", () => {
    const calls: ConversationMarkdownProps[] = [];
    const resourceContext = { resolveAuthorizedImage: () => null };
    function Renderer(props: ConversationMarkdownProps) {
      calls.push(props);
      return <ReactMarkdown remarkPlugins={[remarkGfm]}>{props.content}</ReactMarkdown>;
    }
    const view = render(
      dualRoleMessages.map((message) => (
        <AssistantMessageContent
          key={message.messageId}
          {...message}
          resourceContext={resourceContext}
          renderMarkdown={Renderer}
        />
      ))
    );
    const user = getMessageBody(view.container, dualRoleMessages[0]);
    const assistant = getMessageBody(view.container, dualRoleMessages[1]);
    expect(user.textContent).toBe(dualRoleMessages[0].content);
    expect(user.querySelector("h1,strong,ul,a,code")).toBeNull();
    expect(user.style.whiteSpace).toBe("pre-wrap");
    expect(user.style.overflowWrap).toBe("anywhere");
    expect(assistant.querySelector("h1")?.textContent).toBe("阅读合同");
    expect(assistant.querySelector("strong")?.textContent).toBe("粗体");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      content: dualRoleMessages[1].content,
      messageId: dualRoleMessages[1].messageId,
      presentationId: dualRoleMessages[1].presentationId,
      resourceContext,
    });
  });

  test("user HTML and Markdown remain literal, including newlines and long words", () => {
    const renderer = mock(PlainRenderer);
    const content = `${maliciousHtml.message.content}\n**literal**\n${"long".repeat(150)}`;
    const view = render(
      <AssistantMessageContent
        {...{ ...base, role: "user" as const }}
        content={content}
        renderMarkdown={renderer}
      />
    );
    const body = getMessageBody(view.container, base);
    expect(body.textContent).toBe(content);
    expect(body.querySelector("script,img,iframe,video,b,strong,a")).toBeNull();
    expect(renderer).not.toHaveBeenCalled();
  });

  test("renders a hook component normally and preserves its state across snapshots", () => {
    function HookRenderer({ content }: ConversationMarkdownProps) {
      const [expanded, setExpanded] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setExpanded((value) => !value)}>
            Toggle
          </button>
          <span>{expanded ? "expanded" : "collapsed"}</span>
          <p>{content}</p>
        </>
      );
    }
    const view = render(<AssistantMessageContent {...base} renderMarkdown={HookRenderer} />);
    fireEvent.click(view.getByRole("button"));
    view.rerender(
      <AssistantMessageContent
        {...base}
        content="latest snapshot"
        status="completed"
        renderMarkdown={HookRenderer}
      />
    );
    expect(view.getByText("expanded")).toBeTruthy();
    expect(view.getByText("latest snapshot")).toBeTruthy();
  });

  test("skips identical props without caching changed snapshots or status", () => {
    const renderer = mock(PlainRenderer);
    const props = { ...base, renderMarkdown: renderer };
    const view = render(<AssistantMessageContent {...props} />);
    view.rerender(<AssistantMessageContent {...props} />);
    expect(renderer).toHaveBeenCalledTimes(1);
    view.rerender(<AssistantMessageContent {...props} content="new source" status="completed" />);
    expect(renderer).toHaveBeenCalledTimes(2);
    expect(getMessageBody(view.container, base).textContent).toBe("new source");
    expect(view.container.firstElementChild?.getAttribute("aria-busy")).toBe("false");
  });
});

describe("full-snapshot and terminal updates", () => {
  test("passes unfinished links unchanged, then exposes the completed link through the parser slot", () => {
    const sequence = incrementalSequences.find((item) => item.id === "partial-link");
    if (!sequence) throw new Error("Missing link sequence");
    const calls: string[] = [];
    function ParserSlot({ content }: ConversationMarkdownProps) {
      calls.push(content);
      return <ReactMarkdown>{content}</ReactMarkdown>;
    }
    const view = render(
      <AssistantMessageContent {...sequence.snapshots[0]} renderMarkdown={ParserSlot} />
    );
    const partial = sequence.snapshots[1];
    view.rerender(<AssistantMessageContent {...partial} renderMarkdown={ParserSlot} />);
    expect(getMessageBody(view.container, partial).textContent).toBe(partial.content);
    expect(getMessageBody(view.container, partial).querySelector("a")).toBeNull();
    const final = sequence.snapshots[2];
    view.rerender(<AssistantMessageContent {...final} renderMarkdown={ParserSlot} />);
    const link = getMessageBody(view.container, final).querySelector("a");
    expect(link?.textContent).toBe("目标");
    expect(link?.getAttribute("href")).toBe("https://example.invalid/path");
    expect(calls).toEqual(sequence.snapshots.map((snapshot) => snapshot.content));
  });

  for (const sequence of incrementalSequences) {
    test(`${sequence.id}: preserves every snapshot and matches a fresh terminal render`, async () => {
      const view = render(
        <AssistantMessageContent {...sequence.snapshots[0]} renderMarkdown={PlainRenderer} />
      );
      const root = view.container.firstElementChild;
      for (const snapshot of sequence.snapshots) {
        view.rerender(<AssistantMessageContent {...snapshot} renderMarkdown={PlainRenderer} />);
        expect(getMessageBody(view.container, snapshot).textContent).toBe(snapshot.content);
        expect(view.container.firstElementChild).toBe(root);
        expect(root?.getAttribute("data-message-id")).toBe(snapshot.messageId);
        expect(root?.getAttribute("data-presentation-id")).toBe(snapshot.presentationId);
        expect(root?.getAttribute("data-message-status")).toBe(snapshot.status);
      }
      const final = sequence.snapshots.at(-1);
      if (!final) throw new Error("Missing final fixture snapshot");
      const fresh = render(<AssistantMessageContent {...final} renderMarkdown={PlainRenderer} />);
      expect(getMessageBody(view.container, final).innerHTML).toBe(
        getMessageBody(fresh.container, final).innerHTML
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(getMessageBody(view.container, final).textContent).toBe(final.content);
      expect(root?.getAttribute("aria-busy")).toBe("false");
    });
  }

  test("snapshot updates, terminal transitions and unmount never resend or stop generation", () => {
    const fetch = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        () => {
          throw new Error("Unexpected transport call");
        },
        { preconnect: () => undefined }
      )
    );
    const resend = mock(() => undefined);
    const stop = mock(() => undefined);
    const view = render(
      <div>
        <AssistantMessageContent {...base} />
        <button type="button" onClick={resend}>
          Resend
        </button>
        <button type="button" onClick={stop}>
          Stop
        </button>
      </div>
    );
    for (const sequence of incrementalSequences) {
      for (const snapshot of sequence.snapshots) {
        view.rerender(
          <div>
            <AssistantMessageContent {...snapshot} renderMarkdown={PlainRenderer} />
            <button type="button" onClick={resend}>
              Resend
            </button>
            <button type="button" onClick={stop}>
              Stop
            </button>
          </div>
        );
      }
    }
    view.unmount();
    expect(fetch).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
});

describe("per-message rendering failure", () => {
  function ThrowingRenderer(): never {
    throw new Error("Injected renderer failure");
  }

  test("keeps raw body, neighbors, input and explicit actions accessible; no automatic actions", () => {
    spyOn(console, "error").mockImplementation(() => undefined);
    const send = mock(() => undefined);
    const stop = mock(() => undefined);
    const retry = mock(() => undefined);
    const content = "**raw**\n[unfinished](https://example.invalid\n<script>literal</script>";
    const sibling = { ...base, messageId: "message-b", content: "Neighbor is readable" };
    const view = render(
      <div>
        <AssistantMessageContent {...base} content={content} renderMarkdown={ThrowingRenderer} />
        <AssistantMessageContent {...sibling} />
        <ul data-sources>
          <li>System source</li>
        </ul>
        <input aria-label="Message" />
        <button type="button" onClick={send}>
          Send
        </button>
        <button type="button" onClick={stop}>
          Stop
        </button>
        <button type="button" onClick={retry}>
          Retry
        </button>
      </div>
    );
    const body = getMessageBody(view.container, base);
    expect(body.textContent).toBe(content);
    expect(body.querySelector("script,a,strong,ul")).toBeNull();
    expect(body.contains(view.getByRole("status"))).toBe(false);
    expect(body.contains(view.container.querySelector("[data-sources]"))).toBe(false);
    expect(getMessageBody(view.container, sibling).textContent).toBe(sibling.content);
    expect(send).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
    fireEvent.change(view.getByRole("textbox"), { target: { value: "still writable" } });
    expect((view.getByRole("textbox") as HTMLInputElement).value).toBe("still writable");
    for (const label of ["Send", "Stop", "Retry"])
      fireEvent.click(view.getByRole("button", { name: label }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  for (const changed of [
    "content",
    "messageId",
    "presentationId",
    "renderMarkdown",
    "status",
  ] as const) {
    test(`recovers on new ${changed} without an extra request`, () => {
      spyOn(console, "error").mockImplementation(() => undefined);
      let broken = true;
      function RecoverableRenderer(props: ConversationMarkdownProps) {
        if (broken) throw new Error("Injected failure");
        return <em>{props.content}</em>;
      }
      const props = { ...base, renderMarkdown: RecoverableRenderer };
      const view = render(<AssistantMessageContent {...props} />);
      expect(getMessageBody(view.container, props).textContent).toBe(props.content);
      broken = false;
      const next = { ...props };
      if (changed === "renderMarkdown") next.renderMarkdown = PlainRenderer;
      else if (changed === "status") next.status = "completed";
      else next[changed] = `new-${changed}`;
      view.rerender(<AssistantMessageContent {...next} />);
      expect(view.queryByRole("status")).toBeNull();
      expect(getMessageBody(view.container, next).textContent).toBe(next.content);
      expect(
        getMessageBody(view.container, next).querySelector(
          changed === "renderMarkdown" ? "span" : "em"
        )
      ).toBeTruthy();
    });
  }

  test("repeated failures still show the latest completed/failed/cancelled original", () => {
    spyOn(console, "error").mockImplementation(() => undefined);
    const view = render(<AssistantMessageContent {...base} renderMarkdown={ThrowingRenderer} />);
    for (const status of ["completed", "failed", "cancelled"] as const) {
      const next = { ...base, content: `latest ${status}\n$unfinished_`, status };
      view.rerender(<AssistantMessageContent {...next} renderMarkdown={ThrowingRenderer} />);
      expect(getMessageBody(view.container, next).textContent).toBe(next.content);
      expect(view.container.firstElementChild?.getAttribute("data-message-status")).toBe(status);
      expect(view.container.firstElementChild?.getAttribute("aria-busy")).toBe("false");
      expect(view.getAllByRole("status")).toHaveLength(1);
    }
  });
});
