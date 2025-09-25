"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";

interface JobRunDetailProps {
  runId: string;
}

export function JobRunDetail({ runId }: JobRunDetailProps) {
  const { data: run, isLoading, error } = trpc.admin.jobs.getRun.useQuery({ id: runId });
  const { data: log } = trpc.admin.jobs.getRunLog.useQuery(
    { id: runId },
    { enabled: Boolean(run) }
  );

  if (isLoading) return <div>加载中...</div>;
  if (error || !run) return <div className="text-red-600">无法加载执行记录。</div>;

  return (
    <div className="space-y-4">
      <div>
        <Link className="text-blue-600 hover:underline" href={`/admin/schedules/${run.jobKey}`}>
          &larr; 返回任务
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">{run.jobName}</h1>
      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
        <div>
          状态：
          <span
            className={
              run.status === "success"
                ? "text-green-600"
                : run.status === "error"
                  ? "text-red-600"
                  : "text-yellow-600"
            }
          >
            {run.status}
          </span>
        </div>
        <div>开始时间：{new Date(run.startedAt).toLocaleString()}</div>
        <div>结束时间：{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "-"}</div>
        <div>触发：{run.triggeredBy}</div>
        <div>
          日志文件：<code className="text-xs">{run.logPath}</code>{" "}
          {run.logDeleted ? <span className="ml-2 text-xs text-gray-500">（已删除）</span> : null}
        </div>
        {run.errorMessage ? <div className="text-red-600">错误：{run.errorMessage}</div> : null}
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-2">执行日志</h2>
        {log?.exists ? (
          <pre className="p-3 bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 overflow-auto max-h-[70vh] whitespace-pre-wrap">
            {log.content}
          </pre>
        ) : (
          <div className="text-sm text-gray-500">日志文件不存在或已删除。</div>
        )}
      </div>
    </div>
  );
}
