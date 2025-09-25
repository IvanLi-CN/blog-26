"use client";

import Link from "next/link";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

interface JobRunDetailProps {
  runId: string;
}

type ParsedLogEntry = {
  ts: string;
  level: string;
  message: string;
  data?: Record<string, unknown>;
};

const STATUS_COLORS: Record<string, string> = {
  running: "badge-warning",
  success: "badge-success",
  error: "badge-error",
};

const LEVEL_DOT_CLASSES: Record<string, string> = {
  info: "bg-primary",
  error: "bg-error",
  debug: "bg-neutral",
};

const LEVEL_BADGES: Record<string, string> = {
  info: "badge-ghost",
  error: "badge-error",
  debug: "badge-neutral",
};

function statusBadge(status: string) {
  return (
    <span className={`badge badge-sm uppercase ${STATUS_COLORS[status] ?? "badge-ghost"}`}>
      {status}
    </span>
  );
}

function formatTimestamp(ts: string) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export function JobRunDetail({ runId }: JobRunDetailProps) {
  const {
    data: run,
    isLoading,
    error,
    refetch,
    isFetching,
  } = trpc.admin.jobs.getRun.useQuery({ id: runId });
  const {
    data: log,
    isLoading: logLoading,
    refetch: refetchLog,
  } = trpc.admin.jobs.getRunLog.useQuery({ id: runId }, { enabled: Boolean(run) });

  const logEvents = useMemo<ParsedLogEntry[]>(() => {
    if (!log?.exists || !log.content) return [];
    return log.content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          const parsed = JSON.parse(line) as ParsedLogEntry;
          return parsed;
        } catch (_err) {
          return {
            ts: new Date().toISOString(),
            level: "info",
            message: line,
          };
        }
      });
  }, [log?.content, log?.exists]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="alert alert-error">
        <span>无法加载执行记录。</span>
        {error ? <span>{error.message}</span> : null}
      </div>
    );
  }

  const infoContent = (
    <div className="text-sm text-base-content/70 space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-medium">任务 Key</span>
        <code className="font-mono text-xs break-all">{run.jobKey}</code>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium">触发方式</span>
        <span className="badge badge-ghost badge-sm uppercase">{run.triggeredBy}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium">开始时间</span>
        <span>{new Date(run.startedAt).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium">结束时间</span>
        <span>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "-"}</span>
      </div>
      <div className="flex items-start gap-2">
        <span className="font-medium">日志文件</span>
        <div className="flex flex-col gap-1">
          <code className="font-mono text-xs break-all">{run.logPath}</code>
          {run.logDeleted ? (
            <span className="text-xs text-base-content/50">（日志文件已删除）</span>
          ) : null}
        </div>
      </div>
      {run.errorMessage ? (
        <div className="alert alert-warning py-3 text-sm">
          <span>错误信息：{run.errorMessage}</span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Link href={`/admin/schedules/${run.jobKey}`} className="btn btn-ghost btn-sm">
          ← 返回任务
        </Link>
        <div className="flex items-center gap-3">
          {statusBadge(run.status)}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              refetch();
              refetchLog();
            }}
            disabled={isFetching || logLoading}
          >
            {isFetching || logLoading ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "刷新"
            )}
          </button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] gap-6 space-y-6 lg:space-y-0">
        <div className="hidden lg:block">
          <div className="card bg-base-100 border border-base-200 shadow-xl h-full">
            <div className="card-body space-y-3">
              <h1 className="card-title text-2xl">{run.jobName}</h1>
              {infoContent}
            </div>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-200 shadow-xl">
          <div className="card-body space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-xl">实时日志</h2>
              <span className="text-xs text-base-content/50">JSONL 结构化输出</span>
            </div>

            {logLoading ? (
              <div className="flex justify-center py-12">
                <span className="loading loading-spinner loading-md text-primary" />
              </div>
            ) : log?.exists ? (
              logEvents.length > 0 ? (
                <ul className="timeline timeline-vertical timeline-compact">
                  {logEvents.map((entry, index) => {
                    const dotClass = LEVEL_DOT_CLASSES[entry.level] ?? LEVEL_DOT_CLASSES.info;
                    const formattedTs = formatTimestamp(entry.ts);
                    return (
                      <li key={`${entry.ts}-${index}`}>
                        <div className="timeline-start text-xs text-base-content/60">
                          {formattedTs}
                        </div>
                        <div className={`timeline-middle h-3 w-3 rounded-full ${dotClass}`} />
                        <div className="timeline-end w-full">
                          <div className="card bg-base-200/70 border border-base-300 shadow-sm">
                            <div className="card-body py-4 px-5 space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-base-content">
                                  {entry.message}
                                </span>
                                <span
                                  className={`badge badge-xs uppercase ${LEVEL_BADGES[entry.level] ?? "badge-outline"}`}
                                >
                                  {entry.level}
                                </span>
                              </div>
                              {entry.data ? (
                                <pre className="bg-base-100 rounded-box p-3 text-xs max-h-60 overflow-auto">
                                  {JSON.stringify(entry.data, null, 2)}
                                </pre>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="alert alert-info">
                  <span>日志文件暂无可解析的内容。</span>
                </div>
              )
            ) : (
              <div className="alert alert-info">
                <span>日志文件不存在或已删除。</span>
              </div>
            )}

            <div className="lg:hidden">
              <details className="collapse collapse-arrow border border-base-200 bg-base-100">
                <summary className="collapse-title text-sm font-medium text-base-content/70">
                  查看任务信息
                </summary>
                <div className="collapse-content space-y-3 pt-0">{infoContent}</div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
