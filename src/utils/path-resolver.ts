/**
 * 路径解析工具
 * 提供统一的相对路径解析功能
 */

/**
 * 解析相对路径为绝对路径
 * 统一处理图片和链接的路径解析逻辑
 *
 * @param src 原始路径
 * @param articleDir 文章所在目录（如 "Memos/" 或 ""）
 * @returns 解析后的绝对路径
 */
export function resolveRelativePath(src: string, articleDir: string): string {
  let resolvedPath: string;

  if (src.startsWith('~/assets/')) {
    // 处理 ~/assets/ 路径，这些是WebDAV上的全局资源
    // 直接使用 assets/ 路径，不需要添加文章目录
    const assetPath = src.substring(9); // 移除 '~/assets/'
    resolvedPath = `assets/${assetPath}`;
  } else if (src.startsWith('./')) {
    // 相对于文章目录的路径
    resolvedPath = `${articleDir}${src.substring(2)}`;
  } else if (src.startsWith('../')) {
    // 相对于上级目录的路径
    // 计算上级目录
    const parts = articleDir.split('/').filter(Boolean);
    let upCount = 0;
    let srcParts = src.split('/');

    // 计算上级目录的数量
    while (srcParts.length > 0 && srcParts[0] === '..') {
      upCount++;
      srcParts.shift();
    }

    // 构建新路径
    const newDirParts = parts.slice(0, Math.max(0, parts.length - upCount));
    resolvedPath = `${newDirParts.join('/')}/${srcParts.join('/')}`;
  } else if (src.startsWith('/')) {
    // 绝对路径（相对于WebDAV根目录）
    resolvedPath = src.substring(1);
  } else {
    // 没有前缀的相对路径
    // 对于 Memos，图片通常在全局 assets 目录下
    if (articleDir.startsWith('Memos/')) {
      // 如果路径已经以 assets/ 开头，直接使用
      if (src.startsWith('assets/')) {
        resolvedPath = src;
      } else {
        resolvedPath = `assets/${src}`;
      }
    } else {
      // 其他情况，视为相对于文章目录
      resolvedPath = `${articleDir}${src}`;
    }
  }

  // 清理路径（移除多余的斜杠等）
  return resolvedPath.replace(/\/+/g, '/').replace(/^\//, '');
}

/**
 * 生成优化图片端点URL
 *
 * @param resolvedPath 已解析的绝对路径
 * @param options 图片优化选项
 * @returns 优化图片端点URL
 */
export function generateOptimizedImageUrl(
  resolvedPath: string,
  options: {
    format?: 'webp' | 'jpeg' | 'png';
    quality?: number;
    size?: number;
    dpr?: number;
  } = {}
): string {
  const { format = 'webp', quality = 85, size = 1200, dpr = 1 } = options;

  return `/api/render-image/${resolvedPath}?f=${format}&q=${quality}&s=${size}&dpr=${dpr}`;
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
  return path.startsWith('http://') || path.startsWith('https://');
}

/**
 * 检查路径是否已经是优化图片端点
 *
 * @param path 路径
 * @returns 是否已经是优化图片端点
 */
export function isOptimizedImageUrl(path: string): boolean {
  return path.startsWith('/api/render-image/');
}
