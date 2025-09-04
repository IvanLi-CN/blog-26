/**
 * 编辑器状态管理 Hook
 *
 * 提供高级状态管理功能和副作用处理
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import type { EditorTab } from "../EditorStateContext";
import { useEditorState } from "../EditorStateContext";
import type { ContentSource } from "../PostEditorWrapper";
import {
  contentSourceToIdentifier,
  createTabId,
  generateUrlParams,
  parseUrlParams,
} from "../types/editorTypes";
import {
  createContentSource,
  extractFileNameWithoutExtension,
  slugToFilePaths,
  tabIdToSlug,
} from "../utils/pathUtils";
import { debounceScrollToFile } from "../utils/scrollUtils";

/**
 * 防抖延迟配置
 */
const DEBOUNCE_DELAYS = {
  URL_UPDATE: 300,
  SCROLL: 200,
} as const;

/**
 * 高级编辑器状态管理 Hook
 */
export function useAdvancedEditorState() {
  const { state, dispatch, ...actions } = useEditorState();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 防抖函数引用
  const debouncedScrollRef = useRef(debounceScrollToFile(DEBOUNCE_DELAYS.SCROLL));
  const urlUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // URL 同步效果 - 使用二元ID架构
  useEffect(() => {
    if (!searchParams) return;

    const identifier = parseUrlParams(searchParams);
    if (identifier) {
      console.log(`[EditorState] 从URL解析到标识符: ${JSON.stringify(identifier)}`);
      // TODO: 根据identifier恢复或打开对应文件
      // 这里可以调用openFile或其他恢复逻辑
    }
  }, [searchParams]);

  // 活动标签页变化时的副作用 - 使用二元ID架构
  useEffect(() => {
    if (!state.activeTabId) return;

    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!activeTab) return;

    // 更新 URL（防抖）
    if (urlUpdateTimeoutRef.current) {
      clearTimeout(urlUpdateTimeoutRef.current);
    }

    urlUpdateTimeoutRef.current = setTimeout(() => {
      // 使用二元ID生成URL参数
      if (activeTab.identifier) {
        const urlParams = generateUrlParams(activeTab.identifier);
        const newUrl = `${window.location.pathname}?${urlParams}`;

        router.replace(newUrl, { scroll: false });
      }
    }, DEBOUNCE_DELAYS.URL_UPDATE);

    // 展开文件路径
    if (activeTab.identifier) {
      actions.expandFolderPath(activeTab.identifier.path);
    }

    // 设置滚动目标
    if (activeTab.identifier) {
      actions.setScrollTarget(activeTab.identifier.path);
    }
  }, [
    state.activeTabId,
    actions.expandFolderPath,
    actions.setScrollTarget,
    router.replace,
    state.tabs.find,
    router,
    state.tabs,
  ]);

  // 滚动目标变化时的副作用
  useEffect(() => {
    if (state.scrollTarget) {
      debouncedScrollRef.current(state.scrollTarget);
      // 清除滚动目标
      setTimeout(() => {
        dispatch({ type: "SET_SCROLL_TARGET", payload: { target: null } });
      }, 1000);
    }
  }, [state.scrollTarget, dispatch]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current);
      }
    };
  }, []);

  /**
   * 智能打开文件
   * 如果文件已在标签页中则切换，否则创建新标签页
   */
  const openFile = useCallback(
    (contentSource: ContentSource, title?: string, content?: string) => {
      // 转换为二元标识符
      const identifier = contentSourceToIdentifier(contentSource);
      const tabId = createTabId(identifier);

      const existingTab = state.tabs.find((tab) => tab.id === tabId);

      if (existingTab) {
        // 切换到已存在的标签页
        actions.setActiveTab(existingTab.id);
      } else {
        // 创建新标签页
        const tabTitle = title || extractFileNameWithoutExtension(identifier.path) || "新文件";
        const newTab: EditorTab = {
          id: tabId,
          identifier,
          title: tabTitle,
          content: content || "",
          isDirty: false,
          mode: "wysiwyg",
          contentSource, // 保持兼容性
        };

        actions.addTab(newTab);
        actions.setActiveTab(newTab.id);
      }

      // 设置选中路径和滚动目标（使用原始路径）
      actions.setSelectedPath(identifier.path);
      actions.setScrollTarget(identifier.path);
    },
    [
      state.tabs,
      actions.addTab,
      actions.setActiveTab,
      actions.setSelectedPath,
      actions.setScrollTarget,
    ]
  );

  /**
   * 从 URL slug 恢复标签页状态
   */
  const restoreFromSlug = useCallback(
    async (slug: string) => {
      // 检查是否已有对应的标签页
      const existingTab = state.tabs.find((tab) => {
        const tabSlug = tabIdToSlug(tab.id);
        return tabSlug === slug;
      });

      if (existingTab) {
        actions.setActiveTab(existingTab.id);
        return;
      }

      // 尝试根据 slug 推断文件路径
      const possiblePaths = slugToFilePaths(slug);

      // 这里可以添加逻辑来检查哪个路径实际存在
      // 暂时使用第一个可能的路径
      const contentSource = createContentSource(possiblePaths[0]);

      // 创建新标签页（内容将由组件异步加载）
      const newTab: EditorTab = {
        id: contentSource.filePath,
        title: slug,
        content: "",
        isDirty: false,
        mode: "wysiwyg",
        contentSource,
      };

      actions.addTab(newTab);
    },
    [state.tabs, actions.addTab, actions.setActiveTab]
  );

  /**
   * 关闭标签页（带确认）
   */
  const closeTabWithConfirm = useCallback(
    (tabId: string) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;

      if (tab.isDirty) {
        const confirmed = window.confirm(`文件 "${tab.title}" 有未保存的更改，确定要关闭吗？`);
        if (!confirmed) return;
      }

      actions.removeTab(tabId);
    },
    [state.tabs, actions.removeTab]
  );

  /**
   * 保存当前标签页
   */
  const saveCurrentTab = useCallback(async () => {
    if (!state.activeTabId) return false;

    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!activeTab || !activeTab.isDirty) return true;

    try {
      // 这里应该调用实际的保存逻辑
      // 暂时只是标记为已保存
      actions.setTabDirty(activeTab.id, false);

      console.log(`[EditorState] 保存文件: ${activeTab.title}`);
      return true;
    } catch (error) {
      console.error(`[EditorState] 保存失败:`, error);
      return false;
    }
  }, [state.activeTabId, state.tabs, actions.setTabDirty]);

  /**
   * 获取当前活动标签页
   */
  const getActiveTab = useCallback(() => {
    if (!state.activeTabId) return null;
    return state.tabs.find((tab) => tab.id === state.activeTabId) || null;
  }, [state.activeTabId, state.tabs]);

  /**
   * 检查是否有未保存的更改
   */
  const hasUnsavedChanges = useCallback(() => {
    return state.tabs.some((tab) => tab.isDirty);
  }, [state.tabs]);

  /**
   * 获取未保存的标签页列表
   */
  const getUnsavedTabs = useCallback(() => {
    return state.tabs.filter((tab) => tab.isDirty);
  }, [state.tabs]);

  /**
   * 批量保存所有标签页
   */
  const saveAllTabs = useCallback(async () => {
    const unsavedTabs = getUnsavedTabs();
    const results = await Promise.allSettled(
      unsavedTabs.map((tab) => {
        // 这里应该调用实际的保存逻辑
        actions.setTabDirty(tab.id, false);
        return Promise.resolve(tab.id);
      })
    );

    const failedSaves = results.filter((result) => result.status === "rejected");
    if (failedSaves.length > 0) {
      console.error(`[EditorState] ${failedSaves.length} 个文件保存失败`);
      return false;
    }

    console.log(`[EditorState] 成功保存 ${unsavedTabs.length} 个文件`);
    return true;
  }, [getUnsavedTabs, actions.setTabDirty]);

  /**
   * 重置编辑器状态
   */
  const resetState = useCallback(() => {
    // 关闭所有标签页
    state.tabs.forEach((tab) => {
      actions.removeTab(tab.id);
    });

    // 清除选中状态
    actions.setSelectedPath(null);
    actions.setScrollTarget(null);

    console.log(`[EditorState] 重置编辑器状态`);
  }, [state.tabs, actions.removeTab, actions.setSelectedPath, actions.setScrollTarget]);

  return {
    // 状态
    ...state,

    // 基础操作
    ...actions,

    // 高级操作
    openFile,
    restoreFromSlug,
    closeTabWithConfirm,
    saveCurrentTab,
    saveAllTabs,
    resetState,

    // 查询方法
    getActiveTab,
    hasUnsavedChanges,
    getUnsavedTabs,
  };
}
