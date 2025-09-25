"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";

interface JobRunsListProps {
  jobKey: string;
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

export function JobRunsList({ jobKey }: JobRunsListProps) {
  const { data, refetch, isLoading, isFetching, error } = trpc.admin.jobs.runs.useQuery({
    key: jobKey,
    limit: 50,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error">
        <span>加载失败：{error.message}</span>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="card bg-base-100 border border-dashed border-base-200 shadow-sm">
        <div className="card-body items-center text-center space-y-2">
          <h3 className="font-semibold text-base-content">尚无执行记录</h3>
          <p className="text-sm text-base-content/60">
            可在任务列表中手动触发一次，之后这里会显示执行历史。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-base-content/80">共 {data.length} 条执行记录</h2>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <span className="loading loading-spinner loading-xs" /> : "刷新"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.map((run) => (
          <div key={run.id} className="card bg-base-100 border border-base-200 shadow-md">
            <div className="card-body gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Link
                    href={`/admin/schedules/runs/${run.id}`}
                    className="text-base font-semibold leading-tight hover:text-primary"
                  >
                    {run.jobName}
                  </Link>
                  <div className="text-xs text-base-content/50 flex items-center gap-2">
                    <span>执行 ID</span>
                    <code className="font-mono text-xs break-all">{run.id}</code>
                  </div>
                </div>
                {statusBadge(run.status)}
              </div>

              <div className="text-sm text-base-content/70 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">开始</span>
                  <span>{new Date(run.startedAt).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">结束</span>
                  <span>{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "-"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">触发</span>
                  <span className="badge badge-ghost badge-sm font-medium uppercase">
                    {run.triggeredBy}
                  </span>
                </div>
              </div>

              <div className="card-actions justify-end">
                <Link href={`/admin/schedules/runs/${run.id}`} className="btn btn-xs btn-ghost">
                  查看详情
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
