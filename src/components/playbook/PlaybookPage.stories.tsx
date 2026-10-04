import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useLayoutEffect } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { publicFixtureCatalog, publicFixtureSearch } from "@/lib/playbook/fixture";
import {
  publicReadingFixtureCatalog,
  publicReadingFixtureSearch,
} from "@/lib/playbook/reading-fixture";
import type { PlaybookEdition } from "@/lib/playbook/types";
import { attachPlaybookOutlineOffset } from "@/lib/public-playbook-outline";
import { PublicStoryHeader } from "../common/PublicStoryHeader";
import PlaybookPage from "./PlaybookPage";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";
import "@/lib/public-reading-viewport";

function StoryFrame({ children, dark }: { children: React.ReactNode; dark: boolean }) {
  useLayoutEffect(() => attachPlaybookOutlineOffset(document), []);
  useEffect(() => {
    document.documentElement.dataset.uiTheme = dark ? "dark" : "light";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", dark);
    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.classList.remove("dark");
    };
  }, [dark]);
  return (
    <div className="nature-page-shell min-h-screen" data-visual-evidence-surface="page">
      <PublicStoryHeader activeHref="/playbook" />
      <main data-visual-evidence-target="page">{children}</main>
    </div>
  );
}

const edition: PlaybookEdition = {
  edition: {
    schemaVersion: 1,
    editionDigest: "a".repeat(64),
    rendererCommit: "b".repeat(40),
    contentSnapshotIdentity: "c".repeat(64),
    source: {
      repository: "IvanLi-CN/style-playbook-skills",
      releaseId: "100",
      tag: "v3.0.0",
      commit: "d".repeat(40),
      publishedAt: "2026-09-01T00:00:00Z",
    },
    bundle: { name: "playbook-public.tar.gz", sha256: "e".repeat(64), size: 1 },
    files: [],
    generatedAt: "2026-09-01T00:00:00Z",
  },
  catalog: publicFixtureCatalog,
  search: publicFixtureSearch,
};
const meta = {
  title: "Public/Playbook/Page",
  component: PlaybookPage,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    publicSurface: true,
    docs: {
      description: {
        component:
          "Controlled, public-only fixtures for native Playbook reading; no network or login required.",
      },
    },
    viewport: {
      options: {
        playbookMobile: {
          name: "Playbook 390 × 844",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
        playbookDesktop: {
          name: "Playbook 1280 × 900",
          styles: { width: "1280px", height: "900px" },
          type: "desktop",
        },
        playbookTablet: {
          name: "Playbook 1024 × 900",
          styles: { width: "1024px", height: "900px" },
          type: "tablet",
        },
        playbookCompactTablet: {
          name: "Playbook 768 × 900",
          styles: { width: "768px", height: "900px" },
          type: "tablet",
        },
        playbookNarrowMobile: {
          name: "Playbook 320 × 700",
          styles: { width: "320px", height: "700px" },
          type: "mobile",
        },
      },
    },
  },
  args: { edition, path: "" },
  decorators: [
    (Story, context) => (
      <StoryFrame dark={!!context.parameters.dark}>
        <Story />
      </StoryFrame>
    ),
  ],
} satisfies Meta<typeof PlaybookPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Index: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "执念", level: 1 })).toBeVisible();
    for (const label of ["全部", "主题", "项目实践", "规则"]) {
      await expect(canvas.getByRole("tab", { name: label })).toBeVisible();
    }
    await expect(canvas.getByRole("tab", { name: "全部" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(
      within(canvas.getByRole("list", { name: "执念内容" })).getAllByRole("listitem")
    ).toHaveLength(3);
    await expect(canvas.getByRole("link", { name: "可靠交付" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Sample Project" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Safe Release" })).toBeVisible();
  },
};
export const Topics: Story = {
  args: { path: "topics" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("tab", { name: "主题" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(canvas.getByRole("link", { name: "可靠交付" })).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Sample Project" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("link", { name: "Safe Release" })).not.toBeInTheDocument();
  },
};
export const DesktopIndex: Story = {
  ...Index,
  globals: { viewport: { value: "playbookDesktop", isRotated: false } },
};
export const DesktopDarkIndex: Story = { ...DesktopIndex, parameters: { dark: true } };
export const MobileIndex: Story = {
  ...Index,
  globals: { viewport: { value: "playbookMobile", isRotated: false } },
};
export const MobileDarkIndex: Story = { ...MobileIndex, parameters: { dark: true } };
export const MobileTopics: Story = {
  ...Topics,
  play: Topics.play,
  globals: { viewport: { value: "playbookMobile", isRotated: false } },
};
export const Topic: Story = {
  args: { path: "topics/delivery" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "可靠交付", level: 1 })).toBeVisible();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.ownerDocument.documentElement.clientWidth
    );
    const contents = within(canvas.getByRole("navigation", { name: "本页内容" }));
    for (const [title, anchor] of [
      ["稳定发布", "#release"],
      ["失败与恢复", "#recovery"],
    ]) {
      await expect(contents.getByRole("link", { name: title })).toHaveAttribute("href", anchor);
      await expect(canvas.getByRole("heading", { name: title, level: 2 })).toBeVisible();
    }
    const related = within(canvas.getByRole("region", { name: "相关内容" }));
    await expect(related.getByRole("link", { name: "Sample Project" })).toHaveAttribute(
      "href",
      "/playbook/projects/sample-project/"
    );
    await expect(related.getByRole("link", { name: "Safe Release" })).toBeVisible();
  },
};
export const Project: Story = {
  args: { path: "projects/sample-project" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "架构与选择", level: 2 })).toBeVisible();
    await expect(canvas.getByText("范围", { exact: true })).toBeVisible();
    await expect(canvas.getByText("公开样例", { exact: true })).toBeVisible();
    await expect(
      within(canvas.getByRole("region", { name: "相关内容" })).getByRole("link", {
        name: "可靠交付",
      })
    ).toHaveAttribute("href", "/playbook/topics/delivery/");
  },
};
export const Policy: Story = {
  args: { path: "policies/safe-release" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "下载 SKILL.md" })).toHaveAttribute("download");
    const contents = within(canvas.getByRole("navigation", { name: "本页内容" }));
    await expect(contents.getByRole("link", { name: "规则正文" })).toHaveAttribute(
      "href",
      "#instructions"
    );
    await expect(contents.getByRole("link", { name: "公开资源" })).toHaveAttribute(
      "href",
      "#resources"
    );
    await expect(
      within(canvas.getByRole("region", { name: "相关内容" })).getByRole("link", {
        name: "可靠交付",
      })
    ).toBeVisible();
  },
};
export const Unavailable: Story = {
  args: { edition: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("执念暂不可用");
  },
};
export const MobileTopic: Story = {
  ...Topic,
  play: Topic.play,
  globals: { viewport: { value: "playbookMobile", isRotated: false } },
};
export const DarkTopic: Story = { ...Topic, parameters: { dark: true } };
export const MobileDarkPolicy: Story = {
  ...Policy,
  play: Policy.play,
  parameters: { dark: true },
  globals: { viewport: { value: "playbookMobile", isRotated: false } },
};
export const DesktopTopic: Story = {
  ...Topic,
  play: Topic.play,
  globals: { viewport: { value: "playbookDesktop", isRotated: false } },
};
export const DesktopDarkTopic: Story = {
  ...DarkTopic,
  play: Topic.play,
  globals: { viewport: { value: "playbookDesktop", isRotated: false } },
};
export const MobileDarkTopic: Story = {
  ...MobileTopic,
  play: Topic.play,
  parameters: { dark: true },
};
export const DesktopPolicy: Story = {
  ...Policy,
  play: Policy.play,
  globals: { viewport: { value: "playbookDesktop", isRotated: false } },
};
export const ResourcePolicy: Story = {
  ...DesktopPolicy,
  beforeEach: () => {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  },
  args: {
    path: "policies/safe-release",
    edition: {
      ...edition,
      catalog: publicReadingFixtureCatalog,
      search: publicReadingFixtureSearch,
    },
  },
  play: async (context) => {
    await Policy.play?.(context);
    const canvas = within(context.canvasElement);
    const browser = context.canvasElement.querySelector<HTMLElement>(
      "[data-playbook-resource-browser]"
    );
    const resources = canvas.getByRole("region", { name: "公开资源" });
    const body = context.canvasElement.querySelector<HTMLElement>("[data-playbook-body]");
    const hero = context.canvasElement.querySelector<HTMLElement>("[data-playbook-detail] header");
    if (!body || !hero || !browser) throw new Error("Missing policy reading layout");
    await expect(body.contains(resources)).toBe(false);
    await expect(resources.parentElement).toBe(body.parentElement);
    await expect(resources.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      body.getBoundingClientRect().bottom
    );
    const view = context.canvasElement.ownerDocument.defaultView;
    if (view?.matchMedia("(max-width: 639px)").matches) {
      await waitFor(() => expect(browser.getAttribute("data-enhanced")).toBe("true"));
      const style = view.getComputedStyle(resources);
      const bounds = resources.getBoundingClientRect();
      const viewportWidth = context.canvasElement.ownerDocument.documentElement.clientWidth;
      await expect(style.borderRadius).toBe("0px");
      await expect(style.boxShadow).toBe("none");
      await expect(style.borderLeftWidth).toBe("0px");
      await expect(style.borderRightWidth).toBe("0px");
      await expect(Math.abs(bounds.left)).toBeLessThan(2);
      await expect(Math.abs(bounds.right - viewportWidth)).toBeLessThan(2);
      await expect(style.paddingLeft).toBe(viewportWidth < 375 ? "12px" : "16px");
      const tree = browser.querySelector<HTMLElement>(".playbook-file-sidebar");
      const preview = browser.querySelector<HTMLElement>(".playbook-file-window");
      if (!tree || !preview) throw new Error("Missing mobile public file preview");
      await expect(tree).not.toBeVisible();
      browser.scrollIntoView({ block: "center" });
      const previewHeight = preview.getBoundingClientRect().height;
      await userEvent.click(within(browser).getByRole("button", { name: "展开文件树" }));
      await waitFor(() => expect(tree.getAnimations()).toHaveLength(0), { timeout: 5000 });
      await expect(tree).toBeVisible();
      await expect(Math.abs(preview.getBoundingClientRect().height - previewHeight)).toBeLessThan(
        1
      );
      await expect(tree.getBoundingClientRect().top).toBeGreaterThan(
        preview.getBoundingClientRect().top
      );
      await expect(tree.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        preview.getBoundingClientRect().bottom
      );
      const selected = browser.querySelector<HTMLElement>(
        ".playbook-file-link[aria-current='true']"
      );
      const navigation = browser.querySelector(".playbook-file-sidebar nav");
      if (!selected || !navigation) throw new Error("Missing selected public file");
      await expect(selected.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        navigation.getBoundingClientRect().top - 1
      );
      await expect(selected.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        navigation.getBoundingClientRect().bottom + 1
      );
      for (const control of browser.querySelectorAll<HTMLElement>(
        ".playbook-file-link, .playbook-file-directory, .playbook-file-icon-button, [data-playbook-file-view]"
      )) {
        if (!control.getClientRects().length) continue;
        // Allow floating-point rounding from the page's transform without relaxing touch sizing.
        await expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44 - 0.01);
      }
      await expect(
        context.canvasElement.ownerDocument.documentElement.scrollWidth
      ).toBeLessThanOrEqual(viewportWidth);
    }
    if (view?.matchMedia("(min-width: 1024px)").matches) {
      await expect(
        Math.abs(resources.getBoundingClientRect().width - hero.getBoundingClientRect().width)
      ).toBeLessThan(2);
    }
    browser?.scrollIntoView({ block: "center" });
    if (view?.matchMedia("(min-width: 1024px)").matches) {
      const outline = context.canvasElement.querySelector<HTMLElement>(
        "[data-playbook-desktop-contents] [data-playbook-contents-panel]"
      );
      if (!outline) throw new Error("Missing desktop contents panel");
      await expect(outline.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        resources.getBoundingClientRect().top
      );
    }
    await expect(canvas.getByLabelText("scripts/verify.sh 源码")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "下载 scripts/verify.sh" })).toHaveAttribute(
      "download"
    );
  },
};
export const MobileResourcePolicy: Story = {
  ...ResourcePolicy,
  play: ResourcePolicy.play,
  globals: { viewport: { value: "playbookMobile", isRotated: false } },
};
export const NarrowResourcePolicy: Story = {
  ...MobileResourcePolicy,
  play: ResourcePolicy.play,
  globals: { viewport: { value: "playbookNarrowMobile", isRotated: false } },
};
export const DarkResourcePolicy: Story = {
  ...ResourcePolicy,
  play: ResourcePolicy.play,
  parameters: { dark: true },
};
export const MobileDarkResourcePolicy: Story = {
  ...MobileResourcePolicy,
  play: ResourcePolicy.play,
  parameters: { dark: true },
};
export const FullscreenResourcePolicy: Story = {
  ...ResourcePolicy,
  play: async (context) => {
    await ResourcePolicy.play?.(context);
    const canvas = within(context.canvasElement);
    const resources = canvas.getByRole("region", { name: "公开资源" });
    const preview = resources.querySelector(".playbook-file-window");
    const opener = within(resources).getByRole("button", { name: "放大公开资源" });
    const view = context.canvasElement.ownerDocument.defaultView;
    if (!view || !preview) throw new Error("Missing full-screen public resources");
    const pagePosition = view.scrollY;
    await userEvent.click(opener);
    const modal = canvas.getByRole("dialog", { name: "公开资源" });
    await waitFor(() => expect(modal.getAnimations()).toHaveLength(0), { timeout: 5000 });
    await expect(modal.contains(preview)).toBe(true);
    await expect(Math.abs(modal.getBoundingClientRect().width - view.innerWidth)).toBeLessThan(1);
    await expect(Math.abs(modal.getBoundingClientRect().height - view.innerHeight)).toBeLessThan(1);
    await expect(modal.getBoundingClientRect().top).toBe(0);
    await expect(opener).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "退出放大显示" }));
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(opener).toHaveFocus();
    await expect(Math.abs(view.scrollY - pagePosition)).toBeLessThan(1);
    await userEvent.click(opener);
    await waitFor(() => expect(modal.getAnimations()).toHaveLength(0), { timeout: 5000 });
  },
};
export const MobileFullscreenResourcePolicy: Story = {
  ...FullscreenResourcePolicy,
  play: FullscreenResourcePolicy.play,
  globals: MobileResourcePolicy.globals,
};
export const MobileDarkFullscreenResourcePolicy: Story = {
  ...MobileFullscreenResourcePolicy,
  play: FullscreenResourcePolicy.play,
  parameters: { dark: true },
};
export const TabletFullscreenResourcePolicy: Story = {
  ...FullscreenResourcePolicy,
  play: FullscreenResourcePolicy.play,
  globals: { viewport: { value: "playbookTablet", isRotated: false } },
};
export const TabletPolicyContents: Story = {
  ...ResourcePolicy,
  globals: { viewport: { value: "playbookCompactTablet", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvasElement.querySelector<HTMLElement>("[data-playbook-mobile-contents]");
    const body = canvasElement.querySelector<HTMLElement>("[data-playbook-body]");
    const view = canvasElement.ownerDocument.defaultView;
    if (!card || !body || !view) throw new Error("Missing tablet contents surface");
    await expect(within(card).getByRole("navigation", { name: "本页内容" })).toBeVisible();
    const style = view.getComputedStyle(card);
    const bodyStyle = view.getComputedStyle(body);
    await expect(style.borderRadius).toBe(bodyStyle.borderRadius);
    await expect(style.borderRadius).not.toBe("0px");
    await expect(style.borderTopWidth).toBe("1px");
    await expect(style.backgroundImage).toBe(bodyStyle.backgroundImage);
    await expect(style.boxShadow).toBe(bodyStyle.boxShadow);
    await expect(style.boxShadow).not.toBe("none");
    await expect(
      Math.abs(card.getBoundingClientRect().width - body.getBoundingClientRect().width)
    ).toBeLessThan(1);
    await expect(card.getBoundingClientRect().bottom).toBeLessThan(
      body.getBoundingClientRect().top
    );
    await expect(within(card).getByRole("link", { name: "公开资源", exact: true })).toHaveAttribute(
      "href",
      "#resources"
    );
    await expect(canvas.getByRole("region", { name: "公开资源" })).toBeInTheDocument();
    const header = canvasElement.querySelector<HTMLElement>("[data-public-header]");
    const offset = (header?.getBoundingClientRect().height ?? 112) + 24;
    view.scrollTo({
      top: card.getBoundingClientRect().top + view.scrollY - offset,
      behavior: "instant",
    });
  },
};
export const DarkTabletPolicyContents: Story = {
  ...TabletPolicyContents,
  play: TabletPolicyContents.play,
  parameters: { dark: true },
};
export const SkillFrontmatter: Story = {
  ...ResourcePolicy,
  beforeEach: () => {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  },
  play: async (context) => {
    await ResourcePolicy.play?.(context);
    const canvas = within(context.canvasElement);
    const resources = canvas.getByRole("region", { name: "公开资源" });
    await waitFor(() => expect(resources.querySelector("[data-enhanced='true']")).not.toBeNull());
    const height = resources.getBoundingClientRect().height;
    await userEvent.click(within(resources).getByRole("link", { name: "SKILL.md", exact: true }));
    await expect(Math.abs(resources.getBoundingClientRect().height - height)).toBeLessThan(2);
    const panel = resources.querySelector<HTMLElement>("[data-playbook-file-panel='0']");
    const reading = panel?.querySelector<HTMLElement>("[data-playbook-file-reading]");
    if (!panel || !reading) throw new Error("Missing Skill file preview");
    await expect(within(reading).getByRole("heading", { name: "发布规则" })).toBeVisible();
    await expect(within(reading).getByLabelText("文件元数据")).toHaveTextContent("Safe Release");
    await expect(within(reading).queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    const source = panel.querySelector("[data-playbook-file-source] code");
    await expect(source?.textContent).toContain('"name": "Safe Release"');
    await expect(source?.textContent?.startsWith("---\n")).toBe(true);
    await userEvent.click(within(panel).getByRole("button", { name: "源码", exact: true }));
    await expect(within(panel).getByLabelText("SKILL.md 源码")).toBeVisible();
    await expect(reading).not.toBeVisible();
    await expect(Math.abs(resources.getBoundingClientRect().height - height)).toBeLessThan(2);
    await userEvent.click(within(panel).getByRole("button", { name: "阅读", exact: true }));
    await expect(reading).toBeVisible();
    await expect(Math.abs(resources.getBoundingClientRect().height - height)).toBeLessThan(2);
    await expect(within(panel).getByRole("link", { name: "下载 SKILL.md" })).toHaveAttribute(
      "download"
    );
  },
};
export const DarkSkillFrontmatter: Story = {
  ...SkillFrontmatter,
  play: SkillFrontmatter.play,
  parameters: { dark: true },
};
export const MobileSkillFrontmatter: Story = {
  ...SkillFrontmatter,
  play: SkillFrontmatter.play,
  globals: { viewport: { value: "playbookMobile", isRotated: false } },
};
export const DesktopProject: Story = {
  ...Project,
  play: Project.play,
  globals: { viewport: { value: "playbookDesktop", isRotated: false } },
};

export const LongTopic: Story = {
  args: {
    path: "topics/delivery",
    edition: {
      ...edition,
      catalog: publicReadingFixtureCatalog,
      search: publicReadingFixtureSearch,
    },
  },
  globals: { viewport: { value: "playbookDesktop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const view = canvasElement.ownerDocument.defaultView;
    const outline = canvasElement.querySelector<HTMLElement>(
      "[data-playbook-desktop-contents] [data-playbook-contents-sticky]"
    );
    const body = canvasElement.querySelector<HTMLElement>("[data-playbook-body]");
    const header = canvasElement.ownerDocument.querySelector<HTMLElement>("[data-public-header]");
    const recovery = canvasElement.querySelector<HTMLElement>("#recovery");
    if (!view || !outline || !body || !header || !recovery)
      throw new Error("Missing reading layout");
    await expect(outline.getBoundingClientRect().left).toBeGreaterThan(
      body.getBoundingClientRect().right
    );
    view.scrollTo(0, body.getBoundingClientRect().top + view.scrollY + 500);
    await waitFor(() => {
      const top = Number.parseFloat(view.getComputedStyle(outline).top);
      expect(Math.abs(outline.getBoundingClientRect().top - top)).toBeLessThan(2);
      expect(top).toBeGreaterThan(header.getBoundingClientRect().bottom);
    });
    await userEvent.click(within(outline).getByRole("link", { name: "失败与恢复" }));
    await waitFor(() => {
      expect(recovery.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        header.getBoundingClientRect().bottom
      );
      expect(recovery.getBoundingClientRect().top).toBeLessThan(view.innerHeight);
    });
    view.scrollTo(0, 0);
  },
};

export const LongDarkTopic: Story = {
  ...LongTopic,
  parameters: { dark: true },
};

export const LongMobileTopic: Story = {
  ...LongTopic,
  play: Topic.play,
  globals: { viewport: { value: "playbookMobile", isRotated: false } },
};

export const LongMobileDarkTopic: Story = {
  ...LongMobileTopic,
  parameters: { dark: true },
};

export const LongTabletTopic: Story = {
  ...LongTopic,
  globals: { viewport: { value: "playbookTablet", isRotated: false } },
};

async function showMobileFloatingNavigation(canvasElement: HTMLElement) {
  const doc = canvasElement.ownerDocument;
  const view = doc.defaultView;
  const card = canvasElement.querySelector<HTMLElement>("[data-playbook-mobile-contents]");
  const floating = doc.querySelector<HTMLElement>("[data-playbook-floating-controls]");
  if (!view || !card || !floating) throw new Error("Missing mobile reading navigation");
  view.scrollTo({
    top: card.getBoundingClientRect().bottom + view.scrollY + 24,
    behavior: "instant",
  });
  await waitFor(() => expect(floating).toHaveAttribute("data-phase", "settled"), { timeout: 5000 });
  return { doc, view, card, floating };
}

export const MobileInlineContents: Story = {
  ...LongMobileTopic,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const view = doc.defaultView;
    const card = canvasElement.querySelector<HTMLElement>("[data-playbook-mobile-contents]");
    const body = canvasElement.querySelector<HTMLElement>("[data-playbook-body]");
    if (!view || !card || !body) throw new Error("Missing inline directory");
    await expect(card.getBoundingClientRect().bottom).toBeLessThan(
      body.getBoundingClientRect().top
    );
    view.scrollTo({
      top: card.getBoundingClientRect().top + view.scrollY - 24,
      behavior: "instant",
    });
    await expect(within(card).getByRole("navigation", { name: "本页内容" })).toBeVisible();
    const style = view.getComputedStyle(card);
    await expect(style.borderRadius).toBe("0px");
    await expect(style.borderWidth).toBe("0px");
    await expect(style.boxShadow).toBe("none");
    await expect(Math.abs(card.getBoundingClientRect().left)).toBeLessThanOrEqual(1);
    await expect(card.getBoundingClientRect().right).toBe(doc.documentElement.clientWidth);
    const links = within(card).getAllByRole("link");
    await expect(
      links[1].getBoundingClientRect().top - links[0].getBoundingClientRect().top
    ).toBeLessThanOrEqual(32);
    const child = within(card).getByRole("link", { name: "先确定发布对象" });
    await expect(child).toHaveAttribute("data-playbook-contents-depth", "1");
    const childLabel = child.querySelector(".playbook-contents-label");
    const parentLabel = links[0].querySelector(".playbook-contents-label");
    if (!childLabel || !parentLabel) throw new Error("Missing outline labels");
    await expect(childLabel.getBoundingClientRect().left).toBeGreaterThan(
      parentLabel.getBoundingClientRect().left
    );
    for (const link of links) {
      await expect(doc.getElementById(decodeURIComponent(link.hash.slice(1)))).toBeInTheDocument();
    }
    await expect(doc.querySelector("[data-playbook-floating-controls]")).not.toBeVisible();
  },
};

async function exerciseMobileFloatingNavigation({ canvasElement }: { canvasElement: HTMLElement }) {
  const { doc, view, card, floating } = await showMobileFloatingNavigation(canvasElement);
  const controls = within(floating);
  const group = controls.getByRole("group", { name: "阅读导航" });
  await expect(within(group).getAllByRole("button")).toHaveLength(2);
  for (const button of within(group).getAllByRole("button")) {
    await expect(button.querySelector("svg")).toBeInTheDocument();
  }
  await expect(floating.parentElement).toBe(doc.body);
  const dock = floating.getBoundingClientRect();
  await expect(dock.right).toBeLessThanOrEqual(doc.documentElement.clientWidth - 16);
  await expect(dock.bottom).toBeLessThanOrEqual(view.innerHeight - 16);

  await userEvent.click(controls.getByRole("button", { name: "打开目录" }));
  const panel = controls.getByRole("region", { name: "悬浮目录" });
  await waitFor(
    () => {
      expect(panel).toBeVisible();
      expect(panel.getAnimations().every((animation) => animation.playState === "finished")).toBe(
        true
      );
    },
    { timeout: 5000 }
  );
  await expect(controls.getByRole("button", { name: "收起目录" })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  const panelRect = panel.getBoundingClientRect();
  await expect(panelRect.width).toBeGreaterThanOrEqual(200);
  await expect(panelRect.width).toBeLessThanOrEqual(doc.documentElement.clientWidth - 32);
  await expect(panelRect.left).toBeGreaterThanOrEqual(16);
  await expect(panelRect.bottom).toBeLessThan(dock.top);
  await userEvent.keyboard("{Escape}");
  await expect(controls.getByRole("button", { name: "打开目录" })).toHaveFocus();
  await expect(panel).toHaveAttribute("aria-hidden", "true");

  await userEvent.click(controls.getByRole("button", { name: "打开目录" }));
  const recoveryLink = within(panel).getByRole("link", { name: "失败与恢复" });
  recoveryLink.scrollIntoView({ block: "nearest", behavior: "instant" });
  await userEvent.click(recoveryLink);
  const target = doc.getElementById("recovery");
  if (!target) throw new Error("Missing recovery section");
  await waitFor(
    () => {
      expect(target.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
      expect(target.getBoundingClientRect().top).toBeLessThan(view.innerHeight);
      expect(doc.activeElement).toBe(target);
    },
    { timeout: 5000 }
  );
  await expect(floating).toHaveAttribute("data-open", "false");
  await userEvent.click(controls.getByRole("button", { name: "回到顶部" }));
  await waitFor(
    () => {
      expect(view.scrollY).toBe(0);
      expect(floating.hidden).toBe(true);
    },
    { timeout: 5000 }
  );
  await expect(card).toBeVisible();
  await showMobileFloatingNavigation(canvasElement);
  await expect(floating).toHaveAttribute("data-open", "false");
}

export const MobileContentsHierarchy: Story = {
  ...LongMobileTopic,
  play: async (context) => {
    await MobileInlineContents.play?.(context);
    const doc = context.canvasElement.ownerDocument;
    const view = doc.defaultView;
    const inline = context.canvasElement.querySelector<HTMLElement>(
      "[data-playbook-mobile-contents]"
    );
    if (!view || !inline) throw new Error("Missing reading outline");
    const child = within(inline).getByRole("link", { name: "先确定发布对象" });
    await userEvent.click(child);
    await waitFor(() => expect(child).toHaveAttribute("aria-current", "location"), {
      timeout: 5000,
    });
    const target = doc.getElementById(decodeURIComponent(child.hash.slice(1)));
    if (!target) throw new Error("Missing nested heading");
    await expect(target.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    const floating = doc.querySelector<HTMLElement>("[data-playbook-floating-controls]");
    if (!floating) throw new Error("Missing floating outline");
    await waitFor(() => expect(floating).toHaveAttribute("data-phase", "settled"), {
      timeout: 5000,
    });
    await userEvent.click(within(floating).getByRole("button", { name: "打开目录" }));
    const current = within(floating).getByRole("link", { name: "先确定发布对象" });
    await expect(current).toHaveAttribute("aria-current", "location");
    await expect(current).toHaveFocus();
    await expect(within(floating).getByRole("link", { name: "稳定发布" })).toHaveAttribute(
      "data-active-parent",
      "true"
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(floating).getByRole("button", { name: "回到顶部" }));
    await waitFor(() => expect(floating.hidden).toBe(true), { timeout: 5000 });
    view.scrollTo({
      top: inline.getBoundingClientRect().top + view.scrollY - 24,
      behavior: "instant",
    });
  },
};

export const MobileNumberedContents: Story = {
  ...MobileInlineContents,
  play: async (context) => {
    const inline = context.canvasElement.querySelector<HTMLElement>(
      "[data-playbook-mobile-contents]"
    );
    if (!inline) throw new Error("Missing numbered outline");
    await expect(within(inline).getByRole("link", { name: "1. 稳定发布" })).toBeVisible();
    await expect(within(inline).getByRole("link", { name: "1.1 先确定发布对象" })).toBeVisible();
  },
  args: {
    ...LongMobileTopic.args,
    edition: {
      ...edition,
      catalog: {
        ...publicReadingFixtureCatalog,
        topic_details: publicReadingFixtureCatalog.topic_details.map((topic) => ({
          ...topic,
          sections: topic.sections.map((section, index) =>
            index === 0
              ? {
                  ...section,
                  title: "1. 稳定发布",
                  markdown: section.markdown.replace(
                    "### 先确定发布对象",
                    "### 1.1 先确定发布对象"
                  ),
                }
              : section
          ),
        })),
      },
      search: publicReadingFixtureSearch,
    },
  },
};

export const MobileFloatingNavigation: Story = {
  ...LongMobileTopic,
  play: exerciseMobileFloatingNavigation,
};

export const MobileFloatingContents: Story = {
  ...MobileFloatingNavigation,
  play: async (context) => {
    await exerciseMobileFloatingNavigation(context);
    const floating = context.canvasElement.ownerDocument.querySelector<HTMLElement>(
      "[data-playbook-floating-controls]"
    );
    if (!floating) throw new Error("Missing floating controls");
    await userEvent.click(within(floating).getByRole("button", { name: "打开目录" }));
    await expect(floating).toHaveAttribute("data-open", "true");
  },
};

export const MobileDarkFloatingContents: Story = {
  ...MobileFloatingContents,
  play: MobileFloatingContents.play,
  parameters: { dark: true },
};

export const NarrowMobileFloatingContents: Story = {
  ...MobileFloatingContents,
  play: MobileFloatingContents.play,
  globals: { viewport: { value: "playbookNarrowMobile", isRotated: false } },
};

export const MobileLongContents: Story = {
  ...MobileFloatingContents,
  play: MobileFloatingContents.play,
  args: {
    ...LongMobileTopic.args,
    edition: {
      ...edition,
      catalog: {
        ...publicReadingFixtureCatalog,
        topic_details: publicReadingFixtureCatalog.topic_details.map((topic) => ({
          ...topic,
          sections: topic.sections.map((section) =>
            section.id === "release"
              ? { ...section, title: "稳定发布：固定输入、来源核对与完整的公开产物验证" }
              : section
          ),
        })),
      },
      search: publicReadingFixtureSearch,
    },
  },
};
