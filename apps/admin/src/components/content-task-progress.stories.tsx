import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ContentTaskProgress } from "@/lib/admin-api-client";
import { ContentTaskProgressCard } from "./content-task-progress";

const baseTask: ContentTaskProgress["task"] = {
  id: "story-task",
  kind: "sync",
  source: "content-repo",
  operation: "push",
  origin: "manual",
  status: "running",
  phase: "uploading",
  total: 3,
  processed: 2,
  failed: 0,
  skipped: 0,
  blocked: 0,
  conflicts: 0,
  mediaTotal: 4,
  mediaProcessed: 2,
  mediaFailed: 0,
  currentPath: "blog/content-repo-sync.md",
  percent: 67,
  startedAt: Date.UTC(2026, 10, 24, 9, 0, 0),
  finishedAt: null,
  cancelRequested: false,
  error: null,
};

const running: ContentTaskProgress = {
  task: baseTask,
  items: [
    {
      path: "blog/content-repo-sync.md",
      contentId: "post-1",
      kind: "post",
      status: "running",
      reason: null,
      error: null,
      mediaTotal: 2,
      mediaProcessed: 1,
      mediaFailed: 0,
      retryable: false,
      updatedAt: baseTask.startedAt + 30_000,
    },
    {
      path: "blog/merge-demo.md",
      contentId: "post-2",
      kind: "post",
      status: "skipped",
      reason: "attachment-changed",
      error: null,
      mediaTotal: 1,
      mediaProcessed: 0,
      mediaFailed: 0,
      retryable: true,
      updatedAt: baseTask.startedAt + 20_000,
    },
  ],
  result: null,
};

const partial: ContentTaskProgress = {
  task: {
    ...baseTask,
    status: "failed",
    phase: "failed",
    processed: 3,
    failed: 1,
    skipped: 1,
    percent: 100,
    finishedAt: baseTask.startedAt + 90_000,
    error: "GitHub 请求失败 (403)",
  },
  items: [
    ...running.items,
    {
      path: "blog/remote-only.md",
      contentId: "post-3",
      kind: "post",
      status: "failed",
      reason: null,
      error: "认证失败：令牌没有该仓库写权限（模拟）",
      mediaTotal: 0,
      mediaProcessed: 0,
      mediaFailed: 0,
      retryable: true,
      updatedAt: baseTask.startedAt + 90_000,
    },
  ],
  result: { outcome: "failed", counts: { success: 1, failed: 1, skipped: 1 } },
};

const complete: ContentTaskProgress = {
  task: {
    ...baseTask,
    status: "success",
    phase: "success",
    processed: 3,
    percent: 100,
    finishedAt: baseTask.startedAt + 60_000,
    currentPath: null,
  },
  items: running.items.map((item) => ({
    ...item,
    status: "success",
    mediaProcessed: item.mediaTotal,
  })),
  result: {
    outcome: "pushed",
    commit: "0f1e2d3c4b5a69788796a5b4c3d2e1f001122334",
    repository: "IvanLi-CN/blog-contents",
  },
};

const legacy: ContentTaskProgress = {
  task: {
    ...baseTask,
    status: "success",
    phase: "success",
    total: 12,
    processed: 0,
    percent: 100,
    currentPath: null,
    finishedAt: baseTask.startedAt + 60_000,
  },
  items: [],
  result: null,
};

const meta = {
  title: "Admin/Content Task Progress",
  component: ContentTaskProgressCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="p-6">
        <div className="max-w-3xl">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    progress: running,
    repository: "IvanLi-CN/blog-contents",
    onCancel: () => undefined,
    onRetry: () => undefined,
  },
} satisfies Meta<typeof ContentTaskProgressCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
export const PartialFailure: Story = { args: { progress: partial } };
export const Complete: Story = { args: { progress: complete } };
export const Legacy: Story = { args: { progress: legacy } };
