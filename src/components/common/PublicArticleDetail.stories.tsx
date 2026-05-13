import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useEffect } from "react";
import { expect, within } from "storybook/test";
import "@/styles/nature-restored.css";
import { MarkdownLoadingState } from "./MarkdownLoadingState";
import MarkdownRenderer from "./MarkdownRenderer";

const articleMarkdown = `
这篇文章用于验证公开文档页的阅读、站内跳转和富内容交互。读者可以继续打开 [搜索页面](/search)，也可以访问 [Astro 官网](https://astro.build) 查看外部资料。

## 路由切换需要反馈

当用户从列表进入文档详情时，页面应该立即保留可读的标题、日期和标签，同时用轻量加载状态说明正文正在准备。

![温室里的笔记](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYwIiBoZWlnaHQ9IjQ4MCIgdmlld0JveD0iMCAwIDk2MCA0ODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9Ijk2MCIgaGVpZ2h0PSI0ODAiIGZpbGw9IiNlZGY0ZWYiLz48Y2lyY2xlIGN4PSIyNDAiIGN5PSIyMDAiIHI9IjEyMCIgZmlsbD0iIzdjYTk4YiIgZmlsbC1vcGFjaXR5PSIwLjM2Ii8+PGNpcmNsZSBjeD0iNjcwIiBjeT0iMjIwIiByPSIxNTYiIGZpbGw9IiM4NGE3YjUiIGZpbGwtb3BhY2l0eT0iMC4yOCIvPjx0ZXh0IHg9IjQ4MCIgeT0iMjUyIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjMjQzNTJkIiBmb250LXNpemU9IjM2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+RGlnaXRhbCBHcmVlbmhvdXNlPC90ZXh0Pjwvc3ZnPg==)

~~~ts
const navigationState = {
  pending: true,
  message: "正在打开页面",
};
~~~

~~~mermaid
flowchart LR
  List[内容列表] --> Detail[文档详情]
  Detail --> Feedback[加载反馈]
~~~
`;

const longCodeMarkdown = `
下面的长代码块用于验证折叠控制不会撑坏阅读布局。

\`\`\`ts
${Array.from(
  { length: 42 },
  (_, index) => `export const row${String(index + 1).padStart(2, "0")} = "line ${index + 1}";`
).join("\n")}
\`\`\`
`;

