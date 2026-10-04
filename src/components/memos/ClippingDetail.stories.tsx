import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { PublicStoryHeader } from "@/components/common/PublicStoryHeader";
import { PreviewArticleShell } from "../../../apps/admin/src/components/preview-detail";
import {
  type ClippingArticle,
  type ClippingChat,
  ClippingDetail,
  type ClippingTransport,
} from "./ClippingDetail";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

const reading = {
  targetUrl: "https://earendil.com/posts/pi-durable/",
  sourceUrl: "https://earendil.com/posts/pi-durable/",
  versionId: "11111111-1111-4111-8111-111111111111",
  status: "completed" as const,
  summaryState: "completed" as const,
  translationState: "completed" as const,
  sourceTranslationState: "completed" as const,
  translatedSegments: 2,
  segmentCount: 2,
  error: null,
  warning: null,
  usingPreviousVersion: false,
};
const article: ClippingArticle = {
  reading,
  title: "Pi Durable：可恢复的 Agent 工作流",
  content:
    "作者备注：关注持久执行与恢复。\n\n---\n\n**Agent 摘要**\n\n文章介绍如何在中断后继续工作。",
  source:
    "# Durable agents\n\nProgress is saved.\n\n| State | Value |\n| --- | --- |\n| Ready | yes |\n\n```ts\nawait resume();\n```",
  translation:
    "# 持久 Agent\n\n进度会被保存。\n\n| 状态 | 值 |\n| --- | --- |\n| 就绪 | 是 |\n\n```ts\nawait resume();\n```",
  canDiscuss: true,
};
function FixturePage({
  initialArticle,
  initialCanDiscuss,
  theme = "light",
  ...props
}: Parameters<typeof ClippingDetail>[0] & { theme?: "light" | "dark" }) {
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.uiTheme = theme;
    html.dataset.theme = theme;
    html.style.colorScheme = theme;
    html.classList.toggle("dark", theme === "dark");
    return () => {
      html.classList.remove("dark");
      html.dataset.uiTheme = "light";
      html.dataset.theme = "light";
      html.style.colorScheme = "light";
    };
  }, [theme]);
  const transport = useMemo<ClippingTransport>(() => {
    const chat: ClippingChat = {
      messages: [
        { id: "1", role: "user", text: "持久执行解决了什么问题？", timestamp: 0 },
        {
          id: "2",
          role: "assistant",
          text: "依据 [原文段落 2]，已提交的进度可以恢复。推断：它有助于减少中断后的重复工作。",
          timestamp: 1,
        },
      ],
      generating: false,
      partial: "",
    };
    return {
      request: async <T,>(operation: string, body?: unknown) => {
        if (!initialCanDiscuss && operation.startsWith("chat"))
          throw new Error("Visitor must not request private conversations");
        if (operation === "history")
          return {
            versions: [
              {
                id: reading.versionId,
                targetUrl: reading.targetUrl,
                createdAt: 1791158400000,
                status: "completed",
                summaryState: "completed",
                translationState: "completed",
                error: null,
                warning: null,
              },
            ],
            currentVersionId: reading.versionId,
            previousConversations: [],
          } as T;
        if (operation.startsWith("history?"))
          return {
            version: { id: reading.versionId },
            source: initialArticle.source,
            summary: "保存的摘要",
            translation: initialArticle.translation,
          } as T;
        if (operation.startsWith("chat")) {
          if (body && typeof body === "object" && "text" in body)
            chat.messages.push({ id: "3", role: "user", text: String(body.text), timestamp: 2 });
          return chat as T;
        }
        return { ...initialArticle, canDiscuss: initialCanDiscuss } as T;
      },
      subscribe: () => () => {
        /* Fixture never opens a network connection. */
      },
    };
  }, [initialArticle, initialCanDiscuss]);
  if (props.surface === "admin")
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <div className="mx-auto max-w-6xl">
          <PreviewArticleShell
            title={initialArticle.title ?? "剪藏预览"}
            tags={["剪藏"]}
            meta={[]}
            body=""
            bodyTestId="admin-clipping-body"
            articlePath="Memos/pi-durable.md"
            publicMediaContext={{
              kind: "memo",
              slug: "pi-durable",
              filePath: "Memos/pi-durable.md",
            }}
            bodyContent={
              <ClippingDetail
                {...props}
                initialArticle={initialArticle}
                initialCanDiscuss={initialCanDiscuss}
                transport={transport}
              />
            }
          />
        </div>
      </main>
    );
  return (
    <div
      className="nature-app-shell min-h-screen bg-[color:var(--nature-bg)] text-[color:var(--nature-text)]"
      data-testid="clipping-page"
      data-theme={theme}
      data-ui-theme={theme}
    >
      <PublicStoryHeader activeHref="/memos" />
      <main className="nature-main">
        <section className="nature-reading-container px-2 py-8 sm:px-6 sm:py-10">
          <article className="nature-panel nature-mobile-reading-surface px-4 py-5 sm:px-8 sm:py-7">
            <p className="nature-muted text-sm">2026-10-05 · 闪念 · #剪藏</p>
            <h1 className="nature-title my-5 text-3xl font-semibold tracking-tight">
              {initialArticle.title ?? article.title}
            </h1>
            <ClippingDetail
              {...props}
              initialArticle={initialArticle}
              initialCanDiscuss={initialCanDiscuss}
              transport={transport}
            />
          </article>
        </section>
      </main>
    </div>
  );
}

