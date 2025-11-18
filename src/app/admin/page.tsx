import { redirect } from "next/navigation";
import { ensureAdminOrInterrupt } from "../../lib/admin-gate";

export default async function AdminPage() {
  await ensureAdminOrInterrupt();
  // 重定向到仪表盘
  redirect("/admin/dashboard");
}
