import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useEffect } from "react";
import { expect, within } from "storybook/test";
import "@/styles/nature-restored.css";
import Icon from "../ui/Icon";
import MarkdownRenderer from "./MarkdownRenderer";
import ThemeToggle from "./ThemeToggle";

const memo = {
  title: "20241120 ica8cwah",
  date: "2024-11-20",
  content:
    "SLA 3D 打印的模型嵌入热融螺母，预留孔大小比最大直径小 0.2 mm，有点咬合不力。或许应该直接设计成不含花纹的直径大小。",
  tags: ["Modeling"],
};

const navLinks = [
  { icon: "tabler:notes", text: "闪念", href: "/memos", active: true },
  { icon: "tabler:article", text: "文章", href: "/posts" },
  { icon: "tabler:code", text: "项目", href: "/projects" },
  { icon: "tabler:hash", text: "标签", href: "/tags" },
];

const meta = {
  title: "Public/Memo Detail",
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
          "Public memo detail keeps the reading shell hierarchy intact without a separate summary block above the body.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function PublicShell({
  children,
  theme = "light",
}: {
  children: ReactNode;
  theme?: "light" | "dark";
}) {
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
    <div
      className="nature-app-shell flex min-h-screen flex-col bg-[color:var(--nature-bg)] text-[color:var(--nature-text)]"
      data-ui-theme={theme}
      data-ui-preference="system"
      data-theme={theme}
    >
      <div className="nature-content-layer flex min-h-screen flex-col">
        <header className="nature-site-header sticky top-0 z-40 flex-none w-full px-3 pt-3 sm:px-4">
          <div className="nature-container nature-site-header-frame">
            <div className="nature-surface flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <a
                href="/"
                className="nature-brand-link min-w-fit pl-1 font-heading text-xl font-semibold tracking-[-0.04em] text-[color:var(--nature-text)] transition-colors hover:text-[color:var(--nature-accent-strong)] sm:text-2xl"
              >
                Ivan's Blog
              </a>

              <nav
                className="order-3 w-full md:order-2 md:ml-2 md:w-auto"
                aria-label="Main navigation"
              >
                <ul className="flex flex-wrap items-center gap-1 text-sm font-medium">
                  {navLinks.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className={`nature-nav-link gap-2 rounded-full px-4 py-2 transition ${
                          link.active
                            ? "aw-link-active"
                            : "text-[color:var(--nature-text-soft)] hover:bg-[rgba(var(--nature-accent-rgb),0.1)] hover:text-[color:var(--nature-accent-strong)]"
                        }`}
                      >
                        <Icon name={link.icon} className="h-4 w-4" />
                        {link.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="order-2 ml-auto flex items-center gap-3 md:order-3">
                <label className="nature-input-shell hidden min-w-[20rem] items-center xl:flex">
                  <Icon
                    name="tabler:search"
                    className="h-5 w-5 text-[color:var(--nature-text-faint)]"
                  />
                  <input type="text" placeholder="搜索文章..." className="nature-input" />
                </label>
                <a
                  className="nature-icon-button inline-flex xl:hidden"
                  aria-label="搜索"
                  href="/search"
                >
                  <Icon name="tabler:search" className="h-5 w-5" />
                </a>
                <ThemeToggle iconClass="h-4 w-4" />
                <a
                  className="nature-icon-button inline-flex"
                  aria-label="RSS Feed"
                  title="RSS Feed"
                  href="/feed.xml"
                >
                  <Icon name="tabler:rss" className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
        </header>

        <main className="nature-main flex-1">
          <section className="nature-reading-container px-6 py-10">{children}</section>
        </main>
      </div>
    </div>
  );
}

function MemoDetailArticle({
  title,
  content,
  date,
  tags,
}: {
  title: string;
  content: string;
  date: string;
  tags: string[];
}) {
  return (
    <article data-testid="public-memo-detail">
      <div className="nature-panel px-6 py-7 sm:px-8" data-testid="public-memo-detail-card">
        <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
          <span className="nature-chip nature-chip-info gap-1">
            <Icon name="tabler:clock" className="h-3.5 w-3.5" />
            <time dateTime={date}>{date}</time>
          </span>
          <span className="nature-chip gap-1">
            <Icon name="tabler:bulb" className="h-3.5 w-3.5" />
            Memo
          </span>
        </div>

        <h1 className="nature-title mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em]">
          {title}
        </h1>

        <div className="mt-5 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="nature-chip">
              #{tag}
            </span>
          ))}
        </div>
        <div className="mt-6" data-testid="public-memo-detail-body">
          <MarkdownRenderer content={content} variant="article" enableCodeFolding />
        </div>
      </div>
    </article>
  );
}

export const MemoDetailHierarchy: Story = {
  name: "详情层级",
  render: () => (
    <PublicShell>
      <MemoDetailArticle {...memo} />
    </PublicShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("public-memo-detail-card")).toBeVisible();
    await expect(canvas.getByTestId("public-memo-detail-body")).toBeVisible();
    await expect(canvas.queryByTestId("public-memo-detail-excerpt")).toBeNull();
  },
};
