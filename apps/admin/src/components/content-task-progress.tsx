import { useQuery } from "@tanstack/react-query";
import { Link2, PauseCircle, RefreshCcw, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  ContentTaskItem,
  ContentTaskItemStatus,
  ContentTaskProgress,
  ContentTaskSummary,
} from "@/lib/admin-api-client";
import { adminApi } from "@/lib/admin-api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Disclosure,
  EmptyState,
  Progress,
  Spinner,
} from "~/components/ui";
import { formatDateTime } from "~/pages/helpers";

export const CONTENT_TASK_OPERATION_LABELS: Record<"push" | "pull" | "merge", string> = {
  push: "推送",
  pull: "拉取",
  merge: "自动合并",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  queued: "排队中",
  running: "进行中",
  success: "已完成",
  unchanged: "无变化",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "任务中断",
};

const PHASE_LABELS: Record<string, string> = {
  queued: "等待开始",
  checking: "检查远端",
  planning: "规划批次",
  uploading: "上传内容",
  committing: "更新远端 ref",
  committed: "已提交",
  pulling: "拉取内容",
  merging: "合并内容",
  adopted: "已采用",
  success: "已完成",
  unchanged: "无变化",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "任务中断",
};

export const CONTENT_TASK_ITEM_LABELS: Record<ContentTaskItemStatus, string> = {
  pending: "待处理",
  running: "处理中",
  uploaded: "已上传",
  success: "成功",
  unchanged: "无变化",
  skipped: "跳过",
  blocked: "需处理",
  conflict: "冲突",
  failed: "失败",
};

const REASON_LABELS: Record<string, string> = {
  "attachment-changed": "附件已变化",
  "missing-local-content": "缺少本地内容",
  "missing-baseline": "缺少同步基线",
  "missing-remote-state": "远端状态不可用",
  "baseline-document-unavailable": "基线正文不可用",
  "remote-deleted": "远端已删除",
  "claim-required": "远端已存在同路径且无基线，需要显式认领",
  oversized: "超出容量限制",
  "attachment-missing": "附件缺失",
};

export function contentTaskStatusLabel(status: string) {
  return TASK_STATUS_LABELS[status] ?? status;
}

export function contentTaskPhaseLabel(phase: string) {
  return PHASE_LABELS[phase] ?? phase;
}

export function contentTaskOperationLabel(operation: ContentTaskSummary["operation"]) {
  return operation ? CONTENT_TASK_OPERATION_LABELS[operation] : "内容仓库";
}

export function contentTaskReasonLabel(reason: string | null) {
  if (!reason) return null;
  return REASON_LABELS[reason] ?? reason;
}

export function contentTaskStatusTone(status: string) {
  if (status === "failed") return "danger" as const;
  if (status === "cancelled" || status === "interrupted") return "warning" as const;
  if (status === "running" || status === "queued") return "default" as const;
  if (status === "success" || status === "unchanged") return "success" as const;
  return "outline" as const;
}

export function contentTaskItemTone(status: ContentTaskItemStatus) {
  if (status === "failed") return "danger" as const;
  if (status === "blocked" || status === "conflict") return "warning" as const;
  if (status === "skipped" || status === "pending") return "muted" as const;
  if (status === "success" || status === "unchanged" || status === "uploaded")
    return "success" as const;
  return "default" as const;
}

/** Progress bar tone follows the task outcome, not the raw status text. */
function progressTone(task: ContentTaskSummary) {
  if (task.status === "failed") return "danger" as const;
  if (task.status === "cancelled" || task.status === "interrupted" || task.blocked > 0)
    return "warning" as const;
  if (task.status === "success" || task.status === "unchanged") return "success" as const;
  return "default" as const;
}

const TERMINAL_STATUSES: Record<string, true> = {
  success: true,
  unchanged: true,
  failed: true,
  cancelled: true,
  interrupted: true,
};

export function isContentTaskActive(task: ContentTaskSummary) {
  return task.finishedAt === null && TERMINAL_STATUSES[task.status] !== true;
}

const CONTENT_TASK_ACTIVE_POLL_MS = 1000;
const CONTENT_TASK_IDLE_POLL_MS = 5000;

