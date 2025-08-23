/**
 * 数据同步管理页面
 *
 * 提供内容源管理和同步控制的管理员界面
 */

import type { Metadata } from "next";
import { ContentSyncManager } from "../../../components/admin/ContentSyncManager";

export const metadata: Metadata = {
  title: "数据同步 - 管理后台",
  description: "多源内容采集和数据同步管理",
};

export default function DataSyncPage() {
  return (
    <div className="px-4 py-8">
      <div className="max-w-6xl mx-auto mb-8">
        <h1 className="text-3xl font-bold text-base-content mb-2">数据同步</h1>
        <p className="text-base-content/70">
          从内容源单向同步数据到数据库，支持本地文件和远程 WebDAV 内容
        </p>
      </div>

      <ContentSyncManager />
    </div>
  );
}
