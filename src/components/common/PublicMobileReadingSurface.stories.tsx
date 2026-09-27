import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useEffect } from "react";
import { expect } from "storybook/test";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

const meta = {
  title: "Public/Mobile Reading Surface",
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
          "Mobile reading surfaces use a theme-aware full-bleed background, inset prose, separated stream rows, and feedback limited to actionable links.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function PublicSurfaceShell({ children, theme }: { children: ReactNode; theme: "light" | "dark" }) {
  useEffect(() => {
    document.documentElement.dataset.uiTheme = theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
    };
  }, [theme]);

  return (
    <div className="nature-app-shell min-h-screen bg-[color:var(--nature-bg)] text-[color:var(--nature-text)]">
      <main className="nature-main min-h-screen">
        <section className="nature-container space-y-5 px-2 py-8">
          <h1 className="nature-title px-2 text-2xl font-semibold">阅读内容</h1>
          {children}
        </section>
      </main>
    </div>
  );
}

function ReadingSurfaceGallery({ theme }: { theme: "light" | "dark" }) {
  return (
    <PublicSurfaceShell theme={theme}>
      <section className="nature-surface nature-mobile-reading-surface px-4 py-4">
        <h2 className="nature-title text-xl font-semibold">文章摘要</h2>
        <p className="nature-muted mt-2 text-base leading-7">
          正文放在完整的阅读承载层中，与环境背景分开，文字始终保留清晰的内边距。
        </p>
        <p className="nature-muted mt-3 text-sm leading-6" data-testid="long-reading-url">
          https://example.com/projects/reading-surfaces/long-unbroken-path/mobile-and-desktop-theme-contrast
        </p>
        <div className="nature-prose mt-4 min-w-0 max-w-full">
          <pre className="min-w-0 max-w-full overflow-x-auto" data-testid="long-reading-code">
            <code>
              {
                "const narrowViewport = { width: 320, preserveContentInset: true, keepCodeScrollable: true };"
              }
            </code>
          </pre>
        </div>
      </section>

      <div className="nature-mobile-reading-stream flex flex-col">
        <article className="nature-mobile-reading-row px-4 py-4">
          <p className="text-sm text-[color:var(--nature-text-soft)]">2026年9月28日</p>
          <h2 className="nature-title mt-2 text-lg font-semibold">状态与渲染边界</h2>
          <p className="nature-muted mt-2 leading-7">
            阅读流共用一块底面，分隔线跨过整行，内容保持缩进。
          </p>
        </article>
        <article className="nature-mobile-reading-row px-4 py-4">
          <p className="text-sm text-[color:var(--nature-text-soft)]">2026年9月27日</p>
          <h2 className="nature-title mt-2 text-lg font-semibold" data-testid="long-reading-title">
            NarrowViewportContentSurfaceThemeContrastAndLongTitlesWithoutWhitespace
          </h2>
          <p className="nature-muted mt-2 leading-7">
            浅色和深色都使用对应的承载层，不依赖环境背景衬托正文。
          </p>
        </article>
      </div>

      <ul className="nature-mobile-reading-stream flex flex-col">
        <li className="nature-mobile-reading-row list-none">
          <a
            href="#search-result"
            className="nature-hover-hitbox block"
            data-search-result-card
            aria-label="打开搜索结果"
          >
            <div className="search-result-card">
              <div className="px-4 py-4">
                <span className="nature-chip">闪念</span>
                <h2 className="nature-title mt-2 text-lg font-semibold">搜索结果的按压区域</h2>
                <p className="nature-muted mt-2 leading-7">
                  只有可操作的链接显示整行反馈，文本边缘不贴近视口。
                </p>
              </div>
            </div>
          </a>
        </li>
      </ul>
    </PublicSurfaceShell>
  );
}

const mobileViewport = {
  parameters: {
    viewport: {
      options: {
        reading393: {
          name: "Reading 393 x 852",
          styles: { width: "393px", height: "852px" },
          type: "mobile",
        },
      },
    },
  },
  globals: {
    viewport: { value: "reading393", isRotated: false },
  },
};

