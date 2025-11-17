import Link from "next/link";
import { JobRunsList } from "@/components/admin/JobRunsList";
import { ensureAdminOrInterrupt } from "@/lib/admin-gate";

export default async function JobRunsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  await ensureAdminOrInterrupt();
  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">任务执行记录</h1>
          <p className="text-sm text-base-content/60">
            查看 <span className="badge badge-outline badge-sm font-mono">{key}</span>{" "}
            的历史运行情况与日志。
          </p>
        </div>
        <Link href="/admin/schedules" className="btn btn-sm btn-ghost">
          ← 返回任务列表
        </Link>
      </div>
      <JobRunsList jobKey={key} />
    </div>
  );
}
