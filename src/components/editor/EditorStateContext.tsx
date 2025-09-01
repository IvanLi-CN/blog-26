"use client";

/**
 * 编辑器状态管理 Context
 *
 * 集中管理标签页、文件树、URL状态的统一状态管理器
 */

import { useRouter, useSearchParams } from "next/navigation";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useReducer } from "react";
import type { ContentSource } from "./PostEditorWrapper";
import {
  type ArticleIdentifier,
  createTabId,
  generateUrlParams,
  parseTabId,
  parseUrlParams,
} from "./types/editorTypes";

// 编辑器模式类型
export type EditorMode = "wysiwyg" | "source" | "preview";

// 标签页接口 - 使用二元ID架构
export interface EditorTab {
  id: string; // 格式：'source:path'，如 'local:blog/hello-world.md'
  identifier: ArticleIdentifier; // 二元标识符
  title: string;
  content: string;
  isDirty: boolean;
  mode: EditorMode;
  contentSource: ContentSource; // 保持兼容性，逐步迁移
}

// 编辑器状态接口
export interface EditorState {
  // 标签页状态
  tabs: EditorTab[];
  activeTabId: string | null;

  // 文件树状态
  expandedFolders: Set<string>;
  selectedPath: string | null;

  // URL状态
  currentSlug: string | null;

  // UI状态
  isLoading: boolean;
  scrollTarget: string | null;
}

// 状态操作类型
export type EditorAction =
  | { type: "SET_ACTIVE_TAB"; payload: { tabId: string } }
  | { type: "ADD_TAB"; payload: { tab: EditorTab } }
  | { type: "REMOVE_TAB"; payload: { tabId: string } }
  | { type: "UPDATE_TAB_CONTENT"; payload: { tabId: string; content: string } }
  | { type: "UPDATE_TAB_MODE"; payload: { tabId: string; mode: EditorMode } }
  | { type: "SET_TAB_DIRTY"; payload: { tabId: string; isDirty: boolean } }
  | { type: "UPDATE_URL_SLUG"; payload: { slug: string | null } }
  | { type: "EXPAND_FOLDER_PATH"; payload: { filePath: string } }
  | { type: "TOGGLE_FOLDER"; payload: { folderName: string } }
  | { type: "SET_SELECTED_PATH"; payload: { path: string | null } }
  | { type: "SET_SCROLL_TARGET"; payload: { target: string | null } }
  | { type: "SET_LOADING"; payload: { isLoading: boolean } }
  | { type: "SYNC_FROM_URL"; payload: { slug: string | null } };

// 初始状态
const initialState: EditorState = {
  tabs: [],
  activeTabId: null,
  expandedFolders: new Set(),
  selectedPath: null,
  currentSlug: null,
  isLoading: false,
  scrollTarget: null,
};

// 状态 Reducer
function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_ACTIVE_TAB": {
      const { tabId } = action.payload;
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return state;

      return {
        ...state,
        activeTabId: tabId,
        selectedPath: tab.contentSource.filePath,
        scrollTarget: tab.contentSource.filePath,
      };
    }

    case "ADD_TAB": {
      const { tab } = action.payload;
      const existingTab = state.tabs.find((t) => t.id === tab.id);
      if (existingTab) {
        return {
          ...state,
          activeTabId: tab.id,
          selectedPath: tab.contentSource.filePath,
        };
      }

      return {
        ...state,
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
        selectedPath: tab.contentSource.filePath,
        scrollTarget: tab.contentSource.filePath,
      };
    }

    case "REMOVE_TAB": {
      const { tabId } = action.payload;
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      const newActiveTabId =
        state.activeTabId === tabId
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].id
            : null
          : state.activeTabId;

      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveTabId,
        selectedPath: newActiveTabId
          ? newTabs.find((t) => t.id === newActiveTabId)?.contentSource.filePath || null
          : null,
      };
    }

    case "UPDATE_TAB_CONTENT": {
      const { tabId, content } = action.payload;
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, content, isDirty: true } : tab
        ),
      };
    }

    case "UPDATE_TAB_MODE": {
      const { tabId, mode } = action.payload;
      return {
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, mode } : tab)),
      };
    }

    case "SET_TAB_DIRTY": {
      const { tabId, isDirty } = action.payload;
      return {
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, isDirty } : tab)),
      };
    }

    case "UPDATE_URL_SLUG": {
      return {
        ...state,
        currentSlug: action.payload.slug,
      };
    }

    case "EXPAND_FOLDER_PATH": {
      const { filePath } = action.payload;
      const pathSegments = filePath.replace(/^\//, "").split("/").filter(Boolean);
      const newExpanded = new Set(state.expandedFolders);

      // 递归展开所有父级目录
      for (let i = 0; i < pathSegments.length - 1; i++) {
        const folderPath = pathSegments.slice(0, i + 1).join("/");
        newExpanded.add(folderPath);
        newExpanded.add(`webdav-${folderPath}`);
        newExpanded.add(`local-${folderPath}`);
      }

      return {
        ...state,
        expandedFolders: newExpanded,
      };
    }

    case "TOGGLE_FOLDER": {
      const { folderName } = action.payload;
      const newExpanded = new Set(state.expandedFolders);
      if (newExpanded.has(folderName)) {
        newExpanded.delete(folderName);
      } else {
        newExpanded.add(folderName);
      }

      return {
        ...state,
        expandedFolders: newExpanded,
      };
    }

    case "SET_SELECTED_PATH": {
      return {
        ...state,
        selectedPath: action.payload.path,
      };
    }

    case "SET_SCROLL_TARGET": {
      return {
        ...state,
        scrollTarget: action.payload.target,
      };
    }

    case "SET_LOADING": {
      return {
        ...state,
        isLoading: action.payload.isLoading,
      };
    }

    case "SYNC_FROM_URL": {
      return {
        ...state,
        currentSlug: action.payload.slug,
      };
    }

    default:
      return state;
  }
}