function assertMobileReadingGeometry(canvasElement: HTMLElement, expectedInset: number) {
  const viewportWidth = canvasElement.ownerDocument.defaultView?.innerWidth ?? 0;
  const surface = canvasElement.querySelector<HTMLElement>(".nature-mobile-reading-surface");
  const stream = canvasElement.querySelector<HTMLElement>(".nature-mobile-reading-stream");
  const prose = surface?.querySelector("p");
  const row = canvasElement.querySelector<HTMLElement>(".nature-mobile-reading-row");
  const rowText = row?.querySelector<HTMLElement>("p");
  const link = canvasElement.querySelector<HTMLElement>("a[data-search-result-card]");
  const linkCard = link?.querySelector<HTMLElement>(".search-result-card");
  const linkContent = link?.querySelector<HTMLElement>(".search-result-card h2");
  const longUrl = canvasElement.querySelector<HTMLElement>('[data-testid="long-reading-url"]');
  const longTitle = canvasElement.querySelector<HTMLElement>('[data-testid="long-reading-title"]');
  const code = canvasElement.querySelector<HTMLElement>('[data-testid="long-reading-code"]');

  expect(surface).not.toBeNull();
  expect(stream).not.toBeNull();
  expect(prose).not.toBeNull();
  expect(row).not.toBeNull();
  expect(rowText).not.toBeNull();
  expect(link).not.toBeNull();
  expect(linkCard).not.toBeNull();
  expect(linkContent).not.toBeNull();
  expect(longUrl).not.toBeNull();
  expect(longTitle).not.toBeNull();
  expect(code).not.toBeNull();
  expect(Math.abs(surface?.getBoundingClientRect().left ?? 0)).toBeLessThanOrEqual(1);
  expect(
    Math.abs((surface?.getBoundingClientRect().right ?? 0) - viewportWidth)
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(stream?.getBoundingClientRect().left ?? 0)).toBeLessThanOrEqual(1);
  expect(
    Math.abs((stream?.getBoundingClientRect().right ?? 0) - viewportWidth)
  ).toBeLessThanOrEqual(1);
  expect(Math.abs((prose?.getBoundingClientRect().left ?? 0) - expectedInset)).toBeLessThanOrEqual(
    1
  );
  expect(Math.abs(row?.getBoundingClientRect().left ?? 0)).toBeLessThanOrEqual(1);
  expect(
    Math.abs((rowText?.getBoundingClientRect().left ?? 0) - expectedInset)
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(link?.getBoundingClientRect().left ?? 0)).toBeLessThanOrEqual(1);
  expect(Math.abs((link?.getBoundingClientRect().right ?? 0) - viewportWidth)).toBeLessThanOrEqual(
    1
  );
  expect(Math.abs(linkCard?.getBoundingClientRect().left ?? 0)).toBeLessThanOrEqual(1);
  expect(
    Math.abs((linkContent?.getBoundingClientRect().left ?? 0) - expectedInset)
  ).toBeLessThanOrEqual(1);
  expect(longUrl?.scrollWidth).toBeLessThanOrEqual(longUrl?.clientWidth ?? 0);
  expect(longTitle?.scrollWidth).toBeLessThanOrEqual(longTitle?.clientWidth ?? 0);
  expect(code?.getBoundingClientRect().width ?? 0).toBeLessThanOrEqual(
    viewportWidth - expectedInset * 2 + 1
  );
  expect(code?.scrollWidth ?? 0).toBeGreaterThan(code?.clientWidth ?? 0);
  expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
}

export const MobileLight: Story = {
  name: "浅色通栏与内容缩进",
  ...mobileViewport,
  render: () => <ReadingSurfaceGallery theme="light" />,
  play: async ({ canvasElement }) => assertMobileReadingGeometry(canvasElement, 16),
};

export const MobileDarkNarrow: Story = {
  name: "深色窄屏与可操作行",
  parameters: {
    viewport: {
      options: {
        reading320: {
          name: "Reading 320 x 700",
          styles: { width: "320px", height: "700px" },
          type: "mobile",
        },
      },
    },
    backgrounds: { default: "public dark" },
  },
  globals: {
    viewport: { value: "reading320", isRotated: false },
  },
  render: () => <ReadingSurfaceGallery theme="dark" />,
  play: async ({ canvasElement }) => assertMobileReadingGeometry(canvasElement, 12),
};
