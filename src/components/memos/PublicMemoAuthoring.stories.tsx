import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useEffect, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import "@/styles/nature-restored.css";
import { QuickMemoEditModal } from "./QuickMemoEditModal";

type MemoRecord = {
  id: string;
  slug: string;
  title?: string;
  content: string;
  excerpt?: string;
  isPublic: boolean;
  tags: string[];
};

const composerMemo: MemoRecord = {
  id: "memo-live-1",
  slug: "memo-live-1",
  title: "Realtime memo preview",
  excerpt:
    "Live admin memo list mirrors `/api/public/memos/*` without waiting for a full site rebuild.",
  content:
    "# Realtime memo preview\n\nUse the live admin controls to preview, edit, and delete a memo from the same page shell.",
  isPublic: true,
  tags: ["memos", "admin", "live"],
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
}: {
  children: ReactNode;
  theme?: "light" | "dark";
  compact?: boolean;
}) {
  useEffect(() => {
    document.documentElement.dataset.uiTheme = theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");

    return () => {
      document.documentElement.dataset.uiTheme = "light";
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
      document.documentElement.classList.remove("dark");
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
        <div className="nature-reading-container space-y-8">{children}</div>
      </main>
    </div>
  );
}

function RealtimeMemoListStory() {
  const [memos, setMemos] = useState<MemoRecord[]>([composerMemo]);

  return (
    <PublicShell>
      <section className="space-y-4" data-testid="public-memo-composer">
        <div className="nature-panel px-5 py-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-[color:var(--nature-text-soft)]">
            <span className="nature-chip nature-chip-info">Admin view</span>
            <span>Live composer now writes straight to `/api/public/memos/*`.</span>
          </div>
          <div className="rounded-[1.5rem] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.82)] p-4">
            <p className="text-sm text-[color:var(--nature-text-soft)]">
              Quick memo editor is rendered inline on the page shell for fast local publishing.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-[color:var(--nature-text)]">
                快速发布 Memo
              </span>
              <button type="button" className="nature-button">
                发布 Memo
              </button>
            </div>
          </div>
        </div>

        <div className="nature-alert nature-alert-success flex flex-wrap items-center justify-between gap-3">
          <span>
            Memo 已创建：<strong>{composerMemo.title}</strong>。公开静态页会在下一次站点构建后刷新。
          </span>
          <a
            className="nature-button nature-button-outline"
            href={`/admin/preview/memos/${composerMemo.slug}`}
          >
            打开专用预览
          </a>
        </div>

        <div className="nature-panel px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-[color:var(--nature-text-strong)]">
                管理员实时 Memo 视图
              </p>
              <p className="text-sm text-[color:var(--nature-text-soft)]">
                Live list reflects the latest API response and keeps preview actions close at hand.
              </p>
            </div>
            <button
              type="button"
              className="nature-button nature-button-outline"
              onClick={() =>
                setMemos((current) =>
                  current.map((memo) =>
                    memo.id === composerMemo.id ? { ...memo, isPublic: !memo.isPublic } : memo
                  )
                )
              }
            >
              刷新列表
            </button>
          </div>

          <div className="space-y-4">
            {memos.map((memo) => (
              <article
                key={memo.id}
                className="nature-panel flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
                data-testid="admin-live-memo-card"
                data-id={memo.id}
                data-slug={memo.slug}
                data-source="local"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--nature-text-soft)]">
                    <span className="nature-chip gap-1">Memo</span>
                    <span
                      className={`nature-chip ${memo.isPublic ? "nature-chip-info" : "nature-chip-warn"}`}
                      data-testid={memo.isPublic ? "public-indicator" : "private-indicator"}
                    >
                      {memo.isPublic ? "Public" : "Draft / Private"}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[color:var(--nature-text-strong)]">
                      {memo.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--nature-text-soft)]">
                      {memo.excerpt}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {memo.tags.map((tag) => (
                      <span key={tag} className="nature-chip">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    className="nature-button nature-button-outline"
                    href={`/admin/preview/memos/${memo.slug}`}
                  >
                    预览
                  </a>
                  <button
                    type="button"
                    className="nature-button nature-button-outline"
                    data-testid="admin-live-memo-edit"
                  >
                    编辑 Memo
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
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

function QuickEditModalStory() {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(false);

  return (
    <PublicShell compact>
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

export const RealtimeList: Story = {
  name: "实时列表",
  render: () => <RealtimeMemoListStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("admin-live-memo-card")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "预览" })).toBeVisible();
    await expect(canvas.getByTestId("public-indicator")).toHaveTextContent("Public");
    await userEvent.click(canvas.getByRole("button", { name: "刷新列表" }));
    await expect(canvas.getByTestId("private-indicator")).toHaveTextContent("Draft / Private");
  },
};

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
