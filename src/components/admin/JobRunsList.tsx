"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";

interface JobRunsListProps {
  jobKey: string;
}

export function JobRunsList({ jobKey }: JobRunsListProps) {
  const { data, isLoading, error, refetch } = trpc.admin.jobs.runs.useQuery({
    key: jobKey,
    limit: 50,
  });

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div className="text-red-600">加载失败：{error.message}</div>;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">执行记录</h2>
        <button
          type="button"
          className="text-sm text-blue-600 hover:underline"
          onClick={() => refetch()}
        >
          刷新
        </button>
      </div>
      {data?.length ? (
        data.map((r) => (
          <div
            key={r.id}
            className="p-3 rounded border dark:border-gray-700 flex items-center justify-between"
          >
            <div>
              <div className="font-medium">
                <Link href={`/admin/schedules/runs/${r.id}`}>{r.jobName}</Link>
              </div>
              <div className="text-xs text-gray-500">{new Date(r.startedAt).toLocaleString()}</div>
            </div>
            <div
              className={`text-sm ${r.status === "success" ? "text-green-600" : r.status === "error" ? "text-red-600" : "text-yellow-600"}`}
            >
              {r.status}
            </div>
          </div>
        ))
      ) : (
        <div className="text-sm text-gray-500">暂无执行记录。</div>
      )}
    </div>
  );
}
