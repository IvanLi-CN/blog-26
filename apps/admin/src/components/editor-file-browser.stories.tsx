import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { FileItem } from "@/lib/admin-api-client";
import { AdminToastViewport, showAdminToast } from "~/components/admin-toast";
import { Alert } from "~/components/ui";
import {
  EditorFileBrowser,
  joinTreePath,
  normalizeTreePath,
  type TreePendingState,
  type TreeRenameTarget,
  type TreeSelection,
} from "./editor-file-browser";

const ROOT_ITEMS: FileItem[] = [
  { name: "content", path: "content", type: "directory", count: 3 },
  { name: "drafts", path: "drafts", type: "directory", count: 2 },
];

const DIRECTORY_ITEMS: Record<string, FileItem[]> = {
  content: [
    { name: "posts", path: "content/posts", type: "directory", count: 3 },
    { name: "archive", path: "content/archive", type: "directory", count: 0 },
    { name: "guide.md", path: "content/guide.md", type: "file", extension: "md" },
  ],
  "content/posts": [
    { name: "alpha.md", path: "content/posts/alpha.md", type: "file", extension: "md" },
    { name: "beta.md", path: "content/posts/beta.md", type: "file", extension: "md" },
    { name: "gamma.md", path: "content/posts/gamma.md", type: "file", extension: "md" },
  ],
  "content/archive": [],
  drafts: [
    { name: "notes", path: "drafts/notes", type: "directory", count: 0 },
    { name: "todo.md", path: "drafts/todo.md", type: "file", extension: "md" },
  ],
  "drafts/notes": [],
};