const meta = {
  title: "Memo/Clipping Detail",
  component: FixturePage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    viewport: {
      options: {
        clippingDesktop: {
          name: "Clipping desktop 1440 × 1220",
          styles: { width: "1440px", height: "1220px" },
          type: "desktop",
        },
      },
    },
    controls: { disable: true },
    docs: {
      description: {
        component:
          "完整剪藏详情页：成功、处理进度、部分译文、旧版本回退及访客边界。固定场景只使用模拟材料，不请求真实模型。",
      },
    },
  },
  args: {
    slug: "pi-durable",
    memoContent: article.content ?? "",
    initialArticle: article,
    live: true,
    initialCanDiscuss: true,
  },
} satisfies Meta<typeof ClippingDetail>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
  name: "桌面：原文与私有对话",
  globals: { viewport: { value: "clippingDesktop" } },
  parameters: { requestedViewport: { width: 1440, height: 1220 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "简体中文译文" }));
    await expect(canvas.getByText("进度会被保存。")).toBeVisible();
    const source = canvas.getByRole("link", { name: "打开原网页 ↗" });
    await expect(source).toHaveAttribute("rel", "nofollow noopener noreferrer");
    await userEvent.click(canvas.getByRole("button", { name: "原文" }));
  },
};
export const DesktopDark: Story = { ...Desktop, args: { theme: "dark" } };
export const MobileDiscussion: Story = {
  name: "移动端：草稿保留与焦点返回",
  globals: { viewport: { value: "memo393" } },
  parameters: { requestedViewport: { width: 393, height: 852 } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("button", { name: "讨论文章" }));
    await userEvent.type(body.getByRole("textbox", { name: "向文章助手提问" }), "还有哪些限制？");
    await userEvent.click(body.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(body.getByRole("button", { name: "讨论文章" })).toHaveFocus());
    await userEvent.click(body.getByRole("button", { name: "讨论文章" }));
    await expect(body.getByRole("textbox", { name: "向文章助手提问" })).toHaveValue(
      "还有哪些限制？"
    );
  },
};
export const MobileDark: Story = { ...MobileDiscussion, args: { theme: "dark" } };
export const Processing: Story = {
  args: {
    initialArticle: {
      ...article,
      translation: null,
      reading: {
        ...reading,
        status: "processing",
        translationState: "processing",
        sourceTranslationState: "pending",
        translatedSegments: 1,
      },
    },
  },
};
export const TranslationFailure: Story = {
  args: {
    initialArticle: {
      ...article,
      translation: "# 持久 Agent\n\n已保存的部分译文。",
      reading: {
        ...reading,
        status: "failed",
        translationState: "failed",
        sourceTranslationState: "failed",
        error: "全文翻译尚未完成，可重试。",
      },
    },
  },
};
export const PreviousVersion: Story = {
  args: {
    initialArticle: {
      ...article,
      reading: {
        ...reading,
        status: "failed",
        translationState: "failed",
        usingPreviousVersion: true,
        error: "当前目标处理失败，保留先前成功的阅读版本。",
      },
    },
  },
};
export const Guest: Story = {
  args: { initialCanDiscuss: false, live: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "讨论文章" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "版本历史" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "简体中文译文" }));
    await expect(canvas.getByText("进度会被保存。")).toBeVisible();
  },
};

export const AdminPreview: Story = {
  ...Desktop,
  name: "管理端：剪藏预览",
  args: { surface: "admin", theme: "dark" },
};
