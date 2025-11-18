import { JobRunDetail } from "@/components/admin/JobRunDetail";
import { ensureAdminOrInterrupt } from "@/lib/admin-gate";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureAdminOrInterrupt();
  return (
    <div className="container mx-auto px-4 py-8">
      <JobRunDetail runId={id} />
    </div>
  );
}
