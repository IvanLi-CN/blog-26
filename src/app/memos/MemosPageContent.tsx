"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { MemosApp } from "../../components/memos/MemosApp";
import type { TagIconMap } from "../../components/tag-icons/tag-icon-client";
import { useAuth } from "../../hooks/useAuth";
import type { AppRouter } from "../../server/router";

/**
 * Memos 页面内容组件
 *
 * 根据用户权限动态控制功能显示
 */
type RouterOutputs = inferRouterOutputs<AppRouter>;
type MemosListOutput = RouterOutputs["memos"]["list"];

export function MemosPageContent({
  initialIsAdmin = false,
  initialMemos,
  tagIconMap,
  tagIconSvgMap,
  localSourceEnabled = true,
  localMemoRootPath,
}: {
  initialIsAdmin?: boolean;
  initialMemos?: MemosListOutput;
  tagIconMap?: TagIconMap;
  tagIconSvgMap?: Record<string, string | null>;
  localSourceEnabled?: boolean;
  localMemoRootPath?: string;
}) {
  const { isAdmin, isLoading } = useAuth();
  const effectiveIsAdmin = isLoading ? initialIsAdmin : isAdmin;

  // 加载中且无法判定为管理员时，仅显示列表骨架屏（避免闪烁）
  if (!initialMemos && isLoading && !initialIsAdmin) {
    return (
      <div className="space-y-6 sm:space-y-8">
        {/* 只显示 Memo 列表骨架屏，不显示快速编辑器骨架屏 */}
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

  // 根据权限渲染不同的功能（若 SSR 已判定为管理员，会立刻呈现管理功能，避免等待）
  return (
    <MemosApp
      publicOnly={!effectiveIsAdmin}
      showManageFeatures={effectiveIsAdmin}
      initialView="list"
      initialData={initialMemos}
      tagIconMap={tagIconMap}
      tagIconSvgMap={tagIconSvgMap}
      localSourceEnabled={localSourceEnabled}
      localMemoRootPath={localMemoRootPath}
    />
  );
}
