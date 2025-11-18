import { redirect } from "next/navigation";
import { ensureAdminOrInterrupt } from "../../../lib/admin-gate";

export const metadata = {
  title: "页面重定向",
  description: "重定向到数据同步页面",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminCachePage() {
  await ensureAdminOrInterrupt();
  // 重定向到新的数据同步页面
  redirect("/admin/data-sync");
}
