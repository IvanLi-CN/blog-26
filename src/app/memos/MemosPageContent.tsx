"use client";

import { MemosApp } from "../../components/memos/MemosApp";
import { useAuth } from "../../hooks/useAuth";

/**
 * Memos 页面内容组件
 *
 * 根据用户权限动态控制功能显示
 */
export function MemosPageContent() {
  const { isAdmin, isLoading } = useAuth();

  // 加载状态：显示骨架屏，避免权限检查期间的界面闪烁
  if (isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        {/* 快速编辑器骨架屏（仅在可能是管理员时显示） */}
        <div className="card bg-base-100 shadow-xl animate-pulse">
          <div className="card-body p-4 sm:p-6">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-5 h-5 bg-base-300 rounded"></div>
              <div className="w-32 h-6 bg-base-300 rounded"></div>
            </div>
            <div className="w-full h-32 bg-base-300 rounded"></div>
            <div className="flex justify-between items-center mt-4">
              <div className="w-20 h-4 bg-base-300 rounded"></div>
              <div className="w-16 h-8 bg-base-300 rounded"></div>
            </div>
          </div>
        </div>

        {/* Memo 列表骨架屏 */}
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card bg-base-100 shadow-xl animate-pulse">
              <div className="card-body px-4 py-3 sm:px-6 sm:py-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="w-24 h-4 bg-base-300 rounded"></div>
                  <div className="w-16 h-4 bg-base-300 rounded"></div>
                </div>
                <div className="space-y-2">
                  <div className="w-full h-4 bg-base-300 rounded"></div>
                  <div className="w-3/4 h-4 bg-base-300 rounded"></div>
                  <div className="w-1/2 h-4 bg-base-300 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 根据权限渲染不同的功能
  return (
    <MemosApp
      publicOnly={!isAdmin} // 管理员可以看到所有内容，普通用户只看公开内容
      showManageFeatures={isAdmin} // 只有管理员显示管理功能
      initialView="list"
    />
  );
}