type StoryHarnessProps = {
  failDelete?: boolean;
  failRename?: boolean;
  pendingScenario?: "none" | "rename" | "create" | "copy" | "move" | "delete";
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function StoryHarness({
  failDelete = false,
  failRename = false,
  pendingScenario = "none",
}: StoryHarnessProps) {
  const [expandedPaths, setExpandedPaths] = useState<string[]>(["content", "content/posts"]);
  const [editingItem, setEditingItem] = useState<TreeRenameTarget | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingStates, setPendingStates] = useState<TreePendingState[]>(
    pendingScenario === "none"
      ? []
      : [
          {
            path:
              pendingScenario === "rename"
                ? "content/guide.md"
                : pendingScenario === "create"
                  ? "content/posts/untitled.md"
                  : pendingScenario === "delete"
                    ? "content/posts/alpha.md"
                    : "content/archive",
            operation: pendingScenario,
          },
          ...(pendingScenario === "copy" || pendingScenario === "move"
            ? [{ path: "content/posts/alpha.md", operation: pendingScenario as "copy" | "move" }]
            : []),
        ]
  );

  function handleDirectoryExpand(item: FileItem) {
    const normalizedPath = normalizeTreePath(item.path);
    setExpandedPaths((current) =>
      current.includes(normalizedPath)
        ? current.filter((path) => path !== normalizedPath)
        : [...current, normalizedPath]
    );
  }

  function handleStartRename(target: TreeSelection) {
    setEditingItem({
      ...target,
      parentPath: normalizeTreePath(target.path).split("/").slice(0, -1).join("/"),
      value: target.path.split("/").pop() ?? "",
    });
  }

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <AdminToastViewport />
      <div className="mx-auto flex max-w-[460px] flex-col gap-4">
        {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}
        <div
          data-testid="file-browser-story-card"
          className="rounded-[2rem] bg-card/68 p-4 shadow-xl shadow-shadow-soft ring-1 ring-border/54"
        >
          <EditorFileBrowser
            selectedSource="local"
            browserPath="content"
            onNavigateUp={() => undefined}
            onRefresh={() => undefined}
            sourcesLoading={false}
            treeLoading={false}
            rootItems={ROOT_ITEMS}
            directoryItemsByPath={DIRECTORY_ITEMS}
            loadingPaths={[]}
            expandedPaths={expandedPaths}
            selectionOverride={null}
            onSelectionOverrideApplied={() => undefined}
            activeItemPath="content/guide.md"
            activeItemType="file"
            activeItemSource="local"
            editingItem={editingItem}
            pendingStates={pendingStates}
            onEditingValueChange={(value) =>
              setEditingItem((current) => (current ? { ...current, value } : current))
            }
            onEditingCommit={async () => {
              if (!editingItem) return;
              const committedItem = editingItem;
              setEditingItem(null);
              setPendingStates([{ path: editingItem.path, operation: "rename" }]);
              await wait(450);
              setPendingStates([]);
              if (failRename) {
                const message = `重命名失败：目标已存在: ${joinTreePath(
                  committedItem.parentPath,
                  committedItem.value.trim()
                )}`;
                setEditingItem({ ...committedItem, errorMessage: message });
                showAdminToast("danger", message, { autoClose: false });
                return;
              }
            }}
            onEditingCancel={() => setEditingItem(null)}
            onDirectoryExpand={handleDirectoryExpand}
            onFileOpen={() => undefined}
            onCreateFile={(parentPath) => {
              const basePath = normalizeTreePath(parentPath || "content");
              setEditingItem({
                source: "local",
                path: joinTreePath(basePath, "untitled.md"),
                parentPath: basePath,
                type: "file",
                value: "untitled.md",
              });
              setPendingStates([
                { path: joinTreePath(basePath, "untitled.md"), operation: "create" },
              ]);
            }}
            onCreateDirectory={(parentPath) => {
              const basePath = normalizeTreePath(parentPath || "content");
              setEditingItem({
                source: "local",
                path: joinTreePath(basePath, "new-folder"),
                parentPath: basePath,
                type: "directory",
                value: "new-folder",
              });
              setPendingStates([
                { path: joinTreePath(basePath, "new-folder"), operation: "create" },
              ]);
            }}
            onStartRename={handleStartRename}
            onMoveEntries={async (entries, destinationPath) => {
              setPendingStates([
                { path: destinationPath, operation: "move" },
                ...entries.map((entry) => ({ path: entry.path, operation: "move" as const })),
              ]);
              await wait(450);
              setPendingStates([]);
              return entries.map((entry) => ({
                ...entry,
                path: joinTreePath(destinationPath, entry.path.split("/").pop() ?? entry.path),
              }));
            }}
            onCopyEntries={async (entries, destinationPath) => {
              setPendingStates([
                { path: destinationPath, operation: "copy" },
                ...entries.map((entry) => ({ path: entry.path, operation: "copy" as const })),
              ]);
              await wait(450);
              setPendingStates([]);
              return entries.map((entry) => ({
                ...entry,
                path: joinTreePath(destinationPath, entry.path.split("/").pop() ?? entry.path),
              }));
            }}
            onDeleteEntries={async (entries) => {
              setErrorMessage(null);
              setPendingStates(entries.map((entry) => ({ path: entry.path, operation: "delete" })));
              await wait(450);
              if (failDelete && entries.some((entry) => entry.path === "content/posts")) {
                const message = "删除失败：目录不为空，无法删除: content/posts";
                setErrorMessage(message);
                setPendingStates([]);
                throw new Error(message);
              }
              setPendingStates([]);
            }}
          />
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Admin/Editor/File Browser",
  component: StoryHarness,
  tags: ["autodocs"],
  args: {
    failDelete: false,
    failRename: false,
    pendingScenario: "none",
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "文件浏览器状态画廊，覆盖复选框模式、批量工具条、上下文菜单、移动对话框、剪贴板粘贴和删除阻断。",
      },
    },
  },
} satisfies Meta<typeof StoryHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const KeyboardRename: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const guide = canvas.getByRole("button", { name: "guide.md", exact: true });
    await userEvent.click(guide);
    guide.focus();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("textbox", { name: "文件名称" })).toHaveValue("guide.md");
  },
};

export const PendingRename: Story = {
  args: {
    pendingScenario: "rename",
  },
};

export const RenameErrorRetry: Story = {
  args: {
    failRename: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const guide = canvas.getByRole("button", { name: "guide.md", exact: true });
    await userEvent.click(guide);
    guide.focus();
    await userEvent.keyboard("{Enter}");
    const input = canvas.getByRole("textbox", { name: "文件名称" });
    await userEvent.clear(input);
    await userEvent.type(input, "alpha.md");
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("textbox", { name: "文件名称" })).toHaveValue("alpha.md");
    await expect(
      canvas.queryByText("重命名失败：目标已存在: content/alpha.md")
    ).not.toBeInTheDocument();
    await expect(body.getByText("重命名失败：目标已存在: content/alpha.md")).toBeVisible();
  },
};

export const PendingCopy: Story = {
  args: {
    pendingScenario: "copy",
  },
};

export const PendingMove: Story = {
  args: {
    pendingScenario: "move",
  },
};

export const PendingDelete: Story = {
  args: {
    pendingScenario: "delete",
  },
};

export const SelectionMode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "切换批量选择模式" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "选择 alpha.md" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "选择 beta.md" }));
    await expect(canvas.getByText("已选中 2 项")).toBeVisible();
  },
};