const meta = {
  title: "Public/Article Detail",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    backgrounds: {
      default: "public light",
      values: [
        { name: "public light", value: "#edf4ef" },
        { name: "public dark", value: "#0f1613" },
      ],
    },
    docs: {
      description: {
        component:
          "Public article detail states for route feedback, deferred Markdown loading, and rich document interactions.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj;

function PublicDocumentShell({
  children,
  theme = "light",
  pending = false,
  compact = false,
}: {
  children: ReactNode;
  theme?: "light" | "dark";
  pending?: boolean;
  compact?: boolean;
}) {
  useEffect(() => {
    document.documentElement.dataset.uiTheme = theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.uiPreference = "system";
    document.documentElement.dataset.publicNavigationState = pending ? "loading" : "idle";
    document.documentElement.toggleAttribute("data-public-navigation-pending", pending);
    document.documentElement.style.colorScheme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");

    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.dataset.theme = "light";
      document.documentElement.dataset.publicNavigationState = "idle";
      document.documentElement.removeAttribute("data-public-navigation-pending");
      document.documentElement.style.colorScheme = "light";
      document.documentElement.classList.remove("dark");
    };
  }, [pending, theme]);

  return (
    <div
      className={`nature-app-shell flex min-h-screen flex-col bg-[color:var(--nature-bg)] text-[color:var(--nature-text)] ${
        compact ? "mx-auto w-[390px] max-w-full" : ""
      }`}
      data-ui-theme={theme}
      data-ui-preference="system"
      data-theme={theme}
    >
      <div
        id="public-route-loading"
        className="nature-route-loading"
        role="status"
        aria-live="polite"
        aria-label="正在打开页面"
        aria-hidden={pending ? "false" : "true"}
      >
        <span className="nature-route-loading-track" aria-hidden="true">
          <span className="nature-route-loading-bar" />
        </span>
        <span className="nature-route-loading-label">正在打开页面</span>
      </div>
      <div className="nature-content-layer flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 flex-none px-3 pt-3 sm:px-4">
          <div className="nature-container">
            <div className="nature-surface flex items-center gap-3 px-4 py-3 sm:px-5">
              <a
                href="/"
                className="font-heading text-xl font-semibold text-[color:var(--nature-text)]"
              >
                Ivan's Blog
              </a>
              <nav className="ml-3 hidden items-center gap-1 text-sm font-medium md:flex">
                {["闪念", "文章", "项目", "标签"].map((item) => (
                  <a
                    key={item}
                    href="/"
                    className="rounded-full px-4 py-2 text-[color:var(--nature-text-soft)]"
                  >
                    {item}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </header>
        <main className="nature-main flex-1" aria-busy={pending ? "true" : undefined}>
          <section
            className={
              compact ? "mx-auto w-full max-w-full px-2 py-8" : "nature-reading-container py-10"
            }
          >
            <article className="space-y-8">
              <header className="nature-surface px-6 py-7 sm:px-8">
                <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
                  <span className="nature-chip nature-chip-info">2026-05-12</span>
                  <span className="nature-chip">7 分钟</span>
                  <span className="nature-chip nature-chip-accent">Frontend</span>
                </div>
                <h1 className="mt-5 font-heading text-4xl font-semibold leading-tight tracking-[-0.04em] text-[color:var(--nature-text)]">
                  路由反馈与文档加载体验
                </h1>
                <p className="nature-muted mt-5 max-w-3xl text-base sm:text-lg">
                  用稳定的反馈告诉读者页面正在切换，同时把重型文档交互延后到需要时加载。
                </p>
              </header>
              <div className="nature-panel px-6 py-7 sm:px-8">
                <div className="nature-markdown-interaction-note" role="status" aria-live="polite">
                  <span className="nature-spinner" aria-hidden="true" />
                  <span>正文已可阅读，图片灯箱和代码折叠会在进入视口后启用</span>
                </div>
                {children}
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}

export const ArticleContent: Story = {
  name: "文档详情",
  render: () => (
    <PublicDocumentShell>
      <MarkdownRenderer
        content={articleMarkdown}
        variant="article"
        enableMath
        enableMermaid
        enableCodeFolding
        rewritePublicSitePaths
      />
    </PublicDocumentShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const internalLink = canvas.getByRole("link", { name: "搜索页面" });
    const externalLink = canvas.getByRole("link", { name: "Astro 官网" });
    await expect(internalLink).not.toHaveAttribute("target");
    await expect(externalLink).toHaveAttribute("target", "_blank");
    await expect(canvas.getByRole("button", { name: /温室里的笔记/ })).toBeVisible();
  },
};

export const MarkdownDeferredLoading: Story = {
  name: "正文加载占位",
  render: () => (
    <PublicDocumentShell>
      <MarkdownLoadingState />
    </PublicDocumentShell>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("正文加载中")).toBeInTheDocument();
  },
};

export const RoutePending: Story = {
  name: "路由切换中",
  render: () => (
    <PublicDocumentShell pending>
      <MarkdownLoadingState />
    </PublicDocumentShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status", { name: /正在打开页面/ })).toBeVisible();
    await expect(canvas.getByRole("main")).toHaveAttribute("aria-busy", "true");
  },
};

export const LongCode: Story = {
  name: "长代码折叠",
  render: () => (
    <PublicDocumentShell>
      <MarkdownRenderer content={longCodeMarkdown} variant="article" enableCodeFolding />
    </PublicDocumentShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /展开全部/ })).toBeVisible();
  },
};

export const DarkArticle: Story = {
  name: "深色文档",
  render: () => (
    <PublicDocumentShell theme="dark">
      <MarkdownRenderer
        content={articleMarkdown}
        variant="article"
        enableMermaid
        enableCodeFolding
      />
    </PublicDocumentShell>
  ),
};

export const MobileArticle: Story = {
  name: "移动宽度文档",
  render: () => (
    <PublicDocumentShell compact>
      <MarkdownRenderer content={articleMarkdown} variant="article" enableCodeFolding />
    </PublicDocumentShell>
  ),
};
