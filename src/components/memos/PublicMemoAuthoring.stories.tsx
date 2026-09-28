import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useEffect, useLayoutEffect, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";
import { PublicStoryHeader } from "@/components/common/PublicStoryHeader";
import { IconifyProvider } from "@/components/providers/IconifyProvider";
import Icon from "@/components/ui/Icon";
import { PublicMemoComposerIsland } from "../../../site/components/PublicMemoAuthoring";
import { QuickMemoEditModal } from "./QuickMemoEditModal";
import { QuickMemoEditor } from "./QuickMemoEditor";

type MemoRecord = {
  id: string;
  slug: string;
  title?: string;
  content: string;
  excerpt?: string;
  isPublic: boolean;
  tags: string[];
};

const detailMemo: MemoRecord = {
  id: "memo-detail-1",
  slug: "memo-detail-1",
  title: "Admin live detail shell",
  content:
    "# Admin live detail shell\n\n- Keeps the public article frame.\n- Adds edit/delete controls for admins.\n- Hides the static snapshot while the live detail is active.",
  isPublic: false,
  tags: ["preview", "controls"],
};

const meta = {
  title: "Public/Memo Authoring",
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
          "Public memo authoring states for the shared admin/public shell: realtime list, live detail controls, and the quick edit modal.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function PublicShell({
  children,
  theme = "light",
  compact = false,
  wide = false,
}: {
  children: ReactNode;
  theme?: "light" | "dark";
  compact?: boolean;
  wide?: boolean;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previousPreference = root.dataset.uiPreference;
    const previousTheme = root.dataset.uiTheme;
    const previousDataTheme = root.dataset.theme;
    const previousColorScheme = root.style.colorScheme;
    const previousDark = root.classList.contains("dark");

    root.dataset.uiPreference = theme;
    root.dataset.uiTheme = theme;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.classList.toggle("dark", theme === "dark");

    return () => {
      if (previousPreference) root.dataset.uiPreference = previousPreference;
      else delete root.dataset.uiPreference;
      if (previousTheme) root.dataset.uiTheme = previousTheme;
      else delete root.dataset.uiTheme;
      if (previousDataTheme) root.dataset.theme = previousDataTheme;
      else delete root.dataset.theme;
      root.style.colorScheme = previousColorScheme;
      root.classList.toggle("dark", previousDark);
    };
  }, [theme]);

  return (
    <div
      className={`nature-app-shell min-h-screen bg-[color:var(--nature-bg)] text-[color:var(--nature-text)] ${
        compact ? "mx-auto max-w-[390px]" : ""
      }`}
      data-ui-theme={theme}
      data-theme={theme}
    >
      <main className="nature-main py-10">
        <div className={`${wide ? "nature-container" : "nature-reading-container"} space-y-8`}>
          {children}
        </div>
      </main>
    </div>
  );
}

function LiveMemoDetailStory() {
  return (
    <PublicShell>
      <section className="mb-6 space-y-4" data-testid="public-memo-detail-controls">
        <div className="nature-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
              <span className="nature-chip nature-chip-info">Admin view</span>
              <span>管理员作者视图</span>
            </div>
            <p className="text-sm text-[color:var(--nature-text-soft)]">
              Current body comes from the live `/api/public/memos/:slug` response while the static
              snapshot stays hidden.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="nature-button nature-button-outline">
              刷新当前内容
            </button>
            <a
              className="nature-button nature-button-outline"
              href={`/admin/preview/memos/${detailMemo.slug}`}
            >
              打开专用预览
            </a>
            <button type="button" className="nature-button">
              编辑 Memo
            </button>
            <button
              type="button"
              className="nature-button nature-button-danger"
              data-testid="admin-live-memo-delete"
            >
              删除 Memo
            </button>
          </div>
        </div>

        <article>
          <div className="nature-panel px-6 py-7 sm:px-8" data-testid="public-memo-detail-card">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--nature-text-soft)]">
              <span className="nature-chip nature-chip-warn">Draft / Private</span>
              <span className="nature-chip gap-1">Memo</span>
            </div>
            <h1 className="nature-title mt-5 text-4xl font-semibold leading-tight tracking-[-0.04em]">
              {detailMemo.title}
            </h1>
            <div className="mt-5 flex flex-wrap gap-2">
              {detailMemo.tags.map((tag) => (
                <span key={tag} className="nature-chip">
                  #{tag}
                </span>
              ))}
            </div>
            <div
              className="mt-6 space-y-3 text-[color:var(--nature-text)]"
              data-testid="public-memo-detail-body"
            >
              <h2 className="text-2xl font-semibold">Admin live detail shell</h2>
              <ul className="list-disc space-y-2 pl-6 text-[color:var(--nature-text-soft)]">
                <li>Keeps the public memo reading shell intact.</li>
                <li>Surfaces edit/delete controls in the same viewport.</li>
                <li>Preserves public/draft status chips above the body content.</li>
              </ul>
            </div>
          </div>
        </article>
      </section>
    </PublicShell>
  );
}

