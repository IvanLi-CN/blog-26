import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, within } from "storybook/test";
import { stripMatchingLeadingTitleHeading } from "@/lib/markdown-utils";
import {
  buildMemoPreviewMeta,
  buildPostPreviewMeta,
  buildPreviewHero,
  PreviewArticleShell,
} from "./preview-detail";

const demoHero = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1b3143" />
        <stop offset="55%" stop-color="#28577a" />
        <stop offset="100%" stop-color="#8cc3dc" />
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)" />
    <circle cx="1170" cy="250" r="190" fill="rgba(255,255,255,0.16)" />
    <circle cx="420" cy="700" r="210" fill="rgba(214,243,255,0.12)" />
    <rect x="210" y="260" width="500" height="320" rx="36" fill="rgba(12,27,38,0.5)" stroke="rgba(255,255,255,0.22)" />
    <text x="260" y="360" fill="#eaf7ff" font-size="66" font-family="Inter, Arial, sans-serif" font-weight="700">USB-C Safe5V</text>
    <text x="260" y="435" fill="#d4edf8" font-size="42" font-family="Inter, Arial, sans-serif">Admin preview hero evidence</text>
    <rect x="260" y="485" width="240" height="18" rx="9" fill="rgba(255,255,255,0.42)" />
    <rect x="260" y="522" width="180" height="18" rx="9" fill="rgba(255,255,255,0.24)" />
  </svg>
`)}`;

const sharedPostBody = `
# USB-C Safe5V 诱骗器

这是一段用于预览详情节奏的示例正文。

- 保持后台 Soft UI 的容器语言
- 借用公开页的信息排序
- 不渲染评论与相关推荐

\`\`\`ts
const previewSurface = "admin";
const padding = { desktop: "10px 12px", mobile: "12px" };
\`\`\`
`;

const sharedMemoBody = `
# Memo 预览不显示 excerpt

正文段落，用来验证 memo 详情壳会折掉正文开头的重复标题。
`;

const meta = {
  title: "Admin/Preview Detail",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Admin preview detail surface that keeps Soft UI styling while following public detail information rhythm for posts and memos.",
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.parameters.adminTheme === "dark" ? "dark" : "light";

      useEffect(() => {
        document.documentElement.dataset.uiTheme = theme;
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.uiPreference = "system";
        document.documentElement.style.colorScheme = theme;
        document.documentElement.classList.toggle("dark", theme === "dark");

        return () => {
          document.documentElement.dataset.uiTheme = "light";
          document.documentElement.dataset.theme = "light";
          document.documentElement.dataset.uiPreference = "system";
          document.documentElement.style.colorScheme = "light";
          document.documentElement.classList.remove("dark");
        };
      }, [theme]);

      return (
        <div className="min-h-screen bg-background p-6 text-foreground" data-ui-theme={theme}>
          <div className="mx-auto max-w-[1100px]">
            <Story />
          </div>
        </div>
      );
    },
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const PostDetailRhythm: Story = {
  name: "文章详情节奏",
  render: () => (
    <PreviewArticleShell
      modeLabel="公开文章预览"
      title="USB-C Safe5V 诱骗器"
      description="预览页在后台 Soft UI 中借用公开文章的标题、摘要、标签、主图与正文节奏。"
      tags={["usb-c", "hardware", "admin-preview"]}
      meta={buildPostPreviewMeta({
        publishDate: "2026-06-19T10:00:00.000Z",
        updateDate: "2026-06-19T11:30:00.000Z",
        author: "Ivan",
        category: "hardware",
        body: sharedPostBody,
      })}
      hero={buildPreviewHero(demoHero, "USB-C Safe5V 诱骗器")}
      bodyTestId="storybook-admin-preview-post-body"
      body={sharedPostBody}
      articlePath="blog/usb-c-safe5v.md"
      publicMediaContext={{
        kind: "post",
        slug: "usb-c-safe5v",
        filePath: "blog/usb-c-safe5v.md",
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByAltText("USB-C Safe5V 诱骗器")).toBeVisible();
    await expect(
      canvas.getByText("预览页在后台 Soft UI 中借用公开文章的标题、摘要、标签、主图与正文节奏。")
    ).toBeVisible();
  },
};

export const MemoDetailRhythm: Story = {
  name: "Memo 详情节奏",
  render: () => (
    <PreviewArticleShell
      modeLabel="公开 Memo 预览"
      title="Memo 预览不显示 excerpt"
      tags={["memo", "preview"]}
      meta={buildMemoPreviewMeta({
        createdAt: "2026-06-19T08:00:00.000Z",
        updatedAt: "2026-06-19T10:15:00.000Z",
        isPublic: true,
      })}
      bodyTestId="storybook-admin-preview-memo-body"
      body={stripMatchingLeadingTitleHeading(sharedMemoBody, "Memo 预览不显示 excerpt")}
      articlePath="Memos/demo.md"
      publicMediaContext={{
        kind: "memo",
        slug: "memo-preview-demo",
        filePath: "Memos/demo.md",
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId("admin-preview-hero")).toBeNull();
    await expect(canvas.queryByTestId("admin-preview-description")).toBeNull();
    expect(canvas.getAllByRole("heading", { name: "Memo 预览不显示 excerpt" })).toHaveLength(1);
  },
};

export const DarkCodeSurface: Story = {
  name: "深色代码表面",
  parameters: {
    adminTheme: "dark",
    backgrounds: { default: "admin dark" },
  },
  render: () => (
    <PreviewArticleShell
      modeLabel="后台预览"
      title="代码表面密度"
      tags={["admin", "code"]}
      meta={buildPostPreviewMeta({
        publishDate: "2026-06-19T10:00:00.000Z",
        author: "Ivan",
        category: "frontend",
        body: sharedPostBody,
      })}
      bodyTestId="storybook-admin-preview-code-body"
      body={sharedPostBody}
      articlePath="blog/code-surface.md"
      publicMediaContext={{
        kind: "post",
        slug: "code-surface",
        filePath: "blog/code-surface.md",
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const codeBlock = canvasElement.querySelector('[data-markdown-surface="admin"] pre');
    await expect(codeBlock).not.toBeNull();
    await expect(codeBlock?.querySelector(".hljs")).not.toBeNull();
  },
};
