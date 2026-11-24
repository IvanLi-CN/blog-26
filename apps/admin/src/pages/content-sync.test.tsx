import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ContentTaskItem, ContentTaskSummary } from "@/lib/admin-api-client";
import { ContentTaskProgressCard } from "~/components/content-task-progress";
import {
  ContentSyncActions,
  PlaybookStatusDetails,
  PlaybookSyncStatusDetails,
  RagCoverageGrid,
  VectorizationStatsGrid,
} from "./content-sync";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();

afterEach(() => {
  cleanup();
});

describe("VectorizationStatsGrid", () => {
  test("renders readable vectorization metrics instead of raw response data", () => {
    const { getByTestId, getByText } = render(
      <VectorizationStatsGrid
        stats={{
          indexed: 12,
          outdated: 3,
          unindexed: 4,
          lastIndexedAt: "2026-09-27T04:00:00.000Z",
          model: "BAAI/bge-m3",
          dim: 1024,
        }}
      />
    );

    expect(getByTestId("vectorization-stats")).toBeTruthy();
    expect(getByText("已索引")).toBeTruthy();
    expect(getByText("待处理")).toBeTruthy();
    expect(getByText("需更新")).toBeTruthy();
    expect(getByText("最近更新")).toBeTruthy();
    expect(getByText("12")).toBeTruthy();
    expect(getByText("3")).toBeTruthy();
    expect(getByText("4")).toBeTruthy();
    expect(getByText(/2026/)).toBeTruthy();
  });
});

describe("Playbook sync controls", () => {
  const playbook = {
    name: "playbook" as const,
    type: "playbook" as const,
    adopted: true,
    current: {
      edition: "a".repeat(64),
      sourceReleaseId: "100",
      sourceTag: "v3.0.0",
      generatedAt: "2026-10-13T23:34:40.000Z",
    },
    previous: null,
    lexical: { status: "ready", count: 3 },
    semantic: { model: "text-embedding-3-small", total: 3, ready: 2, pending: 1, failed: 0 },
    history: [
      {
        id: "sync-1",
        status: "success",
        operation: "sync",
        message: "ok",
        data: null,
        createdAt: Date.now(),
      },
    ],
    editions: [
      {
        edition: "a".repeat(64),
        sourceReleaseId: "100",
        sourceTag: "v3.0.0",
        generatedAt: "2026-10-13T23:34:40.000Z",
      },
    ],
  };

  test("renders adopted edition and semantic recovery counts", () => {
    const { getByText } = render(<PlaybookStatusDetails playbook={playbook} />);
    expect(getByText("已采用")).toBeTruthy();
    expect(getByText(/2 ready/)).toBeTruthy();
    expect(getByText(/1 条记录/)).toBeTruthy();
  });

  test("renders the dynamic sync state, source identity, snapshots, and failure reason", () => {
    const currentHash = "c".repeat(64);
    const previousHash = "d".repeat(64);
    const { getAllByText, getByTestId, getByText } = render(
      <PlaybookSyncStatusDetails
        playbook={{
          adopted: true,
          state: "failed",
          sourceStatus: "failed",
          repository: "IvanLi-CN/style-playbook-skills",
          ref: "main",
          adoptedAt: Date.now(),
          current: {
            editionDigest: currentHash,
            contentHash: currentHash,
            commit: "a".repeat(40),
            ref: "main",
            source: { releaseId: "100", tag: "v2.4.3" },
          },
          previous: {
            editionDigest: previousHash,
            contentHash: previousHash,
            commit: "b".repeat(40),
            ref: "main",
          },
          lexical: { status: "ready", count: 80 },
          semantic: { status: "failed", lastError: "GitHub 检查失败" },
          lastCheckAt: Date.now(),
          lastSuccessAt: Date.now(),
        }}
      />
    );

    expect(getByTestId("playbook-sync-status")).toBeTruthy();
    expect(getByTestId("playbook-source-identity").textContent).toContain(
      "IvanLi-CN/style-playbook-skills"
    );
    expect(getByText("失败")).toBeTruthy();
    expect(getByText("GitHub 检查失败")).toBeTruthy();
    expect(getAllByText(currentHash)).toHaveLength(2);
    expect(getByText(previousHash)).toBeTruthy();
  });

  test("fires Playbook refresh and disables all actions while busy", () => {
    let refreshed = false;
    const { getByRole, rerender } = render(
      <ContentSyncActions
        busy={false}
        syncing={false}
        playbookSyncing={false}
        vectorizing={false}
        cancelling={false}
        onSync={() => undefined}
        onPlaybookSync={() => {
          refreshed = true;
        }}
        onVectorize={() => undefined}
        onCancel={() => undefined}
      />
    );
    fireEvent.click(getByRole("button", { name: /刷新 Playbook/ }));
    expect(refreshed).toBe(true);
    rerender(
      <ContentSyncActions
        busy
        syncing={false}
        playbookSyncing
        vectorizing={false}
        cancelling={false}
        onSync={() => undefined}
        onPlaybookSync={() => undefined}
        onVectorize={() => undefined}
        onCancel={() => undefined}
      />
    );
    expect(getByRole("button", { name: /刷新 Playbook/ }).hasAttribute("disabled")).toBe(true);
  });
});

