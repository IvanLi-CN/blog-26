import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import PlaybookTechStack from "./PlaybookTechStack";
import "@/lib/iconify-collections";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

const stack = {
  ci_workflows: [
    "ci.yml",
    "e2e.yml",
    "product-release.yml",
    "playbook-content-update.yml",
    "notify-release-failure.yml",
  ],
  language: ["TypeScript", "SQL", "Markdown"],
  runtime: { frontend: "Astro", admin: "Vite + React", gateway: "Bun", database: "SQLite" },
  package_json: {
    deps_dev: [
      "@astrojs/react",
      "@biomejs/biome",
      "@commitlint/cli",
      "@playwright/test",
      "@storybook/react-vite",
      "typescript",
    ],
    deps_prod: ["astro", "react", "drizzle-orm", "@radix-ui/react-tooltip"],
  },
  configs_root: ["astro.config.mjs", "biome.json", "lefthook.yml", "tsconfig.json"],
  testing: { browser: "Playwright", component: "Storybook interactions", unit: "Bun test" },
};

const meta = {
  title: "Public/Playbook/Technology Stack",
  component: PlaybookTechStack,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    docs: {
      description: {
        component:
          "Semantic stack tabs, responsive one-line chips and a quiet JSON viewer. The official Web Demo remains the page evidence source.",
      },
    },
  },
  args: { value: stack },
  decorators: [
    (Story, context) => {
      const dark = !!context.parameters.dark;
      useLayoutEffect(() => {
        const previous = document.documentElement.dataset.uiTheme;
        document.documentElement.dataset.uiTheme = dark ? "dark" : "light";
        return () => {
          document.documentElement.dataset.uiTheme = previous;
        };
      }, [dark]);
      return (
        <div
          className="p-4"
          style={{
            background: "var(--nature-bg)",
            maxWidth: context.parameters.narrow ? 320 : 800,
          }}
        >
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof PlaybookTechStack>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const runtime = canvas.getByRole("tab", { name: "运行与交付" });
    await userEvent.click(runtime);
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "依赖与工具" })).toHaveFocus();
    await expect(canvas.getByRole("tab", { name: "依赖与工具" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await userEvent.keyboard("{End}");
    await expect(canvas.getByRole("tab", { name: "配置与质量" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect(runtime).toHaveFocus();
  },
};
export const Dark: Story = { ...Default, parameters: { dark: true } };
export const NarrowChips: Story = {
  parameters: { narrow: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getAllByRole("button", { name: /^展开其余/ }).length).toBeGreaterThan(0)
    );
    const toggle = canvas.getAllByRole("button", { name: /^展开其余/ })[0];
    const list = toggle.closest("ul");
    if (!list) throw new Error("Missing chip row");
    const visible = Array.from(list.children);
    await expect(new Set(visible.map((item) => item.getBoundingClientRect().top)).size).toBe(1);
    await expect(toggle.textContent).toMatch(/^\+\d+$/);
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(within(list).getByText("notify-release-failure.yml")).toBeVisible();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  },
};
export const RawExpanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "查看原始数据" });
    const toolbar = canvasElement.querySelector("[data-tech-stack-raw-toolbar]");
    if (!toolbar) throw new Error("Missing JSON toolbar");
    const before = toggle.getBoundingClientRect();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const after = toggle.getBoundingClientRect();
    await expect([after.x, after.y, after.width, after.height]).toEqual([
      before.x,
      before.y,
      before.width,
      before.height,
    ]);
    await expect(getComputedStyle(toolbar).paddingLeft).toBe("12px");
    await expect(
      canvasElement.querySelectorAll("#playbook-tech-stack-raw-content code span").length
    ).toBeGreaterThan(0);
  },
};
export const Fullscreen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const opener = canvas.getByRole("button", { name: "全屏查看原始数据" });
    await userEvent.click(opener);
    const dialog = canvas.getByRole("dialog");
    await waitFor(() => expect(dialog.matches(":modal")).toBe(true));
    const bounds = dialog.getBoundingClientRect();
    await expect(bounds.x).toBe(0);
    await expect(bounds.y).toBe(0);
    await expect(bounds.width).toBe(window.innerWidth);
    await expect(bounds.height).toBe(window.innerHeight);
    await userEvent.click(within(dialog).getByRole("button", { name: "退出全屏" }));
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(opener).toHaveFocus();
  },
};
export const Empty: Story = {
  args: { value: { runtime: null, dependencies: [], status: "current" } },
};
export const NestedLists: Story = {
  args: {
    value: {
      tools: Array.from({ length: 10 }, (_, index) => ({
        name: `Tool ${index + 1}`,
        enabled: true,
      })),
    },
  },
};
