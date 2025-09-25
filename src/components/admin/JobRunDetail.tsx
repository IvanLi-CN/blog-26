"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";

interface JobRunDetailProps {
  runId: string;
}

function statusBadge(status: string) {
  const palette: Record<string, string> = {
    running: "badge-warning",
    success: "badge-success",
    error: "badge-error",
  };
  return (
    <span className={`badge badge-sm uppercase ${palette[status] ?? "badge-ghost"}`}>{status}</span>
  );
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card bg-base-100 border border-base-200 shadow-xl">
          <div className="card-body space-y-3">
            <h1 className="card-title text-2xl">{run.jobName}</h1>
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
          </div>
        </div>

        <div className="card bg-base-100 border border-base-200 shadow-xl h-full">
          <div className="card-body space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="card-title text-xl">执行日志</h2>
              <span className="text-xs text-base-content/50">自动同步最新文件内容</span>
            </div>
            {logLoading ? (
              <div className="flex justify-center py-12">
                <span className="loading loading-spinner loading-md text-primary" />
              </div>
            ) : log?.exists ? (
              <pre className="bg-base-200/60 text-sm rounded-box p-4 overflow-auto max-h-[60vh] whitespace-pre-wrap">
                {log.content}
              </pre>
            ) : (
              <div className="alert alert-info">
                <span>日志文件不存在或已删除。</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