describe("RAG coverage", () => {
  test("shows six parent metrics, differentiates unavailable and true zero", () => {
    const { getByText, rerender } = render(
      <RagCoverageGrid
        stats={{ total: 1, indexed: 0, unindexed: 1, outdated: 0, failed: 0, coverage: 0 }}
      />
    );
    expect(getByText("总量")).toBeTruthy();
    expect(getByText("未索引")).toBeTruthy();
    expect(getByText("失败")).toBeTruthy();
    expect(getByText("0.0%")).toBeTruthy();
    rerender(
      <RagCoverageGrid
        available={false}
        stats={{
          total: 1,
          indexed: null,
          unindexed: null,
          outdated: null,
          failed: null,
          coverage: null,
        }}
      />
    );
    expect(getByText("覆盖率").nextElementSibling?.textContent).toBe("—");
  });
});

describe("content task progress card", () => {
  const task = (overrides: Partial<ContentTaskSummary> = {}): ContentTaskSummary => ({
    id: "task-1",
    kind: "content-repo",
    source: "content-repo",
    operation: "push",
    origin: "manual",
    status: "running",
    phase: "uploading",
    total: 4,
    processed: 2,
    failed: 1,
    skipped: 1,
    blocked: 0,
    conflicts: 0,
    mediaTotal: 3,
    mediaProcessed: 1,
    mediaFailed: 0,
    currentPath: "blog/running.md",
    percent: 50,
    startedAt: Date.now() - 60_000,
    finishedAt: null,
    cancelRequested: false,
    error: null,
    ...overrides,
  });
  const item = (overrides: Partial<ContentTaskItem> = {}): ContentTaskItem => ({
    path: "blog/running.md",
    contentId: "content-1",
    kind: "post",
    status: "running",
    reason: null,
    error: null,
    mediaTotal: 2,
    mediaProcessed: 1,
    mediaFailed: 0,
    retryable: false,
    updatedAt: Date.now(),
    ...overrides,
  });

  test("renders a running task with Chinese labels, counts and the current path", () => {
    const { getByTestId, getAllByTestId, getByText } = render(
      <ContentTaskProgressCard
        progress={{
          task: task(),
          items: [item(), item({ path: "blog/failed.md", status: "failed", error: "认证失败" })],
          result: null,
        }}
        onCancel={() => undefined}
      />
    );
    expect(getByTestId("content-task-status").textContent).toBe("进行中");
    expect(getByTestId("content-task-description").textContent).toContain("推送");
    expect(getByTestId("content-task-percent").textContent).toBe("50%");
    expect(getByTestId("content-task-progress-bar").getAttribute("role")).toBe("progressbar");
    expect(getByTestId("content-task-metrics").textContent).toContain("2/4");
    expect(getAllByTestId("content-task-item").length).toBe(2);
    expect(getByText("认证失败")).toBeTruthy();
    expect(getByTestId("content-task-cancel")).toBeTruthy();
  });

  test("shows failure, skip and blocked items with Chinese reasons by default", () => {
    const { getByTestId, getAllByTestId } = render(
      <ContentTaskProgressCard
        progress={{
          task: task({
            status: "failed",
            phase: "failed",
            finishedAt: Date.now(),
            error: "网络错误",
          }),
          items: [
            item({ path: "blog/ok.md", status: "success", mediaProcessed: 2 }),
            item({ path: "blog/skip.md", status: "skipped", reason: "attachment-changed" }),
            item({ path: "blog/block.md", status: "blocked", reason: "claim-required" }),
            item({ path: "blog/fail.md", status: "failed", error: "权限不足" }),
          ],
          result: null,
        }}
      />
    );
    expect(getByTestId("content-task-status").textContent).toBe("失败");
    expect(getByTestId("content-task-result").textContent).toContain("网络错误");
    const statuses = getAllByTestId("content-task-item-status").map((node) => node.textContent);
    expect(statuses).toEqual(["跳过", "需处理", "失败"]);
    expect(getByTestId("content-task-items").textContent).toContain("附件已变化");
    expect(getByTestId("content-task-items").textContent).toContain("需要显式认领");
  });

  test("filters items, expands all rows and retries retryable items", () => {
    const retried: string[] = [];
    const { getByTestId, getAllByTestId } = render(
      <ContentTaskProgressCard
        progress={{
          task: task({ status: "cancelled", phase: "cancelled", finishedAt: Date.now() }),
          items: [
            item({ path: "blog/a.md", status: "success" }),
            item({
              path: "blog/b.md",
              status: "skipped",
              reason: "missing-local-content",
              retryable: true,
            }),
            item({ path: "blog/c.md", status: "failed", retryable: true }),
          ],
          result: { operation: "push", outcome: "cancelled", commits: ["a".repeat(40)] },
        }}
        onRetry={(taskId) => retried.push(taskId)}
      />
    );
    expect(getAllByTestId("content-task-item").length).toBe(2);
    fireEvent.click(getByTestId("content-task-toggle-all"));
    expect(getAllByTestId("content-task-item").length).toBe(3);
    fireEvent.click(getByTestId("content-task-filter-failed"));
    expect(getAllByTestId("content-task-item").length).toBe(1);
    expect(getAllByTestId("content-task-item-status")[0].textContent).toBe("失败");
    fireEvent.click(getByTestId("content-task-retry"));
    expect(retried).toEqual(["task-1"]);
  });

  test("renders the commit link only for a valid repository identity", () => {
    const commit = "0f1e2d3c4b5a69788796a5b4c3d2e1f001122334";
    const { getByTestId } = render(
      <ContentTaskProgressCard
        progress={{
          task: task({ status: "success", phase: "success", percent: 100, finishedAt: Date.now() }),
          items: [],
          result: {
            operation: "push",
            outcome: "pushed",
            repository: "IvanLi-CN/blog-contents",
            commit,
          },
        }}
      />
    );
    expect(getByTestId("content-task-result").textContent).toContain("推送完成");
    expect(getByTestId("content-task-commit-link").getAttribute("href")).toBe(
      `https://github.com/IvanLi-CN/blog-contents/commit/${commit}`
    );
    // No item rows: a legacy task explains why it has no per-item detail.
    expect(getByTestId("content-task-items-empty").textContent).toContain("没有逐项记录");
  });

  test("explains unchanged, interrupted and legacy outcomes", () => {
    const { getByTestId, rerender } = render(
      <ContentTaskProgressCard
        progress={{
          task: task({ status: "unchanged", phase: "unchanged", finishedAt: Date.now() }),
          items: [item({ status: "unchanged" })],
          result: null,
        }}
      />
    );
    expect(getByTestId("content-task-result").textContent).toContain("未产生提交");
    rerender(
      <ContentTaskProgressCard
        progress={{
          task: task({ status: "interrupted", phase: "interrupted", finishedAt: Date.now() }),
          items: [item({ path: "blog/x.md", status: "pending", retryable: true })],
          result: null,
        }}
      />
    );
    expect(getByTestId("content-task-result").textContent).toContain("任务中断");
    rerender(
      <ContentTaskProgressCard
        progress={{
          task: task({ status: "success", phase: "success", finishedAt: Date.now() }),
          items: [],
          result: null,
        }}
      />
    );
    expect(getByTestId("content-task-items-empty").textContent).toContain("逐项进度上线之前");
  });

  test("shows an indeterminate bar before the total is known", () => {
    const { getByTestId } = render(
      <ContentTaskProgressCard
        progress={{
          task: task({ percent: null, total: 0, processed: 0 }),
          items: [],
          result: null,
        }}
      />
    );
    const bar = getByTestId("content-task-progress-bar");
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(bar.getAttribute("data-state")).toBe("indeterminate");
    expect(getByTestId("content-task-percent").textContent).toBe("进度未知");
  });
});
