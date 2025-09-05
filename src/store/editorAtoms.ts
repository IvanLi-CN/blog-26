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

// 从标签页ID中提取路径部分
const extractPathFromTabId = (tabId: string): string => {
  return tabId.split(":").slice(1).join(":");
};

// 添加标签页
export const addTabAtom = atom(null, (get, set, tab: EditorTab) => {
  console.log(`[EditorAtoms] 添加标签页: ${tab.id}`);
  const tabs = get(tabsAtom);

  // 1. 检查是否已存在相同ID的标签页
  const existingTabById = tabs.find((t) => t.id === tab.id);
  if (existingTabById) {
    console.log(`[EditorAtoms] 标签页已存在(ID匹配)，设置为活动: ${tab.id}`);
    set(activeTabIdAtom, tab.id);
    return;
  }

  // 2. 检查是否已存在相同路径的标签页（防止重命名时的重复）
  const tabPath = extractPathFromTabId(tab.id);
  const duplicateTabs = tabs.filter((t) => {
    const existingPath = extractPathFromTabId(t.id);
    return tabPath === existingPath;
  });

  if (duplicateTabs.length > 0) {
    console.log(`[EditorAtoms] 发现重复路径的标签页，进行清理: ${tabPath}`);
    console.log(
      `[EditorAtoms] 重复的标签页:`,
      duplicateTabs.map((t) => t.id)
    );

    // 删除重复的标签页，保留最新的
    const cleanedTabs = tabs.filter((t) => {
      const existingPath = extractPathFromTabId(t.id);
      return existingPath !== tabPath;
    });

    console.log(`[EditorAtoms] 清理后保留新标签页: ${tab.id}`);
    set(tabsAtom, [...cleanedTabs, tab]);
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

// 重命名状态标记，防止URL同步时重复创建标签页
export const isRenamingAtom = atom<boolean>(false);

// 重命名文件后更新相关标签页
export const updateTabsAfterRenameAtom = atom(
  null,
  (
    get,
    set,
    source: string,
    oldPath: string,
    newName: string,
    onContentSourceChange?: (contentSource: any) => void
  ) => {
    // 设置重命名状态标记，防止URL同步干扰
    set(isRenamingAtom, true);

    const tabs = get(tabsAtom);
    const activeTabId = get(activeTabIdAtom);

    // 构建新路径
    const pathParts = oldPath.split("/");
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join("/");

    // 标签页ID是二元格式：source:path
    const oldTabId = `${source}:${oldPath}`;
    const newTabId = `${source}:${newPath}`;

    console.log(`[EditorAtoms] 重命名后更新标签页: ${oldTabId} -> ${newTabId}`);

    // 查找需要更新的标签页
    const tabToUpdate = tabs.find((tab) => tab.id === oldTabId);

    if (tabToUpdate) {
      // 生成新的标题（基于新的文件名）
      const newTitle = newName.replace(/\.md$/, "");
      console.log(
        `[EditorAtoms] 找到需要更新的标签页，更新标题: "${tabToUpdate.title}" -> "${newTitle}"`
      );

      // 批量更新所有相关状态，确保原子性
      const newTabs = tabs.map((tab) =>
        tab.id === oldTabId
          ? {
              ...tab,
              id: newTabId,
              title: newTitle, // 更新标题为新的文件名
              identifier: {
                ...tab.identifier,
                path: newPath,
              },
              contentSource: tab.contentSource
                ? {
                    ...tab.contentSource,
                    filePath: newPath,
                  }
                : undefined,
            }
          : tab
      );

      // 原子性更新：先更新标签页列表，再更新活动状态
      set(tabsAtom, newTabs);

      // 如果更新的是活动标签页，也要更新活动标签页ID和相关状态
      if (activeTabId === oldTabId) {
        set(activeTabIdAtom, newTabId);
        set(selectedFilePathAtom, newPath);
        set(scrollTargetAtom, newPath);
        console.log(`[EditorAtoms] 更新活动标签页状态: ${oldTabId} -> ${newTabId}`);
      }

      // 强制更新浏览器URL到新的文件路径，避免URL同步逻辑创建重复标签页
      const newContentId = `${source}:${newPath}`;
      console.log(`[EditorAtoms] 强制更新浏览器URL: ${newContentId}`);

      // 使用 window.history.replaceState 直接更新URL，不触发页面刷新
      const newUrl = `/admin/posts/editor?source=${encodeURIComponent(source)}&path=${encodeURIComponent(encodeURIComponent(newPath))}`;
      window.history.replaceState(null, "", newUrl);
      console.log(`[EditorAtoms] URL已更新: ${newUrl}`);

      console.log(
        `[EditorAtoms] 标签页更新完成: ${oldTabId} -> ${newTabId}, 标题更新: "${tabToUpdate.title}" -> "${newTitle}"`
      );

      // 如果提供了回调函数，通知父组件更新 selectedContentSource
      if (onContentSourceChange) {
        const newContentSource = {
          source: source as "local" | "webdav" | "database",
          filePath: newPath,
          id: newTabId,
        };
        console.log(`[EditorAtoms] 通知父组件更新 selectedContentSource:`, newContentSource);
        onContentSourceChange(newContentSource);
      }

      // 延迟清除重命名状态标记，确保URL同步逻辑有足够时间稳定
      setTimeout(() => {
        set(isRenamingAtom, false);
        console.log(`[EditorAtoms] 重命名操作完成，延迟清除状态标记`);
      }, 500); // 500ms 延迟，确保URL同步逻辑完全稳定
    } else {
      console.log(`[EditorAtoms] 未找到需要更新的标签页: ${oldTabId}`);
      console.log(
        `[EditorAtoms] 当前所有标签页ID:`,
        tabs.map((tab) => `${tab.id} (${tab.title})`)
      );
      // 未找到标签页时也要延迟清除状态标记
      setTimeout(() => {
        set(isRenamingAtom, false);
        console.log(`[EditorAtoms] 未找到标签页，延迟清除重命名状态标记`);
      }, 500);
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
