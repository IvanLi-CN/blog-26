"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

function formatTime(ts?: number | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export function ScheduledJobsPanel() {
  const { data: jobs, refetch } = trpc.admin.jobs.list.useQuery();
  const { data: recentRuns, refetch: refetchRuns } = trpc.admin.jobs.runs.useQuery({ limit: 10 });
  const trigger = trpc.admin.jobs.trigger.useMutation({
    onSuccess: () => {
      refetch();
      refetchRuns();
    },
  });
  const [triggering, setTriggering] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-semibold mb-4">定时任务</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left">名称</th>
                <th className="px-4 py-2 text-left">周期</th>
                <th className="px-4 py-2 text-left">上次执行</th>
                <th className="px-4 py-2 text-left">下次执行</th>
                <th className="px-4 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs?.map((j) => (
                <tr
                  key={j.key}
                  className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800"
                >
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      <Link href={`/admin/schedules/${j.key}`}>{j.name}</Link>
                    </div>
                    <div className="text-xs text-gray-500">
                      {j.key}
                      {j.running ? " · 运行中" : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2">{j.scheduleText}</td>
                  <td className="px-4 py-2">{formatTime(j.lastRunAt)}</td>
                  <td className="px-4 py-2">{formatTime(j.nextRunAt)}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
                      disabled={trigger.isPending || j.running || triggering === j.key}
                      onClick={async () => {
                        setTriggering(j.key);
                        try {
                          await trigger.mutateAsync({ key: j.key });
                        } finally {
                          setTriggering(null);
                        }
                      }}
                    >
                      手动触发
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">最近执行记录</h2>
        <div className="space-y-2">
          {recentRuns?.map((r) => (
            <div key={r.id} className="p-3 rounded border dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    className="font-medium hover:underline"
                    href={`/admin/schedules/runs/${r.id}`}
                  >
                    {r.jobName}
                  </Link>
                  <span className="ml-2 text-xs text-gray-500">{r.jobKey}</span>
                </div>
                <span
                  className={`text-sm ${r.status === "success" ? "text-green-600" : r.status === "error" ? "text-red-600" : "text-yellow-600"}`}
                >
                  {r.status}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                开始 {formatTime(r.startedAt)} · 结束 {formatTime(r.finishedAt)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