function QuickEditModalStory({
  theme = "light",
  compact = true,
}: {
  theme?: "light" | "dark";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(false);

  return (
    <PublicShell compact={compact} theme={theme}>
      <div className="nature-panel px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--nature-text-strong)]">
              Quick memo modal
            </h2>
            <p className="text-sm text-[color:var(--nature-text-soft)]">
              This story keeps the modal open on a public-surface shell so spacing and controls stay
              reviewable.
            </p>
          </div>
          <button
            type="button"
            className="nature-button nature-button-outline"
            onClick={() => setOpen(true)}
          >
            打开编辑器
          </button>
        </div>
      </div>

      {saved ? (
        <div className="nature-alert nature-alert-success">
          <span>Mock save completed for the quick memo modal state.</span>
        </div>
      ) : null}

      <QuickMemoEditModal
        open={open}
        onClose={() => setOpen(false)}
        memoTitle="Admin live detail shell"
        initialContent={
          "# Admin live detail shell\n\nThis quick edit modal keeps the current memo content in place while editing."
        }
        initialIsPublic={false}
        onSave={async () => {
          setSaved(true);
          setOpen(false);
        }}
      />
    </PublicShell>
  );
}

function QuickPublishStory({ theme = "light" }: { theme?: "light" | "dark" }) {
  return (
    <PublicShell theme={theme} wide>
      <section className="px-2 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 text-center sm:mb-12">
          <span className="nature-kicker justify-center">Flow Notes</span>
          <h1 className="nature-title mt-4 text-4xl sm:text-5xl">Memos</h1>
          <p className="nature-muted mx-auto mt-4 max-w-2xl text-base sm:text-lg">
            记录想法、灵感和日常思考的快速笔记
          </p>
        </div>

        <div className="mb-3 flex items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
          <span className="nature-chip nature-chip-info">管理员模式</span>
        </div>
        <QuickMemoEditor
          onSave={async () => undefined}
          localSourceEnabled={true}
          className="mb-0 sm:mb-0"
        />
      </section>
    </PublicShell>
  );
}

type AdminPageScenario = "default" | "list-error" | "create-error" | "guest";

function createAdminPageMemos(): MemoRecord[] {
  return Array.from({ length: 12 }, (_, index) => {
    const id = `admin-story-memo-${index + 1}`;
    const isTitleless = index === 1;
    const isLongTitle = index === 0;
    const title = isTitleless
      ? null
      : isLongTitle
        ? "在响应式页面中协调编辑器状态、服务端游标与公开快照的完整记录"
        : `管理员实时 Memo ${String(index + 1).padStart(2, "0")}`;
    return {
      id,
      slug: `admin-story-memo-${index + 1}`,
      title: title ?? undefined,
      excerpt: isTitleless
        ? "没有标题时继续展示摘要、标签和操作，不用 slug 代替标题。"
        : `这是一条用于检查卡片信息层级和操作位置的 Memo 摘要 ${index + 1}。`,
      content: `${title ? `# ${title}\n\n` : ""}用于验证管理员原位编辑与预览行为。\n\n当前内容编号：${index + 1}。`,
      isPublic: index !== 2,
      tags: index === 0 ? ["前端/React", "状态管理", "公开快照"] : ["闪念", `主题-${index + 1}`],
    };
  });
}

function AdminPageFallback({
  theme = "light",
  scenario = "default",
}: {
  theme?: "light" | "dark";
  scenario?: AdminPageScenario;
}) {
  const [timelineMemo] = useState({
    title: "公开时间线示例",
    excerpt: "公开时间线仍显示上次发布的快照。",
  });

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousPreference = root.dataset.uiPreference;
    const previousTheme = root.dataset.uiTheme;
    const previousDataTheme = root.dataset.theme;
    const previousColorScheme = root.style.colorScheme;
    const previousDark = root.classList.contains("dark");
    const originalFetch = window.fetch.bind(window);
    const memos = createAdminPageMemos();
    let failNextCreation = scenario === "create-error";

    root.dataset.uiPreference = theme;
    root.dataset.uiTheme = theme;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.classList.toggle("dark", theme === "dark");

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(rawUrl, window.location.origin);
      const method = init?.method?.toUpperCase() ?? "GET";
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });

      if (url.pathname === "/api/public/auth/me") {
        return json(
          scenario === "guest"
            ? null
            : {
                id: "storybook-admin",
                nickname: "Admin",
                email: "admin@example.test",
                avatarUrl: "",
                isAdmin: true,
              }
        );
      }

      if (url.pathname === "/api/public/memos" && method === "GET") {
        if (scenario === "list-error") {
          return json({ error: "Storybook 模拟列表读取失败" }, 503);
        }
        const start = Number(url.searchParams.get("cursor")?.replace("cursor-", "") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 10);
        const page = memos.slice(start, start + limit);
        const next = start + page.length;
        return json({
          memos: page,
          hasMore: next < memos.length,
          nextCursor: next < memos.length ? `cursor-${next}` : null,
        });
      }

      const memoMatch = url.pathname.match(/^\/api\/public\/memos\/([^/]+)$/);
      if (memoMatch && method === "GET") {
        const slug = decodeURIComponent(memoMatch[1]);
        const memo = memos.find((item) => item.slug === slug);
        return memo ? json(memo) : json({ error: "Memo not found" }, 404);
      }
      if (url.pathname === "/api/public/memos" && method === "POST") {
        if (failNextCreation) {
          failNextCreation = false;
          return json({ error: "Storybook 模拟发布失败" }, 503);
        }
        const data = JSON.parse(String(init?.body ?? "{}")) as {
          content: string;
          isPublic: boolean;
          tags: string[];
        };
        const title = data.content.match(/^#\s+(.+)$/m)?.[1] ?? undefined;
        const created = {
          id: "admin-story-created-memo",
          slug: "admin-story-created-memo",
          title,
          content: data.content,
          excerpt: data.content.slice(0, 110),
          isPublic: data.isPublic,
          tags: data.tags,
        } satisfies MemoRecord;
        memos.unshift(created);
        return json(created, 201);
      }
      if (memoMatch && method === "PATCH") {
        const slug = decodeURIComponent(memoMatch[1]);
        const data = JSON.parse(String(init?.body ?? "{}")) as Partial<MemoRecord>;
        const index = memos.findIndex((memo) => memo.slug === slug);
        if (index < 0) return json({ error: "Memo not found" }, 404);
        memos[index] = { ...memos[index], ...data };
        return json(memos[index]);
      }

      return originalFetch(input, init);
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
      if (previousPreference) root.dataset.uiPreference = previousPreference;
      else delete root.dataset.uiPreference;
      if (previousTheme) root.dataset.uiTheme = previousTheme;
      else delete root.dataset.uiTheme;
      if (previousDataTheme) root.dataset.theme = previousDataTheme;
      else delete root.dataset.theme;
      root.style.colorScheme = previousColorScheme;
      root.classList.toggle("dark", previousDark);
    };
  }, [scenario, theme]);

  return (
    <div
      className="nature-app-shell flex min-h-screen flex-col bg-[color:var(--nature-bg)] text-[color:var(--nature-text)]"
      data-testid="memo-admin-page-story"
    >
      <IconifyProvider />
      <PublicStoryHeader activeHref="/memos" />
      <main className="nature-main flex-1">
        <div className="nature-container px-1 py-8 sm:px-6 sm:py-12 lg:py-16">
          <header className="mb-8 text-center sm:mb-12">
            <span className="nature-kicker justify-center">Flow Notes</span>
            <h1 className="nature-title mt-4 text-4xl sm:text-5xl lg:text-6xl">Memos</h1>
            <p className="nature-muted mx-auto mt-4 max-w-2xl text-base sm:text-lg">
              记录想法、灵感和日常思考的快速笔记
            </p>
          </header>

          <PublicMemoComposerIsland localSourceEnabled={false} />

          <section
            className="memos-list nature-timeline nature-mobile-reading-stream"
            data-testid="memos-timeline"
          >
            <article className="nature-timeline-item nature-mobile-reading-row" data-is-last="true">
              <div className="nature-timeline-rail" aria-hidden="true" />
              <div className="nature-timeline-content">
                <div className="nature-panel nature-timeline-card px-4 py-4 sm:px-6 sm:py-5">
                  <div className="mb-3 flex items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
                    <span className="nature-timeline-type-icon inline-flex h-6 w-6 items-center justify-center rounded-full bg-[rgba(var(--nature-secondary-rgb),0.16)] text-[color:var(--nature-secondary)]">
                      <Icon name="tabler:bulb" className="h-3.5 w-3.5" />
                    </span>
                    <time dateTime="2026-09-29">2026年9月29日</time>
                  </div>
                  <h2 className="nature-title text-xl font-semibold">{timelineMemo.title}</h2>
                  <p className="nature-muted mt-3 text-base leading-7">{timelineMemo.excerpt}</p>
                </div>
              </div>
            </article>
          </section>
        </div>
      </main>
    </div>
  );
}

