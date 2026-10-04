import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { publicResourceFixture } from "@/lib/playbook/resource-fixture";
import PlaybookResourceBrowser from "./PlaybookResourceBrowser";
import "@/lib/iconify-collections";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

function Frame({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  useLayoutEffect(() => {
    document.documentElement.dataset.uiTheme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", dark);
    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.classList.remove("dark");
    };
  }, [dark]);
  return (
    <div
      className="w-full max-w-[960px] p-4 sm:p-6"
      style={{ background: "var(--nature-bg)" }}
      data-visual-evidence-surface="resource-browser"
    >
      <div data-visual-evidence-target="resource-browser">{children}</div>
    </div>
  );
}

const meta = {
  beforeEach: () => {
    // A remount must start from the authored fixture, not the last file's URL hash.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  },
  title: "Public/Playbook/Resource Browser",
  component: PlaybookResourceBrowser,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    docs: {
      description: {
        component:
          "Public-only local files with native directory disclosure, collapsible file navigation, Markdown reading/source views and theme-aware syntax highlighting. No network or login.",
      },
    },
    viewport: {
      options: {
        filesDesktop: {
          name: "Files 1280 × 900",
          styles: { width: "1280px", height: "900px" },
          type: "desktop",
        },
        filesMobile: {
          name: "Files 390 × 844",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
        filesNarrow: {
          name: "Files 320 × 700",
          styles: { width: "320px", height: "700px" },
          type: "mobile",
        },
      },
    },
  },
  args: {
    id: "resource-example",
    files: publicResourceFixture,
    resourceHref: (path: string) => `/public-fixture/${path}`,
  },
  decorators: [
    (Story, context) => (
      <Frame dark={!!context.parameters.dark}>
        <Story />
      </Frame>
    ),
  ],
} satisfies Meta<typeof PlaybookResourceBrowser>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  globals: { viewport: { value: "filesDesktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-enhanced='true']")).not.toBeNull()
    );
    const nav = within(canvas.getByRole("navigation", { name: "Skill 文件" }));
    await expect(nav.getByRole("link", { name: "verify.sh" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    await expect(
      canvasElement.querySelectorAll(".language-bash .hljs-string").length
    ).toBeGreaterThan(0);
    await userEvent.click(nav.getByRole("link", { name: "release.json" }));
    await expect(canvas.getByLabelText("config/release.json 源码")).toHaveTextContent(
      '"retainPrevious": true'
    );
    await expect(
      canvasElement.querySelectorAll(".language-json .hljs-attr").length
    ).toBeGreaterThan(0);
    const tree = canvas.getByRole("complementary", { name: "文件树" });
    const close = within(tree).getByRole("button", { name: "关闭文件树" });
    const panel = canvas
      .getByLabelText("config/release.json 源码")
      .closest("[data-playbook-file-panel]");
    const before = panel?.getBoundingClientRect().width ?? 0;
    await userEvent.click(close);
    await expect(tree).not.toBeVisible();
    await expect(panel?.getBoundingClientRect().width ?? 0).toBeGreaterThan(before);
    await userEvent.click(canvas.getByRole("button", { name: "展开文件树" }));
    await expect(tree).toBeVisible();
    await expect(nav.getByRole("link", { name: "release.json" })).toHaveAttribute(
      "aria-current",
      "true"
    );
  },
};

export const MarkdownReading: Story = {
  globals: Default.globals,
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-enhanced='true']")).not.toBeNull()
    );
    const canvas = within(canvasElement);
    const nav = within(canvas.getByRole("navigation", { name: "Skill 文件" }));
    await userEvent.click(nav.getByRole("link", { name: "release-guide.md" }));
    await expect(canvas.getByRole("heading", { name: "发布核对" })).toBeVisible();
    await userEvent.click(canvas.getByRole("link", { name: "失败恢复" }));
    await expect(canvas.getByRole("heading", { name: "失败恢复" })).toBeVisible();
    await userEvent.click(canvas.getByRole("link", { name: "返回发布核对" }));
    await expect(canvas.getByRole("heading", { name: "发布核对" })).toBeVisible();
  },
};

