import type { Metadata } from "next";
import { ScheduledJobsPanel } from "@/components/admin/ScheduledJobsPanel";

export const metadata: Metadata = {
  title: "定时任务 - 管理后台",
};

export default function ScheduledJobsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">定时任务</h1>
      <ScheduledJobsPanel />
    </div>
  );
}
