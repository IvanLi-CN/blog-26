import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useEffect } from "react";
import { expect, userEvent, within } from "storybook/test";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";
import { PublicStoryHeader } from "./PublicStoryHeader";

const meta = {
  title: "Public/Site Header",
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
          "The public header combines the approved Iv mark with the site name and adapts the mark to the active theme.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function HeaderState({ theme, children }: { theme: "light" | "dark"; children?: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.uiTheme = theme;
    root.dataset.uiPreference = theme;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.classList.toggle("dark", theme === "dark");

    return () => {
      root.dataset.uiTheme = "light";
      root.dataset.uiPreference = "system";
      root.dataset.theme = "light";
      root.style.colorScheme = "light";
      root.classList.remove("dark");
    };
  }, [theme]);

  return (
    <div className="nature-app-shell min-h-screen bg-[color:var(--nature-bg)] text-[color:var(--nature-text)]">
      <div className="nature-content-layer min-h-screen">
        <PublicStoryHeader activeHref="/posts" />
        {children}
      </div>
    </div>
  );
}

function HeaderContent({ theme }: { theme: "light" | "dark" }) {
  return (
    <HeaderState theme={theme}>
      <main className="nature-container py-16 text-center text-sm text-[color:var(--nature-text-soft)]">
        {theme === "light" ? "Public site navigation" : "Public site navigation in dark mode"}
      </main>
    </HeaderState>
  );
}

export const LightTheme: Story = {
  name: "浅色主题",
  render: () => <HeaderContent theme="light" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const mark = canvasElement.querySelector(".nature-brand-mark");
    await expect(canvas.getByRole("link", { name: "Ivan's Blog" })).toHaveAttribute("href", "/");
    await expect(canvas.getByRole("link", { name: "文章" })).toHaveClass(/aw-link-active/);
    await expect(mark).toBeVisible();
    await expect(mark).toHaveStyle({ backgroundColor: "rgb(78, 126, 96)" });
  },
};

export const DarkTheme: Story = {
  name: "暗色主题",
  render: () => <HeaderContent theme="dark" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const mark = canvasElement.querySelector(".nature-brand-mark");
    const brandLink = canvas.getByRole("link", { name: "Ivan's Blog" });
    await expect(mark).toBeVisible();
    await expect(mark).toHaveStyle({ backgroundColor: getComputedStyle(brandLink).color });
  },
};

export const ThemeToggle: Story = {
  name: "主题切换",
  render: () => <HeaderContent theme="light" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTitle("Dark"));
    await expect(document.documentElement).toHaveAttribute("data-ui-theme", "dark");
    const mark = canvasElement.querySelector(".nature-brand-mark");
    const brandLink = canvas.getByRole("link", { name: "Ivan's Blog" });
    await expect(mark).toHaveStyle({ backgroundColor: getComputedStyle(brandLink).color });
  },
};
