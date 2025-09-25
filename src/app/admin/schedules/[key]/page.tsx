import { JobRunsList } from "@/components/admin/JobRunsList";

export default async function JobRunsPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">任务执行记录 · {key}</h1>
      <JobRunsList jobKey={key} />
    </div>
  );
}
