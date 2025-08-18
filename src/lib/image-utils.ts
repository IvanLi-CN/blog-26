import { generateOptimizedImageUrl, resolveRelativePath } from "@/components/common/markdown/utils";

/**
 * 从上下文路径中提取文章目录
 * @param contextPath 上下文路径（如 /posts/react-hooks-deep-dive 或 /memos/20250801-xxx）
 * @returns 文章目录（如 '' 对于posts，'memos/' 对于memos）
 *
 * @example
 * extractArticleDir('/posts/react-hooks-deep-dive') // returns '' (posts图片在根assets目录)
 * extractArticleDir('/memos/20250801-xxx') // returns 'memos/' (memos图片在memos目录下)
 * extractArticleDir('') // returns ''
 */
export function extractArticleDir(contextPath: string): string {
  if (!contextPath) return "";

  // 移除开头的斜杠并分割路径
  const cleanPath = contextPath.startsWith("/") ? contextPath.substring(1) : contextPath;
  const parts = cleanPath.split("/").filter((part) => part);

  if (parts.length === 0) return "";

  const firstPart = parts[0];

  // 对于 posts，图片通常在根目录的 assets/ 下
  if (firstPart === "posts") {
    return "";
  }

  // 对于 memos，图片在 memos/ 目录下
  if (firstPart === "memos") {
    return "memos/";
  }

  // 其他情况，返回第一级目录
  return `${firstPart}/`;
}

/**
 * 统一的图片路径处理函数
 * 正确处理各种图片路径格式，包括相对路径、绝对路径、外部URL等
 *
 * @param imagePath 原始图片路径
 * @param contextPath 上下文路径，用于解析相对路径（可选）
 * @returns 处理后的图片URL，如果输入无效则返回null
 *
 * @example
 * // 相对路径解析
 * resolveImagePath('./assets/image.jpg', '/posts/my-post')
 * // returns '/api/files/webdav/posts/assets/image.jpg'
 *
 * // 上级目录路径解析
 * resolveImagePath('../shared/image.jpg', '/posts/category/my-post')
 * // returns '/api/files/webdav/posts/shared/image.jpg'
 *
 * // 外部URL直接返回
 * resolveImagePath('https://example.com/image.jpg')
 * // returns 'https://example.com/image.jpg'
 *
 * // 已处理的API端点直接返回
 * resolveImagePath('/api/files/webdav/assets/image.jpg')
 * // returns '/api/files/webdav/assets/image.jpg'
 */
export function resolveImagePath(
  imagePath: string | undefined,
  contextPath?: string
): string | null {
  // 处理空值或undefined
  if (!imagePath || typeof imagePath !== "string") {
    return null;
  }

  // 去除首尾空白字符
  const cleanImagePath = imagePath.trim();
  if (!cleanImagePath) {
    return null;
  }

  // 如果已经是完整的外部URL，直接返回
  if (cleanImagePath.startsWith("http://") || cleanImagePath.startsWith("https://")) {
    return cleanImagePath;
  }

  // 如果已经是API文件端点，直接返回
  if (cleanImagePath.startsWith("/api/files/")) {
    return cleanImagePath;
  }

  // 如果是data URL（base64图片），直接返回
  if (cleanImagePath.startsWith("data:")) {
    return cleanImagePath;
  }

  // 处理相对路径和绝对路径
  let resolvedPath: string;

  if (cleanImagePath.startsWith("./") || cleanImagePath.startsWith("../")) {
    // 相对路径：需要上下文路径来解析
    const articleDir = extractArticleDir(contextPath || "");
    resolvedPath = resolveRelativePath(cleanImagePath, articleDir);
  } else if (cleanImagePath.startsWith("/")) {
    // 绝对路径：移除开头的斜杠
    resolvedPath = cleanImagePath.substring(1);
  } else {
    // 其他情况：当作相对于当前目录的路径
    const articleDir = extractArticleDir(contextPath || "");
    resolvedPath = articleDir + cleanImagePath;
  }

  // 使用现有的工具函数生成优化的图片URL
  return generateOptimizedImageUrl(resolvedPath);
}

/**
 * 批量处理图片路径
 * @param imagePaths 图片路径数组
 * @param contextPath 上下文路径
 * @returns 处理后的图片URL数组，过滤掉无效的路径
 */
export function resolveImagePaths(
  imagePaths: (string | undefined)[],
  contextPath?: string
): string[] {
  return imagePaths
    .map((path) => resolveImagePath(path, contextPath))
    .filter((path): path is string => path !== null);
}

/**
 * 检查路径是否为图片文件
 * @param path 文件路径
 * @returns 是否为图片文件
 */
export function isImagePath(path: string): boolean {
  if (!path || typeof path !== "string") return false;

  const cleanPath = path.toLowerCase().trim();
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico"];

  return imageExtensions.some((ext) => cleanPath.endsWith(ext));
}
