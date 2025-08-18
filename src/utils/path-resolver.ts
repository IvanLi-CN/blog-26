/**
 * 路径解析工具
 * 提供统一的相对路径解析功能
 */

/**
 * 解析相对路径为绝对路径
 * 统一处理图片和链接的路径解析逻辑
 *
 * @param src 原始路径
 * @param articleDir 文章所在目录（如 "Project/" 或 "Memos/"）
 * @returns 解析后的绝对路径
 */
export function resolveRelativePath(src: string, articleDir: string): string {
  let resolvedPath: string;

  if (src.startsWith("~/assets/")) {
    // 处理 ~/assets/ 路径，这些是WebDAV上的全局资源
    // 直接使用 assets/ 路径，不需要添加文章目录
    const assetPath = src.substring(9); // 移除 '~/assets/'
    resolvedPath = `assets/${assetPath}`;
  } else if (src.startsWith("./")) {
    // 相对于文章目录的路径
    resolvedPath = `${articleDir}${src.substring(2)}`;
  } else if (src.startsWith("../")) {
    // 相对于上级目录的路径
    // 计算上级目录
    const parts = articleDir.split("/").filter(Boolean);
    let upCount = 0;
    const srcParts = src.split("/");

    // 计算上级目录的数量
    while (srcParts.length > 0 && srcParts[0] === "..") {
      upCount++;
      srcParts.shift();
    }

    // 构建新路径
    const newDirParts = parts.slice(0, Math.max(0, parts.length - upCount));
    resolvedPath = `${newDirParts.join("/")}/${srcParts.join("/")}`;
  } else if (src.startsWith("/")) {
    // 绝对路径（相对于WebDAV根目录）
    resolvedPath = src.substring(1);
  } else {
    // 没有前缀的相对路径
    // 对于文章，图片通常在相对于文章目录的 assets 目录下
    if (src.startsWith("assets/")) {
      // 如果路径已经以 assets/ 开头，添加文章目录前缀
      resolvedPath = `${articleDir}${src}`;
    } else {
      // 其他情况，视为相对于文章目录的 assets 目录
      resolvedPath = `${articleDir}assets/${src}`;
    }
  }

  // 清理路径（移除多余的斜杠等）
  return resolvedPath.replace(/\/+/g, "/").replace(/^\//, "");
}

/**
 * 生成优化图片端点URL
 * 修复：使用现有的文件代理端点而不是不存在的render-image端点
 *
 * @param resolvedPath 已解析的绝对路径
 * @param options 图片优化选项（暂时保留接口，但使用文件代理）
 * @returns 文件代理端点URL
 */
export function generateOptimizedImageUrl(
  resolvedPath: string,
  options: {
    format?: "webp" | "jpeg" | "png";
    quality?: number;
    size?: number;
    dpr?: number;
    contentSource?: "webdav" | "local";
  } = {}
): string {
  const { contentSource = "webdav" } = options;

  // 使用现有的文件代理端点
  return `/api/files/${contentSource}/${resolvedPath}`;
}

/**
 * 检查路径是否为图片文件
 *
 * @param path 文件路径
 * @returns 是否为图片文件
 */
export function isImagePath(path: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)$/i.test(path);
}

/**
 * 检查路径是否为外部URL
 *
 * @param path 路径
 * @returns 是否为外部URL
 */
export function isExternalUrl(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://");
}

/**
 * 检查路径是否已经是文件代理端点
 * 修复：检查文件代理端点而不是不存在的render-image端点
 *
 * @param path 路径
 * @returns 是否已经是文件代理端点
 */
export function isOptimizedImageUrl(path: string): boolean {
  return path.startsWith("/api/files/");
}
