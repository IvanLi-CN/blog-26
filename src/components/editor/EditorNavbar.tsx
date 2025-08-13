"use client";

/**
 * 编辑器专用导航栏
 *
 * 简化的导航栏，专为编辑器界面设计
 */

import Link from "next/link";

export function EditorNavbar() {
  return (
    <div className="navbar bg-base-100 shadow-lg border-b border-base-300 flex-shrink-0">
      <div className="flex-1">
        <Link className="btn btn-ghost text-xl" href="/admin/dashboard">
          🛠️ 管理后台
        </Link>
      </div>
      <div className="flex-none">
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
            <Link href="/admin/content-sync">内容同步</Link>
          </li>
          <li>
            <Link href="/" className="btn btn-outline btn-sm">
              返回首页
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
