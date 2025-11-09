import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminNavbar from "../../components/admin/AdminNavbar";
import { getAdminEmail, getSsoEmailHeaderName } from "../../lib/admin-config";
import { isAdminFromRequest } from "../../lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 检查管理员权限
  const headersList = await headers();
  const emailHeaderName = getSsoEmailHeaderName();
  const remoteEmail = headersList.get(emailHeaderName);
  const adminEmail = getAdminEmail();

  const isAdmin = await isAdminFromRequest(headersList);
  const headerSaysAdmin = Boolean(adminEmail && remoteEmail === adminEmail);
  if (!isAdmin && !headerSaysAdmin) {
    redirect("/admin-login");
  }

  return (
    <div className="min-h-screen bg-base-200">
      <AdminNavbar />

      {/* 主要内容区域 */}
      <main className="w-full px-4 py-8">{children}</main>
    </div>
  );
}
