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
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-[1.8rem] border border-[rgba(var(--nature-border-rgb),0.64)] bg-[rgba(var(--nature-surface-rgb),0.78)] px-4 py-4 sm:px-6 sm:py-5"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="nature-skeleton h-4 w-24 rounded"></div>
                <div className="nature-skeleton h-4 w-16 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="nature-skeleton h-4 w-full rounded"></div>
                <div className="nature-skeleton h-4 w-3/4 rounded"></div>
                <div className="nature-skeleton h-4 w-1/2 rounded"></div>
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
