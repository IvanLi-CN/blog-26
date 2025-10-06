import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import ThemeToggle from "../../components/common/ThemeToggle";
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
      {/* 管理员导航栏 */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <Link className="btn btn-ghost text-xl" href="/admin/dashboard">
            管理后台
          </Link>
        </div>
        <div className="flex-none flex items-center">
          <ul className="menu menu-horizontal px-1">
            <li>
              <Link href="/admin/dashboard">仪表盘</Link>
            </li>
            <li>
              <Link href="/admin/posts">文章管理</Link>
            </li>
            <li>
              <Link href="/admin/comments">评论管理</Link>
            </li>
            <li>
              <Link href="/admin/data-sync">数据同步</Link>
            </li>
            <li>
              <details>
                <summary>更多</summary>
                <ul className="bg-base-100 rounded-t-none p-2 w-40">
                  <li>
                    <Link href="/admin/cache">缓存管理</Link>
                  </li>
                  <li>
                    <Link href="/admin/vectorize">向量化</Link>
                  </li>
                  <li>
                    <Link href="/admin/schedules">定时任务</Link>
                  </li>
                  <li>
                    <Link href="/admin/pats">访问令牌</Link>
                  </li>
                  <li>
                    <Link href="/admin/trpc-docs">API 文档</Link>
                  </li>
                </ul>
              </details>
            </li>
            <li>
              <Link href="/" className="btn btn-outline btn-sm">
                返回首页
              </Link>
            </li>
          </ul>
          <div className="ml-2">
            <ThemeToggle iconClass="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 主要内容区域 */}
      <main className="w-full px-4 py-8">{children}</main>
    </div>
  );
}