/**
 * Content-repo task summaries plus the active task's per-item progress. Only the
 * summary list and the active task poll at 1s; the list drops to 5s when idle.
 * Both stop while the tab is hidden so a background page drives no polling loop.
 * The full content status query stays on its own slower interval (see the page).
 */
export function useContentRepoTaskMonitor({ limit = 6 }: { limit?: number } = {}) {
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "hidden"
  );
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onChange = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const tasksQuery = useQuery({
    queryKey: ["content-repo", "tasks", limit],
    queryFn: () => adminApi.getContentSyncTasks({ source: "content-repo", limit }),
    refetchInterval: (query) => {
      if (hidden) return false;
      const items = query.state.data?.items ?? [];
      return items.some(isContentTaskActive)
        ? CONTENT_TASK_ACTIVE_POLL_MS
        : CONTENT_TASK_IDLE_POLL_MS;
    },
  });
  const activeTask = tasksQuery.data?.items.find(isContentTaskActive) ?? null;

  // Stay on the last task seen running so its terminal state and item list stay
  // visible after the task leaves the active set.
  const [trackedId, setTrackedId] = useState<string | null>(null);
  useEffect(() => {
    if (activeTask) setTrackedId(activeTask.id);
  }, [activeTask]);
  const focusId = activeTask?.id ?? trackedId ?? tasksQuery.data?.items[0]?.id ?? null;

  const progressQuery = useQuery({
    queryKey: ["content-repo", "task-progress", focusId],
    queryFn: () => adminApi.getContentTaskProgress(focusId as string),
    enabled: Boolean(focusId),
    refetchInterval: (query) => {
      if (hidden) return false;
      const task = query.state.data?.task;
      return task && isContentTaskActive(task) ? CONTENT_TASK_ACTIVE_POLL_MS : false;
    },
  });

  return {
    tasks: tasksQuery.data?.items ?? [],
    total: tasksQuery.data?.total ?? 0,
    activeTask,
    busy: activeTask !== null,
    progress: progressQuery.data,
    progressError: progressQuery.error,
    tasksLoading: tasksQuery.isLoading,
    refetch: async () => {
      await Promise.all([tasksQuery.refetch(), progressQuery.refetch()]);
    },
  };
}

type TaskResultView = {
  outcome?: string;
  commit?: string | null;
  commits?: string[];
  repository?: string | null;
  message?: string | null;
  counts?: Record<string, number>;
  batches?: number;
};

function readTaskResult(result: unknown): TaskResultView | null {
  if (!result || typeof result !== "object") return null;
  const value = result as Record<string, unknown>;
  const readString = (key: string) =>
    typeof value[key] === "string" && value[key] ? (value[key] as string) : null;
  const readNumbers = (key: string) => {
    const raw = value[key];
    if (!raw || typeof raw !== "object") return undefined;
    const out: Record<string, number> = {};
    for (const [entryKey, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof entry === "number") out[entryKey] = entry;
    }
    return Object.keys(out).length ? out : undefined;
  };
  const commits = Array.isArray(value.commits)
    ? value.commits.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  return {
    outcome: readString("outcome") ?? undefined,
    commit: readString("commit"),
    commits,
    repository: readString("repository"),
    message: readString("message"),
    counts: readNumbers("counts"),
    batches: typeof value.batches === "number" ? value.batches : undefined,
  };
}

function githubCommitUrl(repository: string | null | undefined, commit: string) {
  if (!repository || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository))
    return null;
  return `https://github.com/${repository}/commit/${commit}`;
}

function shortSha(commit: string) {
  return commit.length > 8 ? commit.slice(0, 7) : commit;
}

function MetricCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function ContentTaskMetrics({ task }: { task: ContentTaskSummary }) {
  return (
    <dl
      className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4 xl:grid-cols-8"
      data-testid="content-task-metrics"
    >
      <MetricCell label="已处理" value={`${task.processed}/${task.total}`} />
      <MetricCell label="失败" value={task.failed} />
      <MetricCell label="跳过" value={task.skipped} />
      <MetricCell label="需处理" value={task.blocked} />
      <MetricCell label="冲突" value={task.conflicts} />
      <MetricCell label="附件" value={`${task.mediaProcessed}/${task.mediaTotal}`} />
      <MetricCell label="附件失败" value={task.mediaFailed} />
      <MetricCell label="阶段" value={contentTaskPhaseLabel(task.phase)} />
    </dl>
  );
}