export const LiveDetailControls: Story = {
  name: "详情控制",
  render: () => <LiveMemoDetailStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("public-memo-detail-controls")).toBeVisible();
    await expect(canvas.getByTestId("admin-live-memo-delete")).toBeVisible();
    for (const action of canvasElement.querySelectorAll(".nature-button")) {
      expect(action.getBoundingClientRect().height).toBe(36);
    }
    await expect(canvas.getByTestId("public-memo-detail-body")).toContainText(
      "Keeps the public memo reading shell intact."
    );
  },
};

export const QuickEditModal: Story = {
  name: "快速编辑弹窗",
  render: () => <QuickEditModalStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = canvas.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByTestId("quick-memo-visibility-switch")).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "关闭快速编辑" }));
    await userEvent.click(canvas.getByRole("button", { name: "打开编辑器" }));
    await expect(canvas.getByRole("dialog")).toBeVisible();
  },
};

export const QuickEditModalDark: Story = {
  name: "快速编辑弹窗（暗色）",
  render: () => <QuickEditModalStory theme="dark" compact={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = canvas.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByTestId("quick-memo-edit-editor")).toBeVisible();
    expect(dialog.querySelector(".milkdown")).not.toBeNull();
    await expect(within(dialog).getByTestId("quick-memo-visibility-switch")).toBeVisible();
  },
};

