import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { expect, within } from "storybook/test";
import { publicFixtureCatalog, publicFixtureSearch } from "@/lib/playbook/fixture";
import type { PlaybookEdition } from "@/lib/playbook/types";
import { PublicStoryHeader } from "../common/PublicStoryHeader";
import PlaybookPage from "./PlaybookPage";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";

function StoryFrame({ children, dark }: { children: React.ReactNode; dark: boolean }) {
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
    await expect(
      within(canvasElement).getByRole("heading", { name: "执念", level: 1 })
    ).toBeVisible();
  },
};
export const Topics: Story = { args: { path: "topics" } };
export const Topic: Story = {
  args: { path: "topics/delivery" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "稳定发布" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Sample Project" })).toBeVisible();
  },
};
export const Project: Story = { args: { path: "projects/sample-project" } };
export const Policy: Story = {
  args: { path: "policies/safe-release" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "下载 SKILL.md" })).toBeVisible();
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
  globals: { viewport: { value: "playbookMobile", isRotated: false } },
};
export const DarkTopic: Story = { ...Topic, parameters: { dark: true } };
export const MobileDarkPolicy: Story = {
  ...Policy,
  parameters: { dark: true },
  globals: { viewport: { value: "playbookMobile", isRotated: false } },
};
export const DesktopTopic: Story = {
  ...Topic,
  globals: { viewport: { value: "playbookDesktop", isRotated: false } },
};
export const DesktopDarkTopic: Story = {
  ...DarkTopic,
  globals: { viewport: { value: "playbookDesktop", isRotated: false } },
};
