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
      <div className="rounded-box border border-dashed border-base-300 bg-base-100 px-6 py-10 text-center space-y-2">
        <h3 className="font-semibold text-base-content">尚无执行记录</h3>
        <p className="text-sm text-base-content/60">
          可在任务列表中手动触发一次，之后这里会显示执行历史。
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-box border border-base-200 bg-base-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-200 px-6 py-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-base-content">执行记录</h2>
          <p className="text-sm text-base-content/60">
            共 {data.length} 条，最近的任务排在最上方。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-outline btn-primary"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <span className="loading loading-spinner loading-xs" /> : "刷新"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra table-pin-rows">
          <thead>
            <tr>
              <th className="w-2/5 align-middle">运行信息</th>
              <th className="w-1/5 align-middle">开始时间</th>
              <th className="w-1/5 align-middle">结束时间</th>
              <th className="w-1/6 align-middle">触发</th>
              <th className="w-40 text-right align-middle">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map((run) => (
              <tr key={run.id} className="hover">
                <td className="align-middle">
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/admin/schedules/runs/${run.id}`}
                      className="font-semibold text-base-content hover:text-primary transition-colors"
                    >
                      {run.jobName}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
                      <span className="font-mono">ID: {run.id}</span>
                      {statusBadge(run.status)}
                    </div>
                  </div>
                </td>
                <td className="align-middle text-sm text-base-content/70">
                  {new Date(run.startedAt).toLocaleString()}
                </td>
                <td className="align-middle text-sm text-base-content/70">
                  {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "-"}
                </td>
                <td className="align-middle">
                  <span className="badge badge-ghost badge-sm uppercase">{run.triggeredBy}</span>
                </td>
                <td className="align-middle text-right">
                  <Link
                    href={`/admin/schedules/runs/${run.id}`}
                    className="btn btn-sm btn-ghost whitespace-nowrap"
                  >
                    查看详情
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
