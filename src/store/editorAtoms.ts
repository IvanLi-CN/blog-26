/**
 * 编辑器全局状态管理 - 使用 Jotai
 *
 * 这个文件定义了编辑器的所有全局状态原子，包括：
 * - 活动标签页状态
 * - 文件树展开状态
 * - 滚动目标状态
 * - URL同步状态
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// 类型定义
export interface ContentIdentifier {
  source: "local" | "webdav" | "database";
  path: string;
}

export interface EditorTab {
  id: string; // 二元ID格式：source:path
  title: string;
  content: string;
  isDirty: boolean;
  mode: "wysiwyg" | "markdown" | "source" | "preview"; // 兼容更多模式
  identifier: ContentIdentifier;
  contentSource?: any; // 兼容旧的 contentSource 字段
}

// ===== 核心状态原子 =====

// 活动标签页ID
export const activeTabIdAtom = atom<string | null>(null);

// 所有标签页列表
export const tabsAtom = atom<EditorTab[]>([]);

// 文件树展开状态 (持久化到 localStorage)
export const expandedFoldersAtom = atomWithStorage<Set<string>>(
  "editor-expanded-folders",
  new Set<string>(),
  {
    getItem: (key: string): Set<string> => {
      const item = localStorage.getItem(key);
      if (!item) return new Set<string>();
      try {
        const array = JSON.parse(item);
        return new Set(array);
      } catch {
        return new Set<string>();
      }
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(Array.from(value)));
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    },
  }
);

// 滚动目标文件路径
export const scrollTargetAtom = atom<string | null>(null);

// 选中的文件路径（用于高亮）
export const selectedFilePathAtom = atom<string | null>(null);

// ===== 派生状态原子 =====

// 当前活动标签页
export const activeTabAtom = atom<EditorTab | null>((get) => {
  const activeTabId = get(activeTabIdAtom);
  const tabs = get(tabsAtom);
  return tabs.find((tab) => tab.id === activeTabId) || null;
});

// 当前活动标签页的内容标识符
export const activeContentIdentifierAtom = atom<ContentIdentifier | null>((get) => {
  const activeTab = get(activeTabAtom);
  return activeTab?.identifier || null;
});

// ===== 动作原子 =====

// 设置活动标签页
export const setActiveTabIdAtom = atom(null, (get, set, tabId: string) => {
  console.log(`[EditorAtoms] 设置活动标签页: ${tabId}`);
  set(activeTabIdAtom, tabId);

  // 同时更新选中的文件路径和滚动目标
  const tabs = get(tabsAtom);
  const tab = tabs.find((t) => t.id === tabId);
  if (tab) {
    set(selectedFilePathAtom, tab.identifier.path);
    set(scrollTargetAtom, tab.identifier.path);

    // 自动展开文件路径
    const pathParts = tab.identifier.path.split("/");
    const expandedFolders = get(expandedFoldersAtom);
    const newExpandedFolders = new Set(expandedFolders);

    // 展开所有父级文件夹
    for (let i = 0; i < pathParts.length - 1; i++) {
      const folderPath = pathParts.slice(0, i + 1).join("/");
      newExpandedFolders.add(folderPath);
    }

    set(expandedFoldersAtom, newExpandedFolders);
  }
});

// 添加标签页
export const addTabAtom = atom(null, (get, set, tab: EditorTab) => {
  console.log(`[EditorAtoms] 添加标签页: ${tab.id}`);
  const tabs = get(tabsAtom);

  // 检查是否已存在
  const existingTab = tabs.find((t) => t.id === tab.id);
  if (existingTab) {
    // 如果已存在，只设置为活动标签页
    set(activeTabIdAtom, tab.id);
    return;
  }

  // 添加新标签页
  set(tabsAtom, [...tabs, tab]);
  set(activeTabIdAtom, tab.id);

  // 更新选中状态和滚动目标
  set(selectedFilePathAtom, tab.identifier.path);
  set(scrollTargetAtom, tab.identifier.path);

  // 自动展开文件路径
  const pathParts = tab.identifier.path.split("/");
  const expandedFolders = get(expandedFoldersAtom);
  const newExpandedFolders = new Set(expandedFolders);

  for (let i = 0; i < pathParts.length - 1; i++) {
    const folderPath = pathParts.slice(0, i + 1).join("/");
    newExpandedFolders.add(folderPath);
  }

  set(expandedFoldersAtom, newExpandedFolders);
});

// 移除标签页
export const removeTabAtom = atom(null, (get, set, tabId: string) => {
  console.log(`[EditorAtoms] 移除标签页: ${tabId}`);
  const tabs = get(tabsAtom);
  const newTabs = tabs.filter((tab) => tab.id !== tabId);
  set(tabsAtom, newTabs);

  // 如果移除的是活动标签页，切换到其他标签页
  const activeTabId = get(activeTabIdAtom);
  if (activeTabId === tabId) {
    const newActiveTab = newTabs[newTabs.length - 1];
    if (newActiveTab) {
      set(activeTabIdAtom, newActiveTab.id);
      set(selectedFilePathAtom, newActiveTab.identifier.path);
      set(scrollTargetAtom, newActiveTab.identifier.path);
    } else {
      set(activeTabIdAtom, null);
      set(selectedFilePathAtom, null);
      set(scrollTargetAtom, null);
    }
  }
});

// 更新标签页内容
export const updateTabContentAtom = atom(null, (get, set, tabId: string, content: string) => {
  const tabs = get(tabsAtom);
  const newTabs = tabs.map((tab) => (tab.id === tabId ? { ...tab, content, isDirty: true } : tab));
  set(tabsAtom, newTabs);
});

// 更新标签页模式
export const updateTabModeAtom = atom(null, (get, set, tabId: string, mode: string) => {
  const tabs = get(tabsAtom);
  const newTabs = tabs.map((tab) => (tab.id === tabId ? { ...tab, mode: mode as any } : tab));
  set(tabsAtom, newTabs);
});

// 标记标签页为已保存状态
export const markTabSavedAtom = atom(null, (get, set, tabId: string, content?: string) => {
  const tabs = get(tabsAtom);
  const newTabs = tabs.map((tab) =>
    tab.id === tabId ? { ...tab, isDirty: false, ...(content && { content }) } : tab
  );
  set(tabsAtom, newTabs);
});

// 更新标签页ID（用于新文件保存后）
export const updateTabIdAtom = atom(
  null,
  (get, set, oldTabId: string, newTabId: string, content?: string) => {
    const tabs = get(tabsAtom);
    const activeTabId = get(activeTabIdAtom);

    const newTabs = tabs.map((tab) =>
      tab.id === oldTabId
        ? { ...tab, id: newTabId, isDirty: false, ...(content && { content }) }
        : tab
    );
    set(tabsAtom, newTabs);

    // 如果更新的是活动标签页，也要更新活动标签页ID
    if (activeTabId === oldTabId) {
      set(activeTabIdAtom, newTabId);
    }
  }
);

// 智能展开文件夹（根据文件路径自动展开相关文件夹）
export const autoExpandFoldersAtom = atom(null, (get, set, filePath: string) => {
  const expandedFolders = get(expandedFoldersAtom);
  const newExpandedFolders = new Set(expandedFolders);

  // 解析文件路径，确定需要展开的文件夹
  const foldersToExpand: string[] = [];

  if (filePath.includes(":") && filePath.startsWith("webdav:")) {
    // WebDAV 文件路径（二元ID格式：webdav:/blog/hello.md）
    const actualPath = filePath.replace("webdav:", "");
    const pathParts = actualPath.split("/").filter((part) => part);
    let currentPath = "";

    // 添加 webdav 根文件夹
    foldersToExpand.push("webdav");

    // 逐级添加子文件夹
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentPath += (currentPath ? "/" : "") + pathParts[i];
      foldersToExpand.push(`webdav-${currentPath}`);
    }
  } else if (filePath.startsWith("/")) {
    // 普通 WebDAV 文件路径
    const pathParts = filePath.split("/").filter((part) => part);
    let currentPath = "";

    // 添加 webdav 根文件夹
    foldersToExpand.push("webdav");

    // 逐级添加子文件夹
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentPath += (currentPath ? "/" : "") + pathParts[i];
      foldersToExpand.push(`webdav-${currentPath}`);
    }
  } else if (filePath.includes(":") && filePath.startsWith("local:")) {
    // 本地文件路径（二元ID格式：local:blog/hello-world.md）
    const actualPath = filePath.replace("local:", "");
    const pathParts = actualPath.split("/").filter((part) => part);
    let currentPath = "";

    // 添加 local 根文件夹
    foldersToExpand.push("local");

    // 逐级添加子文件夹
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentPath += (currentPath ? "/" : "") + pathParts[i];
      foldersToExpand.push(`local-${currentPath}`);
    }
  } else if (filePath.includes("/")) {
    // 普通本地文件路径
    const pathParts = filePath.split("/").filter((part) => part);
    let currentPath = "";

    // 添加 local 根文件夹
    foldersToExpand.push("local");

    // 逐级添加子文件夹
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentPath += (currentPath ? "/" : "") + pathParts[i];
      foldersToExpand.push(`local-${currentPath}`);
    }
  } else {
    // 数据库文章，展开对应的分类文件夹
    foldersToExpand.push("database");
  }

  // 将需要展开的文件夹添加到集合中
  foldersToExpand.forEach((folder) => {
    newExpandedFolders.add(folder);
  });

  // 更新展开状态
  set(expandedFoldersAtom, newExpandedFolders);

  console.log(`[EditorAtoms] 自动展开文件夹: ${foldersToExpand.join(", ")} for file: ${filePath}`);
});

// 切换文件夹展开状态
export const toggleFolderAtom = atom(null, (get, set, folderPath: string) => {
  const expandedFolders = get(expandedFoldersAtom);
  const newExpandedFolders = new Set(expandedFolders);

  if (newExpandedFolders.has(folderPath)) {
    newExpandedFolders.delete(folderPath);
  } else {
    newExpandedFolders.add(folderPath);
  }

  set(expandedFoldersAtom, newExpandedFolders);
});

// 设置滚动目标
export const setScrollTargetAtom = atom(null, (_get, set, filePath: string | null) => {
  // 转换二元ID格式为实际文件路径
  let actualTarget = filePath;
  if (filePath?.includes(":")) {
    if (filePath.startsWith("local:")) {
      actualTarget = filePath.replace("local:", "");
    } else if (filePath.startsWith("webdav:")) {
      actualTarget = filePath.replace("webdav:", "");
    } else if (filePath.startsWith("database:")) {
      actualTarget = filePath.replace("database:", "");
    }
  }

  console.log(`[EditorAtoms] 设置滚动目标: ${filePath} -> ${actualTarget}`);
  set(scrollTargetAtom, actualTarget);
});

// 设置选中的文件路径
export const setSelectedFilePathAtom = atom(null, (_get, set, filePath: string | null) => {
  console.log(`[EditorAtoms] 设置选中文件: ${filePath}`);
  set(selectedFilePathAtom, filePath);
});
