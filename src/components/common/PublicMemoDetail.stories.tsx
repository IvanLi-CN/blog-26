import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useEffect } from "react";
import { expect, within } from "storybook/test";
import "@/styles/nature-restored.css";
import Icon from "../ui/Icon";
import MarkdownRenderer from "./MarkdownRenderer";
import { PublicStoryHeader } from "./PublicStoryHeader";

const memo = {
  title: "20241120 ica8cwah",
  date: "2024-11-20",
  content:
    "SLA 3D 打印的模型嵌入热融螺母，预留孔大小比最大直径小 0.2 mm，有点咬合不力。或许应该直接设计成不含花纹的直径大小。",
  tags: ["Modeling"],
};

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
        <PublicStoryHeader activeHref="/memos" />

        <main className="nature-main flex-1">
          <section className="nature-reading-container px-2 py-8 sm:px-6 sm:py-10">
            {children}
          </section>
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
      <div className="nature-panel px-4 py-5 sm:px-8 sm:py-7" data-testid="public-memo-detail-card">
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

        <h1 className="nature-title mt-5 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
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

export const MobileMemoDensity: Story = {
  name: "移动端内容密度",
  parameters: {
    viewport: {
      options: {
        publicMobile: {
          name: "Public mobile 393 x 852",
          styles: { width: "393px", height: "852px" },
          type: "mobile",
        },
      },
    },
    backgrounds: {
      default: "public dark",
    },
  },
  globals: {
    viewport: { value: "publicMobile", isRotated: false },
  },
  render: () => (
    <PublicShell theme="dark">
      <MemoDetailArticle {...memo} />
    </PublicShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByTestId("public-memo-detail-card");
    const viewportWidth = canvasElement.ownerDocument.defaultView?.innerWidth ?? 0;

    expect(getComputedStyle(card).borderRadius).toBe("16px");
    expect(getComputedStyle(card).paddingLeft).toBe("16px");
    expect(card.getBoundingClientRect().width).toBeGreaterThanOrEqual(viewportWidth - 40);
  },
};

export const NarrowMobileMemoDensity: Story = {
  name: "窄屏内容密度",
  parameters: {
    viewport: {
      options: {
        publicNarrowMobile: {
          name: "Public narrow mobile 320 x 700",
          styles: { width: "320px", height: "700px" },
          type: "mobile",
        },
      },
    },
    backgrounds: {
      default: "public dark",
    },
  },
  globals: {
    viewport: { value: "publicNarrowMobile", isRotated: false },
  },
  render: () => (
    <PublicShell theme="dark">
      <MemoDetailArticle {...memo} />
    </PublicShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByTestId("public-memo-detail-card");
    const navLinks = Array.from(canvasElement.querySelectorAll<HTMLElement>(".nature-nav-link"));

    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
    expect(getComputedStyle(card).borderRadius).toBe("16px");
    expect(getComputedStyle(card).paddingLeft).toBe("16px");
    for (const link of navLinks) {
      expect(link.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  },
};
