import type { Metadata } from "next";
import { ScheduledJobsPanel } from "@/components/admin/ScheduledJobsPanel";

export const metadata: Metadata = {
  title: "定时任务 - 管理后台",
};

export default function ScheduledJobsPage() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">定时任务中心</h1>
        <p className="text-base text-base-content/70 max-w-2xl">
          在这里监控后台任务的运行情况，手动触发关键步骤，并查看详细的执行日志，确保数据同步与向量化流程按预期运行。
        </p>
      </div>
      <ScheduledJobsPanel />
    </div>
  );
}
