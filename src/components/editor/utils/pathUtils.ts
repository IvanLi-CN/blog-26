/**
 * 路径解析和处理工具
 *
 * 提供文件路径解析、目录展开等功能
 */

import type { ContentSource } from "../PostEditorWrapper";

/**
 * 解析文件路径为路径段数组
 * @param filePath 文件路径
 * @returns 路径段数组
 */
export function parseFilePath(filePath: string): string[] {
  if (!filePath) return [];

  // 移除开头的斜杠并分割路径
  return filePath.replace(/^\//, "").split("/").filter(Boolean);
}

/**
 * 获取文件的父级目录路径
 * @param filePath 文件路径
 * @returns 父级目录路径数组
 */
export function getParentDirectories(filePath: string): string[] {
  const pathSegments = parseFilePath(filePath);
  const directories: string[] = [];

  // 生成所有父级目录路径
  for (let i = 0; i < pathSegments.length - 1; i++) {
    const dirPath = pathSegments.slice(0, i + 1).join("/");
    directories.push(dirPath);
  }

  return directories;
}

/**
 * 生成需要展开的文件夹标识符
 * @param filePath 文件路径
 * @param source 内容源类型
 * @returns 文件夹标识符数组
 */
export function generateFolderIdentifiers(
  filePath: string,
  source: ContentSource["source"]
): string[] {
  const parentDirs = getParentDirectories(filePath);
  const identifiers: string[] = [];

  parentDirs.forEach((dir) => {
    // 添加基础路径
    identifiers.push(dir);

    // 添加带源前缀的路径
    if (source === "webdav") {
      identifiers.push(`webdav-${dir}`);
    } else if (source === "local") {
      identifiers.push(`local-${dir}`);
    }
  });

  return identifiers;
}

/**
 * 检查路径是否为 WebDAV 路径
 * @param path 路径字符串
 * @returns 是否为 WebDAV 路径
 */
export function isWebDAVPath(path: string): boolean {
  return path.startsWith("/");
}

/**
 * 检查路径是否为本地文件路径
 * @param path 路径字符串
 * @returns 是否为本地文件路径
 */
export function isLocalPath(path: string): boolean {
  return !path.startsWith("/") && (path.includes("/") || path.endsWith(".md"));
}

/**
 * 检查路径是否为数据库文章ID
 * @param path 路径字符串
 * @returns 是否为数据库文章ID
 */
export function isDatabaseId(path: string): boolean {
  return !isWebDAVPath(path) && !isLocalPath(path);
}

/**
 * 规范化文件路径
 * @param path 原始路径
 * @returns 规范化后的路径
 */
export function normalizePath(path: string): string {
  if (!path) return "";

  // 移除多余的斜杠
  return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

/**
 * 从文件路径提取文件名
 * @param filePath 文件路径
 * @returns 文件名
 */
export function extractFileName(filePath: string): string {
  const pathSegments = parseFilePath(filePath);
  return pathSegments[pathSegments.length - 1] || "";
}

/**
 * 从文件路径提取不带扩展名的文件名
 * @param filePath 文件路径
 * @returns 不带扩展名的文件名
 */
export function extractFileNameWithoutExtension(filePath: string): string {
  const fileName = extractFileName(filePath);
  return fileName.replace(/\.[^/.]+$/, "");
}

/**
 * 检查两个路径是否相等（忽略开头斜杠差异）
 * @param path1 路径1
 * @param path2 路径2
 * @returns 是否相等
 */
export function pathsEqual(path1: string, path2: string): boolean {
  const normalized1 = normalizePath(path1);
  const normalized2 = normalizePath(path2);
  return normalized1 === normalized2;
}

/**
 * 根据文件路径推断内容源类型
 * @param filePath 文件路径
 * @returns 内容源类型
 */
export function inferContentSource(filePath: string): ContentSource["source"] {
  if (isWebDAVPath(filePath)) {
    return "webdav";
  } else if (isLocalPath(filePath)) {
    return "local";
  } else {
    return "database";
  }
}

/**
 * 创建 ContentSource 对象
 * @param filePath 文件路径
 * @param id 可选的ID
 * @returns ContentSource 对象
 */
export function createContentSource(filePath: string, id?: string): ContentSource {
  return {
    source: inferContentSource(filePath),
    filePath,
    id: id || filePath,
  };
}

/**
 * 生成用于滚动定位的数据属性值
 * @param filePath 文件路径
 * @returns 数据属性值
 */
export function generateScrollDataAttribute(filePath: string): string {
  return `file-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

/**
 * 检查路径是否为新文件路径（包含 __NEW__ 前缀）
 * @param path 路径字符串
 * @returns 是否为新文件路径
 */
export function isNewFilePath(path: string): boolean {
  return path.startsWith("__NEW__");
}

/**
 * 移除新文件路径前缀
 * @param path 路径字符串
 * @returns 移除前缀后的路径
 */
export function removeNewFilePrefix(path: string): string {
  return path.replace(/^__NEW__/, "");
}

/**
 * 添加新文件路径前缀
 * @param path 路径字符串
 * @returns 添加前缀后的路径
 */
export function addNewFilePrefix(path: string): string {
  return `__NEW__${path}`;
}

/**
 * 从标签页ID转换为 slug（用于URL参数）
 * @param tabId 标签页ID
 * @returns slug 字符串
 */
export function tabIdToSlug(tabId: string): string | null {
  // 移除新文件前缀
  const cleanPath = removeNewFilePrefix(tabId);

  // 如果是数据库ID，直接返回
  if (isDatabaseId(cleanPath)) {
    return cleanPath;
  }

  // 如果是文件路径，提取文件名作为slug
  const fileName = extractFileNameWithoutExtension(cleanPath);
  return fileName || null;
}

/**
 * 从 slug 推断可能的文件路径
 * @param slug slug 字符串
 * @returns 可能的文件路径数组
 */
export function slugToFilePaths(slug: string): string[] {
  const paths: string[] = [];

  // 直接作为数据库ID
  paths.push(slug);

  // 作为文件名（WebDAV）
  paths.push(`/${slug}.md`);
  paths.push(`/posts/${slug}.md`);
  paths.push(`/articles/${slug}.md`);

  // 作为文件名（本地）
  paths.push(`${slug}.md`);
  paths.push(`posts/${slug}.md`);
  paths.push(`articles/${slug}.md`);

  return paths;
}