export const ClipboardReady: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "切换批量选择模式" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "选择 alpha.md" }));
    await userEvent.click(canvas.getByRole("button", { name: "复制" }));
    await expect(canvas.getByText("复制 1 项，右键目录或空白处后可粘贴。")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "archive 更多操作" }));
    await expect(body.getByRole("menuitem", { name: "粘贴" })).toBeVisible();
  },
};

export const ContextMenuAndDelete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "archive 更多操作" }));
    await userEvent.click(body.getByRole("menuitem", { name: "删除" }));
    await expect(body.getByRole("dialog", { name: "确认删除" })).toBeVisible();
  },
};

export const ConfiguredRootContextMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "content 更多操作" }));
    await expect(body.queryByRole("menuitem", { name: "重命名" })).not.toBeInTheDocument();
    await expect(body.queryByRole("menuitem", { name: "移动" })).not.toBeInTheDocument();
    await expect(body.queryByRole("menuitem", { name: "复制" })).not.toBeInTheDocument();
    await expect(body.queryByRole("menuitem", { name: "剪切" })).not.toBeInTheDocument();
    await expect(body.queryByRole("menuitem", { name: "删除" })).not.toBeInTheDocument();
    await expect(body.getByRole("menuitem", { name: "新建文件" })).toBeVisible();
    await expect(body.getByRole("menuitem", { name: "新建目录" })).toBeVisible();
    await expect(body.getByRole("menuitem", { name: "粘贴" })).toBeDisabled();
  },
};

export const MenuEscapesSidebarCard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole("button", { name: "guide.md 更多操作" }));

    const menuItem = await body.findByRole("menuitem", { name: "重命名" });
    await expect(menuItem).toBeVisible();

    const card = canvas.getByTestId("file-browser-story-card");
    const menu = menuItem.closest('[role="menu"]');

    if (!menu) {
      throw new Error("Expected file-browser menu to render in a portal.");
    }

    const cardBounds = card.getBoundingClientRect();
    const menuBounds = menu.getBoundingClientRect();

    await expect(menuBounds.right).toBeGreaterThan(cardBounds.right);
    await expect(menuBounds.left).toBeGreaterThanOrEqual(0);
    await expect(menuBounds.right).toBeLessThanOrEqual(window.innerWidth);
    await expect(menuBounds.top).toBeGreaterThanOrEqual(0);
    await expect(menuBounds.bottom).toBeLessThanOrEqual(window.innerHeight);
  },
};

export const MoveDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "guide.md 更多操作" }));
    await userEvent.click(body.getByRole("menuitem", { name: "移动" }));
    const dialog = body.getByRole("dialog", { name: "选择目标目录" });
    await expect(dialog).toBeVisible();
    await expect(within(dialog).getByText("目标目录", { exact: true })).toBeVisible();
    await expect(
      within(dialog).getByText("当前文件已经在这个目录中，请选择其他目标目录。")
    ).toBeVisible();
    await expect(within(dialog).getByRole("button", { name: "确认移动" })).toBeDisabled();
    await userEvent.hover(within(dialog).getByRole("button", { name: "根目录" }));
    await expect(body.getByRole("tooltip")).toHaveTextContent(
      "不能把项目放到内容根目录，请选择一个已配置的目录。"
    );
    await userEvent.hover(within(dialog).getByRole("button", { name: "content" }));
    await expect(body.getByRole("tooltip")).toHaveTextContent(
      "当前文件已经在这个目录中，请选择其他目标目录。"
    );
  },
};

export const CrossRootMoveTargetBlocked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "guide.md 更多操作" }));
    await userEvent.click(body.getByRole("menuitem", { name: "移动" }));
    const dialog = body.getByRole("dialog", { name: "选择目标目录" });
    await userEvent.hover(within(dialog).getByRole("button", { name: "drafts" }));
    await expect(body.getByRole("tooltip")).toHaveTextContent(
      "不能跨内容根目录移动项目，请选择同一内容根内的目录。"
    );
  },
};

export const NonEmptyDirectoryBlocked: Story = {
  args: {
    failDelete: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: "posts 更多操作" }));
    await userEvent.click(body.getByRole("menuitem", { name: "删除" }));
    const dialog = body.getByRole("dialog", { name: "确认删除" });
    await userEvent.click(within(dialog).getByRole("button", { name: "删除" }));
    await expect(canvas.getByText("删除失败：目录不为空，无法删除: content/posts")).toBeVisible();
  },
};