function TaskResultSummary({
  task,
  result,
  repository,
}: {
  task: ContentTaskSummary;
  result: TaskResultView | null;
  repository?: string | null;
}) {
  const commits = result?.commits ?? [];
  const commit = result?.commit ?? (commits.length ? commits[commits.length - 1] : null);
  const owner = repository ?? result?.repository ?? null;
  const link = commit ? githubCommitUrl(owner, commit) : null;
  const counts = result?.counts;
  const detail = counts
    ? Object.entries(counts)
        .filter(([, value]) => value > 0)
        .map(([key, value]) => `${key} ${value}`)
        .join(" · ")
    : "";

  if (task.status === "unchanged") {
    return (
      <div data-testid="content-task-result">
        <Alert tone="success">
          没有需要{contentTaskOperationLabel(task.operation)}的内容；远端与内容库一致，未产生提交。
        </Alert>
      </div>
    );
  }
  if (task.status === "cancelled") {
    return (
      <div data-testid="content-task-result">
        <Alert tone="warning">
          任务已取消；已完成的 {task.processed}/{task.total} 项保留，已更新的远端 ref 不回滚。
          {commit ? ` 最后一个提交 ${shortSha(commit)} 已写入仓库。` : ""}
        </Alert>
      </div>
    );
  }
  if (task.status === "interrupted") {
    return (
      <div data-testid="content-task-result">
        <Alert tone="warning">
          任务中断：执行进程退出或租约过期；已完成项保留。可重试失败或未处理项，不会重复累计成功项。
        </Alert>
      </div>
    );
  }
  if (task.status === "failed") {
    return (
      <div data-testid="content-task-result">
        <Alert tone="danger">
          任务失败：{task.error ?? result?.message ?? "请查看失败项后重试。"}
          {task.processed > 0 ? ` 已完成 ${task.processed}/${task.total} 项保留。` : ""}
        </Alert>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm" data-testid="content-task-result">
      <p className="text-foreground">
        {task.status === "success"
          ? `${contentTaskOperationLabel(task.operation)}完成`
          : `${contentTaskOperationLabel(task.operation)}${contentTaskStatusLabel(task.status)}`}
        {result?.batches && result.batches > 0 ? ` · ${result.batches} 个批次` : ""}
        {detail ? ` · ${detail}` : ""}
      </p>
      {commit ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>提交</span>
          <code className="rounded bg-muted/62 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            {shortSha(commit)}
          </code>
          {link ? (
            <a
              className="inline-flex items-center gap-1 text-primary underline decoration-primary/40 underline-offset-2"
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="content-task-commit-link"
            >
              <Link2 className="size-3" />在 GitHub 查看
            </a>
          ) : null}
        </p>
      ) : null}
      {result?.message ? (
        <p className="break-words text-xs text-muted-foreground">{result.message}</p>
      ) : null}
    </div>
  );
}

type ItemFilter = "all" | "failed" | "skipped" | "blocked";

const ITEM_FILTERS: { value: ItemFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "failed", label: "失败" },
  { value: "skipped", label: "跳过" },
  { value: "blocked", label: "需处理" },
];

function itemMatchesFilter(item: ContentTaskItem, filter: ItemFilter) {
  if (filter === "all") return true;
  if (filter === "failed") return item.status === "failed";
  if (filter === "skipped") return item.status === "skipped";
  return item.status === "blocked" || item.status === "conflict";
}

function needsAttention(item: ContentTaskItem) {
  return (
    item.status === "failed" ||
    item.status === "skipped" ||
    item.status === "blocked" ||
    item.status === "conflict"
  );
}

