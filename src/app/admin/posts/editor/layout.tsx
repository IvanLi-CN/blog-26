/**
 * 编辑器专用布局
 *
 * 不使用默认的 admin layout，提供全屏编辑体验
 */

import { ensureAdminOrInterrupt } from "../../../../lib/admin-gate";

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  await ensureAdminOrInterrupt();

  // 直接返回子组件，不添加任何容器
  return children;
}
