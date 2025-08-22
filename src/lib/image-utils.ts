/**
 * 图片路径解析工具
 *
 * 提供正确的图片路径解析功能，支持：
 * - 不同内容源（local、webdav）
 * - 基于实际文件路径的相对路径解析
 * - 外部URL和绝对路径处理
 */

/**
 * 检查路径是否为外部URL
 * @param path 路径字符串
 * @returns 是否为外部URL
 */
function isExternalUrl(path: string): boolean {
  return /^https?:\/\//.test(path);
}

/**
 * 检查路径是否为API端点
 * @param path 路径字符串
 * @returns 是否为API端点
 */
function isApiEndpoint(path: string): boolean {
  return path.startsWith("/api/files/");
}

/**
 * 检查路径是否为data URL
 * @param path 路径字符串
 * @returns 是否为data URL
 */
function isDataUrl(path: string): boolean {
  return path.startsWith("data:");
}

/**
 * 规范化路径分隔符
 * @param path 路径字符串
 * @returns 规范化后的路径
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/**
 * 基于实际文件路径解析图片相对路径
 * @param imagePath 图片路径（可能是相对路径）
 * @param markdownFilePath 实际的markdown文件路径（如 posts/01-vue3-composition-api-deep-dive.md）
 * @param contentSource 内容源类型
 * @returns 解析后的绝对路径（相对于内容源根目录）
 */
