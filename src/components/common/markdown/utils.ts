import { resolveImagePath as resolveImagePathCommon } from "@/lib/image-utils";
import { removeInlineTags } from "@/lib/tag-parser";
import type { VariantConfig } from "./types";

/**
 * 检查 URL 是否为外部链接
 */
export function isExternalUrl(url: string): boolean {
  if (!url) return false;
  return /^https?:\/\//.test(url) || url.startsWith("//");
}

/**
 * 检查路径是否为图片文件
 */
export function isImagePath(path: string): boolean {
  if (!path) return false;
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;
  return imageExtensions.test(path);
}

/**
 * 检查 URL 是否已经是优化过的图片端点
 */
export function isOptimizedImageUrl(url: string): boolean {
  if (!url) return false;
  return url.includes("/api/render-image/") || url.includes("/api/files/");
}

/**
 * 解析相对路径
 * @param relativePath 相对路径
 * @param basePath 基础路径
 * @returns 解析后的路径
 */
export function resolveRelativePath(relativePath: string, basePath: string = ""): string {
  if (!relativePath) return "";

  // 如果已经是绝对路径或外部链接，直接返回
  if (relativePath.startsWith("/") || isExternalUrl(relativePath)) {
    return relativePath;
  }

  // 处理相对路径
  let resolvedPath = relativePath;
  let currentBasePath = basePath;

  if (relativePath.startsWith("./")) {
    resolvedPath = relativePath.substring(2);
  } else if (relativePath.startsWith("../")) {
    // 正确处理上级目录
    let upLevels = 0;
    let tempPath = relativePath;

    // 计算需要向上几级
    while (tempPath.startsWith("../")) {
      upLevels++;
      tempPath = tempPath.substring(3);
    }

    resolvedPath = tempPath;

    // 从基础路径中移除相应的级数
    if (currentBasePath) {
      const pathParts = currentBasePath.split("/").filter((part) => part !== "");
      const remainingParts = pathParts.slice(0, Math.max(0, pathParts.length - upLevels));
      currentBasePath = remainingParts.length > 0 ? `${remainingParts.join("/")}/` : "";
    }
  }

  // 组合基础路径
  if (currentBasePath) {
    const cleanBasePath = currentBasePath.endsWith("/") ? currentBasePath : `${currentBasePath}/`;
    resolvedPath = cleanBasePath + resolvedPath;
  }

  return resolvedPath;
}

/**
 * 生成优化图片 URL
 * @param imagePath 图片路径
 * @param contentSource 内容源类型
 * @returns 优化后的图片 URL
 */
export function generateOptimizedImageUrl(
  imagePath: string,
  contentSource: "local" | "webdav" = "webdav"
): string {
  // 对于演示页面，使用 base64 编码的占位图片
  if (typeof window !== "undefined" && window.location.pathname === "/demo-integration") {
    // 根据图片名称生成不同的占位图片
    const fileName = imagePath.split("/").pop() || "placeholder";

    if (fileName.includes("示例图片") || fileName.includes("600x300")) {
      // 600x300 蓝色示例图片
      return `data:image/svg+xml;base64,${btoa(`
        <svg width="600" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="600" height="300" fill="#4F46E5"/>
          <text x="300" y="150" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="24" font-family="Arial">示例图片 (600x300)</text>
        </svg>
      `)}`;
    } else if (fileName.includes("闪念图片") || fileName.includes("400x200")) {
      // 400x200 绿色闪念图片
      return `data:image/svg+xml;base64,${btoa(`
        <svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="200" fill="#10B981"/>
          <text x="200" y="100" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="20" font-family="Arial">闪念图片 (400x200)</text>
        </svg>
      `)}`;
    } else {
      // 默认 300x200 紫色图片
      return `data:image/svg+xml;base64,${btoa(`
        <svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="300" height="200" fill="#6366F1"/>
          <text x="150" y="100" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="18" font-family="Arial">演示图片 (300x200)</text>
        </svg>
      `)}`;
    }
  }

  // 统一走公共图片路径解析，保持大小写与实际文件一致
  const resolved = resolveImagePathCommon(imagePath, contentSource);
  return resolved ?? imagePath;
}

/**
 * 安全的 URL 转换函数
 * @param url 原始 URL
 * @returns 安全的 URL
 */
export function defaultUrlTransform(url: string): string {
  if (!url) return "";

  // 允许的协议
  const allowedProtocols = ["http:", "https:", "mailto:", "tel:", "data:"];

  try {
    // 允许 data:image/* 的内联图片（用于渲染 base64 图片）
    if (url.startsWith("data:")) {
      // 仅放行图片的 data URL，其他类型一律拦截
      if (/^data:image\/[a-zA-Z.+-]+;base64,/.test(url)) {
        return url;
      }
      return "";
    }

    // 相对 URL 直接返回
    if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
      return url;
    }

    // 检查协议
    const urlObj = new URL(url);
    if (allowedProtocols.includes(urlObj.protocol)) {
      return url;
    }
  } catch {
    // URL 解析失败，可能是相对路径或无效 URL
    return url;
  }

  // 不安全的 URL，返回空字符串
  return "";
}

