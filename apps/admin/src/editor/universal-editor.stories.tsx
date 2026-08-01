import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, within } from "storybook/test";
import { UniversalEditor } from "./universal-editor";

function StoryHarness({
  initialContent,
  contentKind,
  mode,
}: {
  initialContent: string;
  contentKind: "markdown" | "text";
  mode: "wysiwyg" | "source" | "compare";
}) {
  const [content, setContent] = useState(initialContent);

  return (
    <div className="h-[720px] rounded-[2rem] border border-border/58 bg-card/80 shadow-xl shadow-shadow-soft">
      <UniversalEditor
        initialContent={content}
        onContentChange={setContent}
        contentKind={contentKind}
        articlePath="/Hardware/demo-file.md"
        contentSource="local"
        mode={mode}
        className="h-full"
        editorId={`story-${contentKind}-${mode}`}
      />
    </div>
  );
}

const meta = {
  title: "Admin/Editor/UniversalEditor",
  component: StoryHarness,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "通用编辑器状态画廊，覆盖受管 Markdown 文章模式与纯文本文件模式。",
      },
    },
  },
} satisfies Meta<typeof StoryHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

const markdownSample = `---
title: React Hooks 深度解析
slug: react-hooks-deep-dive
draft: false
public: true
---

# React Hooks 深度解析

- 状态更新必须围绕用户动作组织。
- Effect 只同步外部系统。

> 依赖数组不是优化开关，它描述 Effect 读取到的响应式输入。
`;

const plainTextSample = `title=USB-C Safe5V 诱骗器
mode=5v
cc_pull_down=5.1k
notes=外挂补丁，避免无 CC 设备空载不出电
image_sample=./assets/plain-preview-sample.png
video_sample=./assets/plain-preview-sample.mp4
markdown_image=![sample image](./assets/plain-preview-sample.png)
html_video=<video controls src="./assets/plain-preview-sample.mp4"></video>
markdown_link=[sample video](./assets/plain-preview-sample.mp4)
`;

export const MarkdownCompare: Story = {
  args: {
    initialContent: markdownSample,
    contentKind: "markdown",
    mode: "compare",
  },
};

export const MarkdownBlockquote: Story = {
  args: {
    initialContent: markdownSample,
    contentKind: "markdown",
    mode: "wysiwyg",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const quoteText = await canvas.findByText(
      "依赖数组不是优化开关，它描述 Effect 读取到的响应式输入。"
    );
    const blockquote = quoteText.closest("blockquote");

    await expect(blockquote).not.toBeNull();
    if (!blockquote) return;

    await expect(getComputedStyle(blockquote).boxSizing).toBe("border-box");
    await expect(getComputedStyle(blockquote, "::before").content).toContain("“");
  },
};

export const PlainTextSourceOnly: Story = {
  args: {
    initialContent: plainTextSample,
    contentKind: "text",
    mode: "source",
  },
};