export const QuickPublishDark: Story = {
  name: "快速发布（暗色）",
  render: () => <QuickPublishStory theme="dark" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByTestId("quick-memo-editor");
    await expect(editor).toBeVisible();
    expect(editor.querySelector(".milkdown")).not.toBeNull();
    expect(editor.querySelector(".ProseMirror")).not.toBeNull();
  },
};

export const AdminPageFallbackStory: Story = {
  name: "管理员闪念页（桌面浅色）",
  globals: { viewport: { value: "memoDesktop", isRotated: false } },
  parameters: {
    docs: {
      description: {
        story:
          "完整公共 Memos 页面壳，管理员岛直接使用生产组件；Storybook fetch mock 提供 10 条首屏、长标题、无标题、私有态和游标续载。",
      },
    },
  },
  render: () => <AdminPageFallback />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Memos", exact: true })).toBeVisible();
    await expect(await canvas.findByTestId("quick-memo-editor")).toBeVisible();
    await expect(canvas.getByTestId("memos-timeline")).toBeVisible();
    await waitFor(() => expect(canvas.getAllByTestId("admin-live-memo-card")).toHaveLength(10));
    await expect(
      canvas.queryByRole("searchbox", { name: "搜索实时 Memo" })
    ).not.toBeInTheDocument();

    const titlelessMemo = canvasElement.querySelector<HTMLElement>(
      '[data-slug="admin-story-memo-2"]'
    );
    if (!titlelessMemo) throw new Error("Titleless memo did not render");
    await expect(within(titlelessMemo).queryByRole("heading")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("private-indicator")).toHaveTextContent("Draft / Private");

    const quickEditor = canvas.getByTestId("quick-memo-editor");
    const editor = quickEditor.querySelector<HTMLElement>(".ProseMirror");
    if (!editor) throw new Error("Quick memo editor surface did not render");
    const visibility = canvas.getByTestId("quick-memo-visibility-input");
    editor.focus();
    await userEvent.keyboard("{Tab}");
    expect(canvasElement.ownerDocument.activeElement).toBe(visibility);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(canvasElement.ownerDocument.activeElement).toBe(editor);

    await userEvent.click(canvas.getByRole("button", { name: "加载更多" }));
    await waitFor(() => expect(canvas.getAllByTestId("admin-live-memo-card")).toHaveLength(12));

    const firstCard = canvas.getAllByTestId("admin-live-memo-card")[0];
    if (!firstCard) throw new Error("First admin memo card did not render");
    const editTrigger = within(firstCard).getByTestId("admin-live-memo-edit");
    await userEvent.click(editTrigger);
    const dialog = await canvas.findByRole("dialog", { name: "快速编辑 Memo" });
    const dialogEditor = dialog.querySelector<HTMLElement>(".ProseMirror");
    if (!dialogEditor) throw new Error("Quick memo edit dialog surface did not render");
    await expect(dialogEditor).toBeVisible();
    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(dialogEditor));
    await userEvent.click(within(dialog).getByRole("button", { name: "保存更改" }));
    await waitFor(() =>
      expect(canvas.queryByRole("dialog", { name: "快速编辑 Memo" })).not.toBeInTheDocument()
    );
    await waitFor(() => expect(canvasElement.ownerDocument.activeElement).toBe(editTrigger));
  },
};

