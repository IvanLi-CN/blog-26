/**
 * 内容同步管理页面
 *
 * 提供内容源管理和同步控制的管理员界面
 */

import type { Metadata } from "next";
import { ContentSyncManager } from "../../../components/admin/ContentSyncManager";
import { ensureAdminOrInterrupt } from "../../../lib/admin-gate";

export const metadata: Metadata = {
  title: "内容同步管理 - 管理后台",
  description: "管理多源内容采集和同步",
};

export default async function ContentSyncPage() {
  await ensureAdminOrInterrupt();
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">内容同步管理</h1>
        <p className="text-gray-600 dark:text-gray-400">
          管理多源内容采集系统，同步本地文件和远程 WebDAV 内容
        </p>
      </div>

      <ContentSyncManager />
    </div>
  );
}