function TaskItemRow({
  item,
  currentPath,
  onRetry,
  retrying,
  onSelectPath,
  showMedia = true,
}: {
  item: ContentTaskItem;
  currentPath: string | null;
  onRetry?: () => void;
  retrying?: boolean;
  onSelectPath?: (path: string) => void;
  showMedia?: boolean;
}) {
  const reason = contentTaskReasonLabel(item.reason);
  const running = item.status === "running" || item.path === currentPath;
  const rowClass = running ? "border-primary/32 bg-primary/6" : "border-border/48 bg-muted/30";
  return (
    <li
      className={`flex min-w-0 flex-col gap-2 rounded-2xl border px-3 py-2 ${rowClass}`}
      data-testid="content-task-item"
      data-path={item.path}
      data-status={item.status}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge tone={contentTaskItemTone(item.status)} data-testid="content-task-item-status">
          {CONTENT_TASK_ITEM_LABELS[item.status]}
        </Badge>
        <Button
          variant="bare"
          size="content"
          className="min-h-0 min-w-0 max-w-full truncate rounded-md p-0 font-mono text-xs text-foreground underline decoration-border underline-offset-2 hover:bg-transparent hover:decoration-primary"
          title={onSelectPath ? `定位到 ${item.path}` : item.path}
          onClick={onSelectPath ? () => onSelectPath(item.path) : undefined}
          disabled={!onSelectPath}
          data-testid="content-task-item-path"
        >
          <span className="truncate">{item.path}</span>
        </Button>
        {showMedia && item.mediaTotal > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            附件 {item.mediaProcessed}/{item.mediaTotal}
            {item.mediaFailed > 0 ? ` · 失败 ${item.mediaFailed}` : ""}
          </span>
        ) : null}
        {item.retryable && onRetry ? (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={retrying}
            onClick={onRetry}
            title="重试该任务中所有可重试的项"
            data-testid="content-task-item-retry"
          >
            <RotateCcw className="size-3" />
            重试
          </Button>
        ) : null}
      </div>
      {reason ? <p className="break-words text-xs text-muted-foreground">{reason}</p> : null}
      {item.error ? (
        <p className="break-words text-xs text-destructive" data-testid="content-task-item-error">
          {item.error}
        </p>
      ) : null}
    </li>
  );
}