export const AdminPageFallbackVisualLight: Story = {
  name: "管理员闪念页（桌面浅色视觉证据）",
  globals: { viewport: { value: "memoDesktop", isRotated: false } },
  render: () => <AdminPageFallback />,
};

export const AdminPageFallbackDark: Story = {
  name: "管理员闪念页（桌面暗色）",
  globals: { viewport: { value: "memoDesktop", isRotated: false } },
  render: () => <AdminPageFallback theme="dark" />,
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByTestId("quick-memo-editor")).toBeVisible();
    await expect(within(canvasElement).getByTestId("memos-timeline")).toBeVisible();
  },
};

export const AdminPageFallback393: Story = {
  name: "管理员闪念页（393px）",
  globals: { viewport: { value: "memo393", isRotated: false } },
  render: () => <AdminPageFallback />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId("quick-memo-editor")).toBeVisible();
    const view = canvasElement.ownerDocument.defaultView;
    expect(view?.innerWidth).toBe(393);
    const shell = canvasElement.querySelector<HTMLElement>("[data-testid='memo-admin-page-story']");
    const quickEditor = canvasElement.querySelector<HTMLElement>(
      "[data-testid='quick-memo-editor']"
    );
    if (!shell || !quickEditor) throw new Error("Memo admin page or editor did not render");
    expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth);
    expect(quickEditor.scrollWidth).toBeLessThanOrEqual(quickEditor.clientWidth);
    const editorSurface = quickEditor.querySelector<HTMLElement>(
      "[data-testid='quick-memo-editor-surface']"
    );
    if (!editorSurface) throw new Error("Quick memo editor surface did not render");
    expect(editorSurface.scrollWidth).toBeLessThanOrEqual(editorSurface.clientWidth);
    const visibilityLabel = quickEditor.querySelector<HTMLElement>(
      "[data-testid='quick-memo-visibility-label']"
    );
    const submit = quickEditor.querySelector<HTMLElement>('button[type="submit"]');
    if (!visibilityLabel || !submit) throw new Error("Quick editor controls did not render");
    expect(visibilityLabel.getBoundingClientRect().height).toBeLessThanOrEqual(20);
    expect(submit.getBoundingClientRect().height).toBeLessThanOrEqual(52);
    await waitFor(() =>
      expect(within(canvasElement).getAllByTestId("admin-live-memo-card")).toHaveLength(10)
    );
  },
};