function resolveImagePathFromFile(
  imagePath: string,
  markdownFilePath: string,
  contentSource: "local" | "webdav" = "webdav"
): string {
  // 如果是绝对路径，直接使用（去掉开头的斜杠）
  if (imagePath.startsWith("/")) {
    return imagePath.substring(1);
  }

  // 获取markdown文件所在的目录
  let markdownDir = markdownFilePath.includes("/")
    ? markdownFilePath.substring(0, markdownFilePath.lastIndexOf("/"))
    : "";

  // 对于WebDAV内容源，需要进行路径映射
  if (contentSource === "webdav") {
    // posts/ 目录映射到 blog/ 目录
    if (markdownDir.startsWith("posts")) {
      markdownDir = markdownDir.replace(/^posts/, "blog");
    }
    // memos/ 目录保持不变
    // projects/ 目录映射到 projects/ 目录（如果需要的话）
  }

  // 处理相对路径
  if (imagePath.startsWith("./")) {
    // 当前目录相对路径
    const relativePath = imagePath.substring(2);
    return markdownDir ? `${markdownDir}/${relativePath}` : relativePath;
  } else if (imagePath.startsWith("../")) {
    // 上级目录相对路径
    let currentDir = markdownDir;
    let remainingPath = imagePath;

    // 处理多级上级目录
    while (remainingPath.startsWith("../")) {
      remainingPath = remainingPath.substring(3);
      if (currentDir.includes("/")) {
        currentDir = currentDir.substring(0, currentDir.lastIndexOf("/"));
      } else {
        currentDir = "";
      }
    }

    return currentDir ? `${currentDir}/${remainingPath}` : remainingPath;
  } else {
    // 没有前缀的相对路径，视为相对于当前目录
    return markdownDir ? `${markdownDir}/${imagePath}` : imagePath;
  }
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
/**
 * 新的图片路径解析函数
 * 基于实际文件路径和内容源进行正确的路径解析
 *
 * @param imagePath 原始图片路径
 * @param contentSource 内容源类型
 * @param markdownFilePath 实际的markdown文件路径
 * @returns 处理后的图片URL，如果输入无效则返回null
 *
 * @example
 * // 相对路径解析
 * resolveImagePath('./assets/image.jpg', 'webdav', 'blog/my-post.md')
 * // returns '/api/files/webdav/blog/assets/image.jpg'
 *
 * // 上级目录路径解析
 * resolveImagePath('../shared/image.jpg', 'webdav', 'blog/category/my-post.md')
 * // returns '/api/files/webdav/blog/shared/image.jpg'
 *
 * // 外部URL直接返回
 * resolveImagePath('https://example.com/image.jpg', 'webdav', 'blog/my-post.md')
 * // returns 'https://example.com/image.jpg'
 */
export function resolveImagePath(
  imagePath: string | undefined,
  contentSource: "local" | "webdav" = "webdav",
  markdownFilePath?: string
): string | null {
  // 输入验证
  if (!imagePath || typeof imagePath !== "string") {
    return null;
  }

  const cleanImagePath = imagePath.trim();
  if (!cleanImagePath) {
    return null;
  }

  // 如果已经是外部URL、data URL或API端点，直接返回
  if (isExternalUrl(cleanImagePath) || isDataUrl(cleanImagePath) || isApiEndpoint(cleanImagePath)) {
    return cleanImagePath;
  }

  // 处理相对路径和绝对路径
  let resolvedPath: string;

  if (
    markdownFilePath &&
    (cleanImagePath.startsWith("./") ||
      cleanImagePath.startsWith("../") ||
      !cleanImagePath.startsWith("/"))
  ) {
    // 基于实际文件路径解析相对路径
    resolvedPath = resolveImagePathFromFile(cleanImagePath, markdownFilePath, contentSource);
  } else if (cleanImagePath.startsWith("/")) {
    // 绝对路径：移除开头的斜杠
    resolvedPath = cleanImagePath.substring(1);
  } else if (cleanImagePath.startsWith("./")) {
    // 没有文件路径信息的相对路径：移除 "./" 前缀
    resolvedPath = cleanImagePath.substring(2);
  } else if (cleanImagePath.startsWith("../")) {
    // 没有文件路径信息的上级目录路径：移除 "../" 前缀
    resolvedPath = cleanImagePath.substring(3);
  } else {
    // 没有文件路径信息时，直接使用图片路径
    resolvedPath = cleanImagePath;
  }

  // 规范化路径
  resolvedPath = normalizePath(resolvedPath);

  // 生成API端点URL
  return `/api/files/${contentSource}/${resolvedPath}`;
}

/**
 * 批量处理图片路径
 * @param imagePaths 图片路径数组
 * @param contentSource 内容源类型
 * @param markdownFilePath 实际的markdown文件路径
 * @returns 处理后的图片URL数组，过滤掉无效的路径
 */
export function resolveImagePaths(
  imagePaths: (string | undefined)[],
  contentSource: "local" | "webdav" = "webdav",
  markdownFilePath?: string
): string[] {
  return imagePaths
    .map((path) => resolveImagePath(path, contentSource, markdownFilePath))
    .filter((path): path is string => path !== null);
}

/**
 * 向后兼容的图片路径解析函数
 * 使用旧的API签名，但内部使用新的实现
 *
 * @deprecated 请使用新的 resolveImagePath(imagePath, contentSource, markdownFilePath) 函数
 * @param imagePath 原始图片路径
 * @param contextPath 上下文路径（如 /posts/my-post）
 * @returns 处理后的图片URL，如果输入无效则返回null
 */
export function resolveImagePathLegacy(
  imagePath: string | undefined,
  contextPath?: string
): string | null {
  // 默认使用webdav内容源
  const contentSource = "webdav";

  // 尝试从contextPath推断文件路径
  let markdownFilePath: string | undefined;
  if (contextPath) {
    const cleanPath = contextPath.startsWith("/") ? contextPath.substring(1) : contextPath;
    const parts = cleanPath.split("/");

    if (parts[0] === "posts") {
      // posts类型映射到blog目录
      markdownFilePath = parts.length > 1 ? `blog/${parts[1]}.md` : undefined;
    } else if (parts[0] === "memos") {
      // memos类型映射到memos目录
      markdownFilePath = parts.length > 1 ? `memos/${parts[1]}.md` : undefined;
    }
  }

  return resolveImagePath(imagePath, contentSource, markdownFilePath);
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