/**
 * 从 React 节点中提取纯文本内容
 * 处理 rehype-highlight 等插件产生的复杂对象结构
 * @param children React 节点（可能是字符串、对象、数组等）
 * @returns 提取的纯文本内容
 */
export function extractTextContent(children: unknown): string {
  if (typeof children === "string") {
    return children;
  }

  if (typeof children === "number") {
    return String(children);
  }

  if (children == null) {
    return "";
  }

  if (Array.isArray(children)) {
    return children.map(extractTextContent).join("");
  }

  // 处理 React 元素
  if (typeof children === "object" && children && "props" in children) {
    const reactElement = children as { props?: { children?: unknown } };
    if (reactElement.props?.children) {
      return extractTextContent(reactElement.props.children);
    }
  }

  // 处理 rehype/hast 节点
  if (typeof children === "object" && children) {
    const node = children as Record<string, unknown>;
    // 文本节点
    if (node.type === "text" && node.value) {
      return String(node.value);
    }

    // 元素节点
    if (node.type === "element" && node.children) {
      return extractTextContent(node.children);
    }

    // 处理 highlight.js 生成的 span 元素
    if (node.tagName === "span" && node.children) {
      return extractTextContent(node.children);
    }

    // 其他可能的文本属性
    if (node.value !== undefined) {
      return String(node.value);
    }

    if (node.data !== undefined) {
      return String(node.data);
    }

    if (node.children) {
      return extractTextContent(node.children);
    }

    // 如果对象有 toString 方法且不是默认的 [object Object]
    if (children.toString && children.toString() !== "[object Object]") {
      return children.toString();
    }
  }

  // 对于无法处理的对象，返回空字符串而不是 [object Object]
  if (typeof children === "object") {
    return "";
  }

  // 最后的回退方案
  return String(children);
}

/**
 * 计算文本行数
 * @param text 文本内容
 * @returns 行数
 */
export function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

/**
 * 提取代码块的语言
 * @param className 代码块的 className
 * @returns 语言名称
 */
export function extractLanguage(className?: string): string | undefined {
  if (!className) return undefined;
  const match = /language-(\w+)/.exec(className);
  return match ? match[1] : undefined;
}

/**
 * 清理 Markdown 内容
 * @param content 原始内容
 * @returns 清理后的内容
 */
export function cleanMarkdownContent(content: string): string {
  if (!content) return "";

  // 处理 Milkdown 编辑器输出的 HTML 转义问题
  let processedContent = content
    .replace(/\\#/g, "#") // 反转义标题
    .replace(/!\\\[/g, "![") // 反转义图片开始
    .replace(/\\\]/g, "]") // 反转义右方括号
    .replace(/\\\(/g, "(") // 反转义左圆括号
    .replace(/\\`/g, "`") // 反转义代码
    .replace(/\\\*/g, "*") // 反转义粗体/斜体
    .replace(/\\_/g, "_") // 反转义下划线
    .replace(/<br\s*\/?>/gi, "\n\n"); // 将HTML换行转换为markdown换行

  // 预处理图片和链接URL，将包含空格或特殊字符的URL用尖括号包围
  processedContent = processedContent.replace(
    /(!?\[([^\]]*)\])\(([^)]+)\)/g,
    (match, linkPart, _altText, url) => {
      // 检查URL是否包含空格或特殊字符，且不是已经用尖括号包围的
      if (!url.startsWith("<") && !url.endsWith(">")) {
        // 检查是否包含空格、中文字符或其他需要编码的字符
        if (/[\s\u4e00-\u9fff@]/.test(url)) {
          return `${linkPart}(<${url}>)`;
        }
      }
      return match;
    }
  );

  return processedContent;
}

/**
 * 移除内容中的内联标签
 * @param content 原始内容
 * @returns 移除标签后的内容
 */
export function removeTagsFromContent(content: string): string {
  if (!content) return "";
  return removeInlineTags(content);
}

/**
 * 获取渲染变体的默认配置
 * @param variant 变体类型
 * @returns 变体配置
 */
export function getVariantConfig(
  variant: "article" | "memo" | "preview" = "article"
): VariantConfig {
  const configs: Record<string, VariantConfig> = {
    article: {
      baseClassName: "prose prose-lg max-w-none",
      enableMath: true,
      enableMermaid: true,
      enableCodeFolding: true,
      maxCodeLines: 30,
      previewCodeLines: 20,
      enableImageLightbox: true,
    },
    memo: {
      baseClassName: "prose prose-sm max-w-none",
      enableMath: false,
      enableMermaid: false,
      enableCodeFolding: true,
      maxCodeLines: 20,
      previewCodeLines: 15,
      enableImageLightbox: true,
    },
    preview: {
      baseClassName: "prose prose-base max-w-none",
      enableMath: true,
      enableMermaid: true,
      enableCodeFolding: false,
      maxCodeLines: 50,
      previewCodeLines: 30,
      enableImageLightbox: false,
    },
  };

  return configs[variant] || configs.article;
}

/**
 * 合并类名
 * @param classes 类名数组
 * @returns 合并后的类名字符串
 */
export function mergeClassNames(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * 防抖函数
 * @param func 要防抖的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
