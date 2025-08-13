/**
 * 编辑器专用布局
 *
 * 不使用默认的 admin layout，提供全屏编辑体验
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminFromRequest } from "../../../../lib/auth";

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  // 检查管理员权限
  const headersList = await headers();
  const isAdmin = await isAdminFromRequest(headersList);

  if (!isAdmin) {
    redirect("/admin-login");
  }

  // 直接返回子组件，不添加任何容器
  return children;
}