export const MarkdownSource: Story = {
  globals: Default.globals,
  play: async (context) => {
    await MarkdownReading.play?.(context);
    const canvas = within(context.canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "源码", exact: true }));
    await expect(canvas.getByLabelText("references/release-guide.md 源码")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "源码", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(canvas.queryByRole("heading", { name: "发布核对" })).not.toBeInTheDocument();
    await expect(
      context.canvasElement.querySelectorAll(".language-markdown .hljs-section").length
    ).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole("button", { name: "阅读", exact: true }));
    await expect(canvas.getByRole("heading", { name: "发布核对" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "源码", exact: true }));
  },
};

export const TreeHidden: Story = {
  globals: Default.globals,
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-enhanced='true']")).not.toBeNull()
    );
    const canvas = within(canvasElement);
    await userEvent.click(
      within(canvas.getByRole("complementary", { name: "文件树" })).getByRole("button", {
        name: "关闭文件树",
      })
    );
    await expect(canvas.getByRole("button", { name: "展开文件树" })).toBeVisible();
    await expect(canvas.getByLabelText("scripts/verify.sh 源码")).toBeVisible();
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "filesMobile", isRotated: false } },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-enhanced='true']")).not.toBeNull()
    );
    const canvas = within(canvasElement);
    const browser = canvasElement.querySelector<HTMLElement>("[data-playbook-resource-browser]");
    const tree = browser?.querySelector<HTMLElement>(".playbook-file-sidebar");
    const preview = browser?.querySelector<HTMLElement>(".playbook-file-window");
    if (!browser || !tree || !preview) throw new Error("Missing mobile file browser");
    await expect(tree).not.toBeVisible();
    const bounds = preview.getBoundingClientRect();
    const toggle = canvas.getByRole("button", { name: "展开文件树" });
    const doc = canvasElement.ownerDocument;
    const scrollY = doc.defaultView?.scrollY;
    await userEvent.click(toggle);
    await waitFor(() => expect(tree).toBeVisible(), { timeout: 5000 });
    await expect(preview.getBoundingClientRect().top).toBe(bounds.top);
    await expect(preview.getBoundingClientRect().height).toBe(bounds.height);
    await expect(doc.defaultView?.scrollY).toBe(scrollY);
    await waitFor(() => expect(tree.getAnimations()).toHaveLength(0), { timeout: 5000 });
    await expect(tree.getBoundingClientRect().top).toBeGreaterThan(bounds.top);
    await expect(tree.getBoundingClientRect().bottom).toBeLessThanOrEqual(bounds.bottom);
    await expect(tree.getBoundingClientRect().left).toBeGreaterThanOrEqual(bounds.left);
    await expect(tree.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right);
    const nav = within(canvas.getByRole("navigation", { name: "Skill 文件" }));
    await userEvent.click(nav.getByRole("link", { name: "release.json" }));
    await waitFor(() => expect(tree).not.toBeVisible(), { timeout: 5000 });
    await expect(canvas.getByLabelText("config/release.json 源码")).toBeVisible();
    const selectedToggle = canvas.getByRole("button", { name: "展开文件树" });
    await userEvent.click(selectedToggle);
    await expect(nav.getByRole("link", { name: "release.json" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    await expect(nav.getByRole("link", { name: "release.json" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(tree).not.toBeVisible(), { timeout: 5000 });
    await expect(selectedToggle).toHaveFocus();
    await userEvent.click(selectedToggle);
    const path = browser.querySelector<HTMLElement>(
      "[data-playbook-file-panel]:not([hidden]) .playbook-file-path"
    );
    if (!path) throw new Error("Missing selected file path");
    await userEvent.click(path);
    await waitFor(() => expect(tree).not.toBeVisible(), { timeout: 5000 });
    await expect(preview.getBoundingClientRect().height).toBe(bounds.height);
    await userEvent.click(selectedToggle);
    await expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(
      doc.documentElement.clientWidth
    );
  },
};
export const MobileDark: Story = { ...Mobile, play: Mobile.play, parameters: { dark: true } };
export const NarrowMobile: Story = {
  ...Mobile,
  play: Mobile.play,
  globals: { viewport: { value: "filesNarrow", isRotated: false } },
};

export const HeightStability: Story = {
  globals: Default.globals,
  args: {
    files: [
      ...publicResourceFixture,
      {
        path: "references/long-reading.md",
        kind: "reference",
        content: [
          "# 长文阅读样例",
          ...Array.from(
            { length: 24 },
            (_, index) =>
              `\n## 核对项 ${index + 1}\n\n这是用于检查滚动区域的公开样例。切换文件与预览方式时，文件浏览器保持相同高度，长文在阅读区域内滚动。\n`
          ),
          "阅读样例结束。",
        ].join("\n"),
      },
      {
        path: "scripts/long-source.sh",
        kind: "script",
        content: [
          "#!/usr/bin/env bash",
          "# Public fixture for independent source scrolling.",
          ...Array.from({ length: 120 }, (_, index) => `printf 'Check ${index + 1}\\n'`),
          "# Source fixture ends here.",
        ].join("\n"),
      },
      {
        path: "references/a-long-directory-name-for-public-resource-layout/another-directory/short-note-with-a-long-file-name.txt",
        kind: "text",
        content: "A short public note with a long relative path.\n",
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-enhanced='true']")).not.toBeNull()
    );
    const canvas = within(canvasElement);
    const browser = canvasElement.querySelector<HTMLElement>("[data-playbook-resource-browser]");
    if (!browser) throw new Error("Missing resource browser");
    const tree = browser.querySelector<HTMLElement>(".playbook-file-sidebar");
    if (!tree) throw new Error("Missing file tree");
    const height = browser.getBoundingClientRect().height;
    const assertHeight = async () => {
      await expect(Math.abs(browser.getBoundingClientRect().height - height)).toBeLessThan(2);
      const panel = browser.querySelector<HTMLElement>("[data-playbook-file-panel]:not([hidden])");
      if (!panel) throw new Error("Missing selected file");
      await expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        browser.getBoundingClientRect().bottom + 1
      );
    };
    const select = async (name: string) => {
      if (tree.getAttribute("aria-hidden") === "true")
        await userEvent.click(canvas.getByRole("button", { name: "展开文件树" }));
      await userEvent.click(
        within(canvas.getByRole("navigation", { name: "Skill 文件" })).getByRole("link", {
          name,
          exact: true,
        })
      );
      if (browser.getBoundingClientRect().width < 640)
        await waitFor(() => expect(tree).not.toBeVisible(), { timeout: 5000 });
      await assertHeight();
    };
    await select("release.json");
    await select("long-reading.md");
    const reading = canvas.getByRole("region", { name: "references/long-reading.md 阅读" });
    await expect(reading.scrollHeight).toBeGreaterThan(reading.clientHeight);
    await expect(reading).toHaveAttribute("tabindex", "0");
    reading.scrollTop = reading.scrollHeight;
    await expect(reading.scrollTop).toBeGreaterThan(0);
    await expect(within(reading).getByText("阅读样例结束。")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "源码", exact: true }));
    await assertHeight();
    await userEvent.click(canvas.getByRole("button", { name: "阅读", exact: true }));
    await assertHeight();
    await select("long-source.sh");
    const source = canvas.getByRole("region", { name: "scripts/long-source.sh 源码" });
    const pre = source.querySelector("pre");
    if (!pre) throw new Error("Missing source scroller");
    await expect(pre.scrollHeight).toBeGreaterThan(pre.clientHeight);
    pre.scrollTop = pre.scrollHeight;
    await expect(pre.scrollTop).toBeGreaterThan(0);
    await expect(pre.textContent).toContain("Source fixture ends here.");
    await select("short-note-with-a-long-file-name.txt");
    await select("NOTICE");
    if (tree.getAttribute("aria-hidden") === "true")
      await userEvent.click(canvas.getByRole("button", { name: "展开文件树" }));
    await assertHeight();
    await userEvent.click(within(tree).getByRole("button", { name: "关闭文件树" }));
    await waitFor(() => expect(tree).not.toBeVisible(), { timeout: 5000 });
    await assertHeight();
    await userEvent.click(canvas.getByRole("button", { name: "展开文件树" }));
    await assertHeight();
    const navigation = tree.querySelector("nav");
    if (!navigation) throw new Error("Missing file navigation");
    await expect(navigation.clientHeight).toBeLessThan(height);
    if (browser.getBoundingClientRect().width < 640)
      await expect(navigation.scrollHeight).toBeGreaterThan(navigation.clientHeight);
    const doc = canvasElement.ownerDocument;
    await expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(
      doc.documentElement.clientWidth
    );
  },
};
export const MobileHeightStability: Story = {
  ...HeightStability,
  play: HeightStability.play,
  globals: Mobile.globals,
};
export const NarrowHeightStability: Story = {
  ...HeightStability,
  play: HeightStability.play,
  globals: NarrowMobile.globals,
};
export const Fullscreen: Story = {
  ...HeightStability,
  play: async (context) => {
    await HeightStability.play?.(context);
    const canvas = within(context.canvasElement);
    const browser = context.canvasElement.querySelector<HTMLElement>(
      "[data-playbook-resource-browser]"
    );
    if (!browser) throw new Error("Missing resource browser");
    await userEvent.click(canvas.getByRole("link", { name: "long-reading.md", exact: true }));
    const reading = canvas.getByRole("region", { name: "references/long-reading.md 阅读" });
    reading.scrollTop = 96;
    await userEvent.click(canvas.getByRole("button", { name: "源码", exact: true }));
    const source = canvas.getByRole("region", { name: "references/long-reading.md 源码" });
    const pre = source.querySelector("pre");
    if (!pre) throw new Error("Missing full-screen source");
    pre.scrollTop = 128;
    const doc = context.canvasElement.ownerDocument;
    const view = doc.defaultView;
    if (!view) throw new Error("Missing browser window");
    const height = browser.getBoundingClientRect().height;
    const opener = canvas.getByRole("button", { name: "放大公开资源" });
    const checkExpanded = async () => {
      const modal = canvas.getByRole("dialog", { name: "公开资源" });
      await waitFor(() => expect(modal.getAnimations()).toHaveLength(0), { timeout: 5000 });
      const bounds = modal.getBoundingClientRect();
      await expect(modal.matches(":modal")).toBe(true);
      await expect(Math.abs(bounds.width - view.innerWidth)).toBeLessThan(1);
      await expect(Math.abs(bounds.height - view.innerHeight)).toBeLessThan(1);
      await expect(Math.abs(bounds.top) + Math.abs(bounds.left)).toBeLessThan(1);
      await expect(modal.contains(source)).toBe(true);
      await expect(pre.scrollTop).toBe(128);
      await expect(canvas.getByRole("button", { name: "源码", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      await expect(opener).toHaveFocus();
      await expect(doc.body.style.overflow).toBe("hidden");
      return modal;
    };
    const checkRestored = async () => {
      await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
      await expect(Math.abs(browser.getBoundingClientRect().height - height)).toBeLessThan(1);
      await expect(pre.scrollTop).toBe(128);
      await expect(opener).toHaveFocus();
      await userEvent.click(canvas.getByRole("button", { name: "阅读", exact: true }));
      await expect(reading.scrollTop).toBe(96);
      await userEvent.click(canvas.getByRole("button", { name: "源码", exact: true }));
      await expect(pre.scrollTop).toBe(128);
      await expect(doc.body.style.overflow).not.toBe("hidden");
    };
    const pagePosition = view.scrollY;
    await userEvent.click(opener);
    await checkExpanded();
    if (view.innerWidth < 640) {
      await userEvent.click(canvas.getByRole("button", { name: "展开文件树" }));
      await userEvent.keyboard("{Escape}");
      await expect(canvas.getByRole("dialog", { name: "公开资源" })).toBeVisible();
    }
    await userEvent.keyboard("{Escape}");
    await checkRestored();
    await expect(Math.abs(view.scrollY - pagePosition)).toBeLessThan(1);
    await userEvent.click(opener);
    const modal = await checkExpanded();
    // Native cancellation (for example an OS close request) follows the same cleanup path.
    modal.dispatchEvent(new Event("cancel", { cancelable: true }));
    await checkRestored();
    await userEvent.click(opener);
    await checkExpanded();
    await userEvent.click(canvas.getByRole("button", { name: "退出放大显示" }));
    await checkRestored();
    await userEvent.click(opener);
    await checkExpanded();
  },
};
export const MobileFullscreen: Story = {
  ...Fullscreen,
  play: Fullscreen.play,
  globals: Mobile.globals,
};
export const NarrowFullscreen: Story = {
  ...Fullscreen,
  play: Fullscreen.play,
  globals: NarrowMobile.globals,
};
export const Empty: Story = { args: { files: [] } };