// Context 接口
interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  // 便捷方法
  setActiveTab: (tabId: string) => void;
  addTab: (tab: EditorTab) => void;
  removeTab: (tabId: string) => void;
  updateTabContent: (tabId: string, content: string) => void;
  updateTabMode: (tabId: string, mode: EditorMode) => void;
  setTabDirty: (tabId: string, isDirty: boolean) => void;
  expandFolderPath: (filePath: string) => void;
  toggleFolder: (folderName: string) => void;
  setSelectedPath: (path: string | null) => void;
  setScrollTarget: (target: string | null) => void;
}

// 创建 Context
const EditorStateContext = createContext<EditorContextValue | null>(null);

// Context Provider 组件
export function EditorStateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 便捷方法
  const setActiveTab = useCallback((tabId: string) => {
    dispatch({ type: "SET_ACTIVE_TAB", payload: { tabId } });
  }, []);

  const addTab = useCallback((tab: EditorTab) => {
    dispatch({ type: "ADD_TAB", payload: { tab } });
  }, []);

  const removeTab = useCallback((tabId: string) => {
    dispatch({ type: "REMOVE_TAB", payload: { tabId } });
  }, []);

  const updateTabContent = useCallback((tabId: string, content: string) => {
    dispatch({ type: "UPDATE_TAB_CONTENT", payload: { tabId, content } });
  }, []);

  const updateTabMode = useCallback((tabId: string, mode: EditorMode) => {
    dispatch({ type: "UPDATE_TAB_MODE", payload: { tabId, mode } });
  }, []);

  const setTabDirty = useCallback((tabId: string, isDirty: boolean) => {
    dispatch({ type: "SET_TAB_DIRTY", payload: { tabId, isDirty } });
  }, []);

  const expandFolderPath = useCallback((filePath: string) => {
    dispatch({ type: "EXPAND_FOLDER_PATH", payload: { filePath } });
  }, []);

  const toggleFolder = useCallback((folderName: string) => {
    dispatch({ type: "TOGGLE_FOLDER", payload: { folderName } });
  }, []);

  const setSelectedPath = useCallback((path: string | null) => {
    dispatch({ type: "SET_SELECTED_PATH", payload: { path } });
  }, []);

  const setScrollTarget = useCallback((target: string | null) => {
    dispatch({ type: "SET_SCROLL_TARGET", payload: { target } });
  }, []);

  const contextValue: EditorContextValue = {
    state,
    dispatch,
    setActiveTab,
    addTab,
    removeTab,
    updateTabContent,
    updateTabMode,
    setTabDirty,
    expandFolderPath,
    toggleFolder,
    setSelectedPath,
    setScrollTarget,
  };

  return <EditorStateContext.Provider value={contextValue}>{children}</EditorStateContext.Provider>;
}

// Hook 用于使用 Context
export function useEditorState() {
  const context = useContext(EditorStateContext);
  if (!context) {
    throw new Error("useEditorState must be used within EditorStateProvider");
  }
  return context;
}