export const AdminPageFallback320: Story = {
  name: "管理员闪念页（320px）",
  globals: { viewport: { value: "memo320", isRotated: false } },
  render: () => <AdminPageFallback />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId("quick-memo-editor")).toBeVisible();
    const view = canvasElement.ownerDocument.defaultView;
    expect(view?.innerWidth).toBe(320);
    const shell = canvasElement.querySelector<HTMLElement>("[data-testid='memo-admin-page-story']");
    if (!shell) throw new Error("Memo admin page did not render");
    expect(shell.scrollWidth).toBeLessThanOrEqual(shell.clientWidth);
    const quickEditor = canvasElement.querySelector<HTMLElement>(
      "[data-testid='quick-memo-editor']"
    );
    const editorSurface = quickEditor?.querySelector<HTMLElement>(
      "[data-testid='quick-memo-editor-surface']"
    );
    const visibilityLabel = quickEditor?.querySelector<HTMLElement>(
      "[data-testid='quick-memo-visibility-label']"
    );
    const submit = quickEditor?.querySelector<HTMLElement>('button[type="submit"]');
    if (!editorSurface || !visibilityLabel || !submit) {
      throw new Error("Quick editor controls did not render");
    }
    expect(editorSurface.scrollWidth).toBeLessThanOrEqual(editorSurface.clientWidth);
    expect(visibilityLabel.getBoundingClientRect().height).toBeLessThanOrEqual(20);
    expect(submit.getBoundingClientRect().height).toBeLessThanOrEqual(52);
    await waitFor(() =>
      expect(within(canvasElement).getAllByTestId("admin-live-memo-card")).toHaveLength(10)
    );
  },
};

export const AdminPageListError: Story = {
  name: "管理员闪念页（列表错误）",
  globals: { viewport: { value: "memoDesktop", isRotated: false } },
  render: () => <AdminPageFallback scenario="list-error" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = await canvas.findByRole("alert");
    await expect(alert).toContainText("Storybook 模拟列表读取失败");
    await expect(canvas.getByRole("button", { name: "重试" })).toBeVisible();
    await expect(await canvas.findByTestId("quick-memo-editor")).toBeVisible();
    await expect(canvas.getByTestId("memos-timeline")).toBeVisible();
  },
};

export const AdminPageCreateError: Story = {
  name: "管理员闪念页（发布重试）",
  globals: { viewport: { value: "memoDesktop", isRotated: false } },
  render: () => <AdminPageFallback scenario="create-error" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const quickEditor = await canvas.findByTestId("quick-memo-editor");
    const editor = quickEditor.querySelector<HTMLElement>(".ProseMirror");
    if (!editor) throw new Error("Quick memo editor surface did not render");
    const content = "Storybook 创建失败后仍保留输入并允许重试";
    await userEvent.click(editor);
    await userEvent.keyboard(content);

    const submit = canvas.getByRole("button", { name: "公开发布 Memo" });
    await userEvent.click(submit);
    const error = await canvas.findByRole("alert");
    await expect(error).toContainText("Storybook 模拟发布失败");
    await expect(error).toContainText("请检查内容后重试");
    await expect(editor).toContainText(content);
    await expect(submit).toBeEnabled();

    await userEvent.click(submit);
    await expect(canvas.getByRole("status")).toHaveText(
      "公开 Memo 已保存；公开时间线将在下次发布后更新。"
    );
    await expect(editor).not.toContainText(content);
  },
};

export const AdminPageGuest: Story = {
  name: "访客公共页面",
  globals: { viewport: { value: "memoDesktop", isRotated: false } },
  render: () => <AdminPageFallback scenario="guest" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Memos", exact: true })).toBeVisible();
    await waitFor(() => expect(canvas.queryByText("正在打开页面")).not.toBeInTheDocument());
    await expect(canvas.queryByTestId("quick-memo-editor")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("memos-timeline")).toBeVisible();
  },
};
