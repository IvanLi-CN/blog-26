/**
 * 编辑器状态提供者 - 使用 Jotai
 *
 * 这个组件提供全局的编辑器状态管理，包括：
 * - 标签页状态管理
 * - URL 同步
 * - 文件树状态同步
 */

"use client";

import { Provider as JotaiProvider, useAtom, useSetAtom } from "jotai";
import { useRouter, useSearchParams } from "next/navigation";
import type React from "react";
import { useEffect } from "react";
import { activeContentIdentifierAtom, setActiveTabIdAtom, tabsAtom } from "../../store/editorAtoms";
import { debouncedUpdateUrlAtom, initializeFromUrlAtom } from "../../store/urlSyncAtoms";

// URL 同步组件
function UrlSyncManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeContentIdentifier] = useAtom(activeContentIdentifierAtom);
  const [tabs] = useAtom(tabsAtom);
  const updateUrl = useSetAtom(debouncedUpdateUrlAtom);
  const initializeFromUrl = useSetAtom(initializeFromUrlAtom);

  // 监听活动内容标识符变化，同步到 URL
  useEffect(() => {
    if (activeContentIdentifier) {
      console.log("[UrlSyncManager] 活动内容标识符变化，更新URL:", activeContentIdentifier);
      updateUrl(router);
    }
  }, [activeContentIdentifier, router, updateUrl]);

  // 初始化时从 URL 恢复状态
  useEffect(() => {
    if (searchParams && tabs.length > 0) {
      console.log("[UrlSyncManager] 从URL初始化编辑器状态");
      initializeFromUrl(searchParams, tabs);
    }
  }, [searchParams, tabs, initializeFromUrl]);

  return null; // 这是一个纯逻辑组件，不渲染任何内容
}

// 主要的状态提供者组件
interface EditorStateProviderProps {
  children: React.ReactNode;
}

export function EditorStateProvider({ children }: EditorStateProviderProps) {
  return (
    <JotaiProvider>
      <UrlSyncManager />
      {children}
    </JotaiProvider>
  );
}

// 便捷的 Hook 用于在组件中使用编辑器状态
export function useEditorState() {
  const [activeTabId, setActiveTabId] = useAtom(setActiveTabIdAtom);
  const [tabs] = useAtom(tabsAtom);
  const [activeContentIdentifier] = useAtom(activeContentIdentifierAtom);

  return {
    activeTabId,
    tabs,
    activeContentIdentifier,
    setActiveTabId,
  };
}

export default EditorStateProvider;
