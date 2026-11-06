import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AssistantMessageContent } from "../../../site/components/AssistantMessageContent";
import type {
  ConversationMarkdownProps,
  ConversationMessage,
  ConversationMessageStatus,
} from "./conversation/types";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

const brokenContent = "渲染异常样本：**原文依然可读**\n[尚未闭合](https://example.invalid";

/** Deliberately plain and deterministic; production Markdown policy belongs to the renderer task. */
function PreviewRenderer({ content }: ConversationMarkdownProps) {
  if (content === brokenContent) throw new Error("Controlled message rendering failure");
  return <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{content}</div>;
}

const labels: Record<ConversationMessageStatus, string> = {
  pending: "等待生成",
  streaming: "生成中",
  completed: "已完成",
  failed: "生成失败",
  cancelled: "已停止",
};
const messages: ConversationMessage[] = [
  {
    messageId: "user",
    presentationId: "story",
    role: "user",
    content:
      "**保留字面字符**\n<b>不是 HTML</b>\nVeryLongWordWithoutSpacesToVerifySafeWrappingOnNarrowScreens",
    status: "completed",
  },
  {
    messageId: "pending",
    presentationId: "story",
    role: "assistant",
    content: "",
    status: "pending",
  },
  {
    messageId: "streaming",
    presentationId: "story",
    role: "assistant",
    content: "已收到部分回答。\n```c++\nint value",
    status: "streaming",
  },
  {
    messageId: "completed",
    presentationId: "story",
    role: "assistant",
    content: "回答已经完整收到。\n**格式由注入组件负责**",
    status: "completed",
  },
  {
    messageId: "failed",
    presentationId: "story",
    role: "assistant",
    content: "生成失败前收到的正文仍然保留。",
    status: "failed",
  },
  {
    messageId: "cancelled",
    presentationId: "story",
    role: "assistant",
    content: "停止前收到的正文。\n[未闭合](https://example.invalid",
    status: "cancelled",
  },
  {
    messageId: "fallback",
    presentationId: "story",
    role: "assistant",
    content: brokenContent,
    status: "failed",
  },
];

function MessageState({ message }: { message: ConversationMessage }) {
  return (
    <section className="min-w-0 space-y-2">
      <h3 className="text-sm font-semibold">
        {message.role === "user" ? "用户" : "助手"} · {labels[message.status]}
        {message.messageId === "fallback" ? " · 原文回退" : ""}
      </h3>
      <AssistantMessageContent {...message} renderMarkdown={PreviewRenderer} />
    </section>
  );
}

const steps: Pick<ConversationMessage, "content" | "status">[] = [
  { content: "", status: "pending" },
  { content: "已收到 [未闭合](https://example.invalid", status: "streaming" },
  { content: brokenContent, status: "failed" },
  { content: "恢复后的最新完整正文，未丢字。", status: "completed" },
];

function SnapshotSequence() {
  const [index, setIndex] = useState(0);
  const message: ConversationMessage = {
    messageId: "sequence",
    presentationId: "story",
    role: "assistant",
    ...steps[index],
  };
  return (
    <div className="space-y-4">
      <MessageState message={message} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="nature-button min-h-11 px-3 text-sm"
          disabled={index === steps.length - 1}
          onClick={() => setIndex((value) => value + 1)}
        >
          下一快照
        </button>
        <button
          type="button"
          className="nature-button min-h-11 px-3 text-sm"
          onClick={() => setIndex(0)}
        >
          重置快照
        </button>
      </div>
    </div>
  );
}

function ConversationStatesSurface({
  dark = false,
  interactive = false,
}: {
  dark?: boolean;
  interactive?: boolean;
}) {
  useEffect(() => {
    document.documentElement.dataset.uiTheme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.dataset.theme = "light";
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    };
  }, [dark]);
  return (
    <div
      data-visual-evidence-surface
      style={{
        padding: 48,
        background: "var(--nature-bg)",
        color: "var(--nature-text)",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div data-visual-evidence-target className="space-y-6 text-sm leading-6">
        {interactive ? (
          <SnapshotSequence />
        ) : (
          <div className="grid min-w-0 gap-6 md:grid-cols-2">
            {messages.map((message) => (
              <MessageState key={message.messageId} message={message} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const meta = {
  title: "Public/Conversation Message States",
  component: ConversationStatesSurface,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    docs: {
      description: {
        component:
          "消息正文边界的状态概览。助手使用可控纯文本组件插槽，展示角色分流、完整快照、生成状态与单消息原文回退；Markdown 格式验收由专用渲染器承担。来源与生成操作由外层持有。",
      },
    },
  },
} satisfies Meta<typeof ConversationStatesSurface>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const Dark: Story = { args: { dark: true } };
export const Mobile: Story = { globals: { viewport: { value: "memo393", isRotated: false } } };
export const Narrow: Story = {
  parameters: {
    viewport: {
      options: {
        conversation320: {
          name: "Conversation 320 × 800",
          styles: { width: "320px", height: "800px" },
          type: "mobile",
        },
      },
    },
  },
  globals: { viewport: { value: "conversation320", isRotated: false } },
};
export const SnapshotsAndRecovery: Story = {
  args: { interactive: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = () =>
      canvasElement.querySelector('[data-message-id="sequence"] [data-message-body]');
    const root = canvasElement.querySelector('[data-message-id="sequence"]');
    expect(body()?.textContent).toBe("");
    await userEvent.click(canvas.getByRole("button", { name: "下一快照" }));
    await waitFor(() => expect(body()?.textContent).toBe(steps[1].content));
    expect(body()?.querySelector("a")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "下一快照" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("内容显示失败"));
    expect(body()?.textContent).toBe(brokenContent);
    expect(body()?.contains(canvas.getByRole("status"))).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: "下一快照" }));
    await waitFor(() => expect(body()?.textContent).toBe(steps[3].content));
    expect(canvas.queryByRole("status")).toBeNull();
    expect(canvasElement.querySelector('[data-message-id="sequence"]')).toBe(root);
    expect(root).toHaveAttribute("data-message-status", "completed");
    await userEvent.click(canvas.getByRole("button", { name: "重置快照" }));
    await waitFor(() => expect(body()?.textContent).toBe(""));
    expect(root).toHaveAttribute("data-message-status", "pending");
  },
};
