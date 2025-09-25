"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

function formatTime(ts?: number | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export function ScheduledJobsPanel() {
  const {
    data: jobs,
    isLoading: jobsLoading,
    isFetching: jobsFetching,
    refetch: refetchJobs,
  } = trpc.admin.jobs.list.useQuery();
  const {
    data: recentRuns,
    isLoading: runsLoading,
    isFetching: runsFetching,
    refetch: refetchRuns,
  } = trpc.admin.jobs.runs.useQuery({ limit: 12 });
  const trigger = trpc.admin.jobs.trigger.useMutation({
    onSuccess: () => {
      refetchJobs();
      refetchRuns();
    },
  });
  const [triggering, setTriggering] = useState<string | null>(null);

  const isLoading = useMemo(() => jobsLoading || runsLoading, [jobsLoading, runsLoading]);

  const renderStatusBadge = (status: string) => {
    const palette: Record<string, string> = {
      running: "badge-warning",
      success: "badge-success",
      error: "badge-error",
    };
    return (
      <span
        className={`badge badge-sm font-semibold uppercase ${palette[status] ?? "badge-ghost"}`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-10">
      <section className="card bg-base-100 border border-base-200 shadow-xl">
        <div className="card-body gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="card-title text-3xl">定时任务</h2>
              <p className="text-sm text-base-content/60">
                管理所有后台任务的调度频率、运行状态与下一次执行时间。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  refetchJobs();
                  refetchRuns();
                }}
                disabled={jobsFetching || runsFetching}
              >
                {jobsFetching || runsFetching ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  "刷新"
                )}
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <span className="loading loading-spinner loading-lg text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto border border-base-200 rounded-box">
              <table className="table table-pin-rows table-zebra">
                <thead>
                  <tr>
                    <th className="w-1/4">任务</th>
                    <th className="w-1/5">周期</th>
                    <th className="w-1/5">上次执行</th>
                    <th className="w-1/5">下次执行</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs?.map((job) => (
                    <tr key={job.key} className="hover">
                      <td>
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/admin/schedules/${job.key}`}
                            className="font-semibold text-base-content hover:text-primary transition-colors"
                          >
                            {job.name}
                          </Link>
                          <div className="text-xs text-base-content/60 flex items-center gap-2">
                            <span className="font-mono">{job.key}</span>
                            {job.running ? (
                              <span className="badge badge-xs badge-warning">运行中</span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral badge-outline badge-sm font-mono">
                          {job.scheduleText}
                        </span>
                      </td>
                      <td className="text-sm text-base-content/70">{formatTime(job.lastRunAt)}</td>
                      <td className="text-sm text-base-content/70">{formatTime(job.nextRunAt)}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={trigger.isPending || job.running || triggering === job.key}
                          onClick={async () => {
                            setTriggering(job.key);
                            try {
                              await trigger.mutateAsync({ key: job.key });
                            } finally {
                              setTriggering(null);
                            }
                          }}
                        >
                          {triggering === job.key || trigger.isPending ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            "手动触发"
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold">最近执行记录</h3>
            <p className="text-sm text-base-content/60">快速查看最新任务执行状态与时间线。</p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => refetchRuns()}
            disabled={runsFetching}
          >
            {runsFetching ? <span className="loading loading-spinner loading-xs" /> : "刷新记录"}
          </button>
        </div>

        {runsLoading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-dots loading-lg text-secondary" />
          </div>
        ) : recentRuns && recentRuns.length > 0 ? (
          <div className="rounded-box border border-base-200 divide-y divide-base-200">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-base-200/40"
              >
                <div className="min-w-[12rem] flex-1">
                  <Link
                    href={`/admin/schedules/runs/${run.id}`}
                    className="font-semibold text-base-content hover:text-primary transition-colors"
                  >
                    {run.jobName}
                  </Link>
                  <p className="text-xs text-base-content/50 font-mono mt-1">{run.jobKey}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-base-content/70">
                  <span className="font-medium">开始</span>
                  <span>{formatTime(run.startedAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-base-content/70">
                  <span className="font-medium">结束</span>
                  <span>{formatTime(run.finishedAt)}</span>
                </div>
                <div className="flex items-center gap-3 ml-auto">
                  {renderStatusBadge(run.status)}
                  <Link href={`/admin/schedules/runs/${run.id}`} className="btn btn-xs btn-ghost">
                    查看日志
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card bg-base-100 border border-dashed border-base-200">
            <div className="card-body items-center text-center space-y-2">
              <h4 className="font-semibold text-base-content">暂无执行记录</h4>
              <p className="text-sm text-base-content/60">
                可以通过上方列表的“手动触发”按钮立即启动任务，随后查看执行详情。
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
