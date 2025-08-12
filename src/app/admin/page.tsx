import { redirect } from "next/navigation";

export default function AdminPage() {
  // 重定向到仪表盘
  redirect("/admin/dashboard");
}