export function ContentTaskProgressCard({
  progress,
  repository,
  title,
  description,
  cancelling = false,
  retrying = false,
  onCancel,
  onRetry,
  onSelectPath,
  emptyNote,
}: {
  progress: ContentTaskProgress;
  repository?: string | null;
  title?: string;
  description?: string;
  cancelling?: boolean;
  retrying?: boolean;
  onCancel?: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
  onSelectPath?: (path: string) => void;
  emptyNote?: string;
}) {
  const { task, items } = progress;
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [expanded, setExpanded] = useState(false);
  const active = isContentTaskActive(task);
  const result = useMemo(() => readTaskResult(progress.result), [progress.result]);

  const attention = useMemo(() => items.filter(needsAttention), [items]);
  const defaultRows = useMemo(
    () =>
      items.filter(
        (item) =>
          item.path === task.currentPath || item.status === "running" || needsAttention(item)
      ),
    [items, task.currentPath]
  );
  /** Terminal successful tasks have no current/attention rows; show their results. */
  const fallbackAll = !active && !expanded && filter === "all" && defaultRows.length === 0;
  const visible = useMemo(() => {
    if (expanded || fallbackAll)
      return filter === "all" ? items : items.filter((item) => itemMatchesFilter(item, filter));
    return filter === "all"
      ? defaultRows
      : defaultRows.filter((item) => itemMatchesFilter(item, filter));
  }, [defaultRows, expanded, fallbackAll, filter, items]);

  const filterCount = (value: ItemFilter) =>
    value === "all" ? items.length : items.filter((item) => itemMatchesFilter(item, value)).length;

  const canRetry =
    Boolean(onRetry) &&
    !active &&
    items.some(
      (item) => item.retryable && ["failed", "pending", "skipped", "blocked"].includes(item.status)
    );
  const heading = title ?? `${contentTaskOperationLabel(task.operation)}任务`;

  return (
    <Card
      data-testid="content-task-progress"
      data-operation={task.operation ?? task.kind}
      data-status={task.status}
    >
      <CardHeader className="gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CardTitle className="text-base">{heading}</CardTitle>
          <Badge tone={contentTaskStatusTone(task.status)} data-testid="content-task-status">
            {contentTaskStatusLabel(task.status)}
          </Badge>
          <Badge tone="outline">{contentTaskPhaseLabel(task.phase)}</Badge>
          {task.cancelRequested && active ? <Badge tone="warning">取消中</Badge> : null}
        </div>
        <CardDescription data-testid="content-task-description">
          {description ??
            `${contentTaskOperationLabel(task.operation)} · 开始于 ${formatDateTime(task.startedAt)}${
              task.finishedAt ? ` · 结束于 ${formatDateTime(task.finishedAt)}` : ""
            }`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums" data-testid="content-task-percent">
              {task.percent === null ? "进度未知" : `${task.percent}%`}
            </span>
            <span className="min-w-0 truncate font-mono" title={task.currentPath ?? undefined}>
              {task.currentPath ?? (active ? "准备中" : "—")}
            </span>
          </div>
          {task.percent !== null || active ? (
            <Progress
              label={`${heading}进度`}
              value={task.percent === null ? undefined : task.percent}
              max={100}
              tone={progressTone(task)}
              indeterminate={active && task.percent === null}
              testId="content-task-progress-bar"
            />
          ) : null}
        </div>

        <ContentTaskMetrics task={task} />

        {task.finishedAt !== null || !active ? (
          <TaskResultSummary task={task} result={result} repository={repository} />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {active && onCancel ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelling || task.cancelRequested}
              onClick={() => onCancel(task.id)}
              data-testid="content-task-cancel"
            >
              <PauseCircle className="size-4" />
              {task.cancelRequested ? "取消中" : "取消任务"}
            </Button>
          ) : null}
          {canRetry && onRetry ? (
            <Button
              variant="outline"
              size="sm"
              disabled={retrying}
              onClick={() => onRetry(task.id)}
              data-testid="content-task-retry"
            >
              {retrying ? <Spinner /> : <RefreshCcw className="size-4" />}
              重试失败与未处理项
            </Button>
          ) : null}
          {task.error && active ? (
            <span className="text-xs text-destructive">{task.error}</span>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-border/48 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <fieldset
              className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0"
              aria-label="任务项筛选"
            >
              {ITEM_FILTERS.map((entry) => {
                const count = filterCount(entry.value);
                return (
                  <Button
                    key={entry.value}
                    type="button"
                    size="sm"
                    variant={filter === entry.value ? "default" : "outline"}
                    className="rounded-full! tabular-nums"
                    aria-pressed={filter === entry.value}
                    disabled={entry.value !== "all" && count === 0}
                    onClick={() => setFilter(entry.value)}
                    data-testid={`content-task-filter-${entry.value}`}
                  >
                    {entry.label} {count}
                  </Button>
                );
              })}
            </fieldset>
            <Button
              size="sm"
              variant="ghost"
              disabled={fallbackAll}
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
              data-testid="content-task-toggle-all"
            >
              {fallbackAll ? "全部项" : expanded ? "收起" : "展开全部"}
            </Button>
          </div>

          {items.length === 0 ? (
            <div data-testid="content-task-items-empty">
              <Alert>
                {emptyNote ??
                  "该任务没有逐项记录：它创建于逐项进度上线之前，只能显示整体计数与结果摘要。"}
              </Alert>
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              title="没有符合条件的任务项"
              description="切换到“全部”查看当前任务已记录的所有路径。"
            />
          ) : (
            <ul className="space-y-2" data-testid="content-task-items">
              {visible.map((item) => (
                <TaskItemRow
                  key={item.path}
                  item={item}
                  currentPath={task.currentPath}
                  retrying={retrying}
                  onRetry={canRetry && item.retryable ? () => onRetry?.(task.id) : undefined}
                  onSelectPath={onSelectPath}
                />
              ))}
            </ul>
          )}
          {!expanded && attention.length > visible.length ? (
            <p className="text-xs text-muted-foreground">
              默认只显示当前项与需要处理的结果；共 {attention.length} 项需关注。
            </p>
          ) : null}

          {task.operation ? (
            <Disclosure summary="任务身份" className="text-xs text-muted-foreground">
              <p className="mt-2 break-all font-mono">{task.id}</p>
            </Disclosure>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
