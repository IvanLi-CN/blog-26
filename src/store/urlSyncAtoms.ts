/**
 * URL 同步状态管理 - 使用 Jotai
 *
 * 这个文件负责处理编辑器状态与 URL 的双向同步
 */

import { atom } from "jotai";
import { activeContentIdentifierAtom, activeTabIdAtom, setActiveTabIdAtom } from "./editorAtoms";

// URL 参数生成函数
export const generateUrlParams = (source: string, path: string): string => {
  const params = new URLSearchParams();
  params.set("source", source);
  params.set("path", encodeURIComponent(path));
  return params.toString();
};

// URL 参数解析函数
export const parseUrlParams = (searchParams: URLSearchParams) => {
  const source = searchParams.get("source");
  const path = searchParams.get("path");

  if (!source || !path) return null;

  return {
    source: source as "local" | "webdav" | "database",
    path: decodeURIComponent(path),
  };
};

// 从内容标识符生成二元ID
export const generateBinaryId = (source: string, path: string): string => {
  return `${source}:${path}`;
};

// URL 更新原子（只写）
export const updateUrlAtom = atom(null, (get, set, router: any) => {
  const activeContentIdentifier = get(activeContentIdentifierAtom);

  if (!activeContentIdentifier) {
    console.log("[URLSync] 没有活动内容标识符，跳过URL更新");
    return;
  }

  const urlParams = generateUrlParams(activeContentIdentifier.source, activeContentIdentifier.path);

  const newUrl = `${window.location.pathname}?${urlParams}`;
  console.log(`[URLSync] 更新URL: ${newUrl}`);

  // 使用 router.replace 避免添加历史记录
  router.replace(newUrl, { scroll: false });
});

// URL 同步初始化原子（只写）
export const initializeFromUrlAtom = atom(
  null,
  (get, set, searchParams: URLSearchParams, availableTabs: any[]) => {
    const urlData = parseUrlParams(searchParams);

    if (!urlData) {
      console.log("[URLSync] URL中没有有效的编辑器参数");
      return;
    }

    const binaryId = generateBinaryId(urlData.source, urlData.path);
    console.log(`[URLSync] 从URL初始化编辑器状态: ${binaryId}`);

    // 检查是否有对应的标签页
    const existingTab = availableTabs.find((tab) => tab.id === binaryId);
    if (existingTab) {
      console.log(`[URLSync] 找到现有标签页，设置为活动: ${binaryId}`);
      set(setActiveTabIdAtom, binaryId);
    } else {
      console.log(`[URLSync] 未找到对应标签页，需要创建: ${binaryId}`);
      // 这里可以触发文件加载逻辑
    }
  }
);

// 防抖延迟常量
export const URL_UPDATE_DELAY = 300; // 300ms 防抖

// URL 更新防抖原子
let urlUpdateTimeout: NodeJS.Timeout | null = null;

export const debouncedUpdateUrlAtom = atom(null, (get, set, router: any) => {
  // 清除之前的定时器
  if (urlUpdateTimeout) {
    clearTimeout(urlUpdateTimeout);
  }

  // 设置新的防抖定时器
  urlUpdateTimeout = setTimeout(() => {
    set(updateUrlAtom, router);
  }, URL_UPDATE_DELAY);
});
