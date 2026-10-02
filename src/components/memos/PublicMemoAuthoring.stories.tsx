import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useEffect, useLayoutEffect, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import "@/styles/globals.css";
import "@/styles/nature-restored.css";
import { PublicMemoDetailControlsIsland } from "../../../site/components/PublicMemoAuthoring";
import { QuickMemoEditModal } from "./QuickMemoEditModal";
import { QuickMemoEditor } from "./QuickMemoEditor";

type MemoRecord = {
  id: string;
  slug: string;
  title?: string | null;
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

function TitlelessLiveMemoDetailStory() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(rawUrl, window.location.origin);
      const method = init?.method?.toUpperCase() ?? "GET";
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

      if (url.pathname === "/api/public/auth/me") {
        return json({
          id: "storybook-admin",
          nickname: "Admin",
          email: "admin@example.test",
          avatarUrl: "",
          isAdmin: true,
        });
      }
      if (url.pathname === "/api/public/memos/titleless-detail-story" && method === "GET") {
        return json({
          id: "memos/titleless-detail-story.md",
          slug: "titleless-detail-story",
          title: null,
          content: "A titleless live memo body remains visible without a display title.",
          excerpt: "A titleless live memo body remains visible without a display title.",
          isPublic: true,
          tags: ["titleless"],
          filePath: "memos/titleless-detail-story.md",
        });
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <PublicShell>
      <PublicMemoDetailControlsIsland slug="titleless-detail-story" />
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

function QuickPublishEmptyDarkStory() {
  return (
    <PublicShell theme="dark" wide>
      <div
        className="mx-auto w-full max-w-5xl bg-[color:var(--nature-bg)] p-6"
        data-visual-evidence-surface
      >
        <div data-visual-evidence-target>
          <QuickMemoEditor
            onSave={async () => undefined}
            localSourceEnabled={true}
            className="mb-0 sm:mb-0"
          />
        </div>
      </div>
    </PublicShell>
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
    await expect(canvas.getByTestId("public-memo-detail-body")).toHaveTextContent(
      "Keeps the public memo reading shell intact."
    );
  },
};

export const TitlelessLiveDetailControls: Story = {
  name: "无标题详情不显示 slug",
  render: () => <TitlelessLiveMemoDetailStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const controls = await canvas.findByTestId("public-memo-detail-controls");
    await expect(controls).toBeVisible();
    const card = canvas.getByTestId("public-memo-detail-card");
    await expect(within(card).queryByRole("heading")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("public-memo-detail-body")).toHaveTextContent(
      "A titleless live memo body remains visible without a display title."
    );
    await expect(canvas.queryByText("titleless-detail-story")).not.toBeInTheDocument();

    await userEvent.click(within(controls).getByRole("button", { name: "编辑 Memo" }));
    const dialog = await canvas.findByRole("dialog", { name: "快速编辑 Memo" });
    await expect(dialog).not.toHaveTextContent("titleless-detail-story");
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

export const QuickPublishEmptyDark: Story = {
  name: "快速发布空白初始态（暗色）",
  render: () => <QuickPublishEmptyDarkStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByTestId("quick-memo-editor");
    const surface = editor.querySelector<HTMLElement>("[data-testid='quick-memo-editor-surface']");
    if (!surface) throw new Error("Quick memo editor surface did not render");

    await waitFor(() => expect(surface.querySelector(".ProseMirror")).not.toBeNull());
    await waitFor(() => expect(surface.scrollHeight).toBeLessThanOrEqual(surface.clientHeight));
    await waitFor(() => expect(surface.querySelector(".milkdown-block-handle")).not.toBeNull(), {
      timeout: 10_000,
    });

    const inactiveHandle = surface.querySelector<HTMLElement>(
      '.milkdown-block-handle[data-show="false"]'
    );
    if (inactiveHandle) await expect(inactiveHandle).not.toBeVisible();

    const measureHoverLayout = () => {
      const proseMirror = surface.querySelector<HTMLElement>(".ProseMirror");
      const handle = surface.querySelector<HTMLElement>(".milkdown-block-handle");
      const surfaceRect = surface.getBoundingClientRect();
      const handleRect = handle?.getBoundingClientRect();
      const blockRect = proseMirror?.querySelector("p")?.getBoundingClientRect();

      return {
        scrollHeight: surface.scrollHeight,
        clientHeight: surface.clientHeight,
        proseWidth: proseMirror?.getBoundingClientRect().width ?? null,
        handleShow: handle?.dataset.show ?? null,
        handleWithinSurface: handleRect ? handleRect.bottom <= surfaceRect.bottom + 0.5 : true,
        handleBlockOffset:
          handleRect && blockRect
            ? Math.abs(
                handleRect.top + handleRect.height / 2 - blockRect.top - blockRect.height / 2
              )
            : null,
      };
    };

    const beforeHover = measureHoverLayout();
    const proseMirror = surface.querySelector<HTMLElement>(".ProseMirror");
    if (!proseMirror) throw new Error("Quick memo ProseMirror did not render");
    const block = proseMirror.querySelector<HTMLElement>("p");
    if (!block) throw new Error("Quick memo empty block did not render");
    const blockRect = block.getBoundingClientRect();
    await userEvent.pointer({
      target: proseMirror,
      coords: {
        clientX: Math.floor(blockRect.left + blockRect.width / 2),
        clientY: Math.floor(blockRect.top + blockRect.height / 2),
      },
    });

    await waitFor(() => expect(measureHoverLayout().handleShow).toBe("true"));

    const hoverFrames = await new Promise<ReturnType<typeof measureHoverLayout>[]>((resolve) => {
      const frames: ReturnType<typeof measureHoverLayout>[] = [];
      const sampleFrame = () => {
        frames.push(measureHoverLayout());
        if (frames.length === 15) resolve(frames);
        else requestAnimationFrame(sampleFrame);
      };
      sampleFrame();
    });

    for (const afterHover of hoverFrames) {
      expect(afterHover.scrollHeight).toBeLessThanOrEqual(afterHover.clientHeight);
      expect(afterHover.proseWidth).toBe(beforeHover.proseWidth);
      expect(afterHover.handleWithinSurface).toBe(true);
      expect(afterHover.handleBlockOffset).toBeLessThanOrEqual(1);
    }
  },
};
