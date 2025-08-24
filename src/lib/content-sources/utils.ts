/**
 * 多源内容采集系统 - 工具函数
 *
 * 提供 Markdown 解析、哈希计算、路径处理等通用工具函数
 */

import { createHash } from "node:crypto";
import matter from "gray-matter";
import limax from "limax";
import type { ContentItem, ContentType, FileInfo, ParsedContent } from "./types";

// ============================================================================
// 内容解析工具
// ============================================================================

/**
 * 解析 Markdown 内容
 * @param rawContent 原始 Markdown 内容
 * @param filePath 文件路径（用于错误报告）
 */
export function parseMarkdownContent(rawContent: string, filePath: string): ParsedContent {
  try {
    const { data: frontmatter, content: body } = matter(rawContent);
    const contentHash = calculateContentHash(rawContent);

    return {
      frontmatter,
      body: body.trim(),
      contentHash,
      parsedAt: Date.now(),
    };
  } catch (error) {
    throw new Error(
      `解析 Markdown 文件失败 ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * 从解析结果创建内容项
 * @param parsed 解析结果
 * @param filePath 文件路径
 * @param source 内容源标识
 */
export function createContentItemFromParsed(
  parsed: ParsedContent,
  filePath: string,
  source: string
): ContentItem {
  const { frontmatter, body, contentHash } = parsed;

  // 从文件路径推断内容类型
  const contentType = inferContentTypeFromPath(filePath);

  // 生成 slug
  const slug = generateSlugFromPath(filePath, frontmatter.slug as string);

  // 提取标题
  const title = extractTitle(frontmatter, body, filePath);

  // 提取发布日期
  const publishDate = extractPublishDate(frontmatter, filePath);

  // 提取标签
  const tags = extractTags(frontmatter);

  return {
    id: filePath,
    type: contentType,
    slug,
    title,
    excerpt: (frontmatter.excerpt as string) || extractExcerpt(body),
    contentHash,
    lastModified: Date.now(), // 这里应该从文件系统获取，子类会覆盖
    source,
    filePath,
    draft: Boolean(frontmatter.draft),
    public: frontmatter.public !== false, // 默认为 true
    publishDate,
    updateDate: frontmatter.updateDate
      ? new Date(frontmatter.updateDate as string).getTime()
      : undefined,
    category: frontmatter.category as string,
    tags,
    author: frontmatter.author as string,
    image: frontmatter.image as string,
    metadata: {
      ...frontmatter,
      // 添加正文内容到 metadata 中
      content: body,
      // 移除已经提取的字段，避免重复
      slug: undefined,
      title: undefined,
      excerpt: undefined,
      draft: undefined,
      public: undefined,
      publishDate: undefined,
      updateDate: undefined,
      category: undefined,
      tags: undefined,
      author: undefined,
      image: undefined,
    },
  };
}

// ============================================================================
// 哈希计算工具
// ============================================================================

/**
 * 计算内容哈希值
 * @param content 内容字符串
 * @param algorithm 哈希算法，默认为 sha256
 */
export function calculateContentHash(content: string, algorithm: string = "sha256"): string {
  return createHash(algorithm).update(content, "utf8").digest("hex");
}

/**
 * 计算文件信息哈希（用于变更检测）
 * @param fileInfo 文件信息
 */
export function calculateFileInfoHash(fileInfo: FileInfo): string {
  const hashInput = `${fileInfo.path}:${fileInfo.size}:${fileInfo.lastModified}:${fileInfo.etag || ""}`;
  return calculateContentHash(hashInput);
}

// ============================================================================
// 路径处理工具
// ============================================================================

/**
 * 从文件路径推断内容类型
 * @param filePath 文件路径
 */
export function inferContentTypeFromPath(filePath: string): ContentType {
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");

  // 检查路径是否包含特定目录（路径使用复数，但返回单数类型）
  if (normalizedPath.includes("/posts/") || normalizedPath.startsWith("posts/")) {
    return "post";
  }

  if (normalizedPath.includes("/projects/") || normalizedPath.startsWith("projects/")) {
    return "project";
  }

  if (normalizedPath.includes("/memos/") || normalizedPath.startsWith("memos/")) {
    return "memo";
  }

  // 默认为 post
  return "post";
}

/**
 * 生成 URL 友好的 slug
 * @param filePath 文件路径
 * @param frontmatterSlug frontmatter 中的 slug
 */
export function generateSlugFromPath(filePath: string, frontmatterSlug?: string): string {
  if (frontmatterSlug) {
    return limax(frontmatterSlug);
  }

  // 从文件路径提取文件名（不含扩展名）
  const fileName =
    filePath
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.(md|mdx)$/i, "") || "";

  // 移除日期前缀（如 2023-12-01-title.md -> title）
  const withoutDatePrefix = fileName.replace(/^\d{4}-\d{2}-\d{2}-/, "");

  return limax(withoutDatePrefix);
}

/**
 * 规范化文件路径
 * @param filePath 原始文件路径
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/**
 * 检查文件是否为 Markdown 文件
 * @param filePath 文件路径
 */
export function isMarkdownFile(filePath: string): boolean {
  return /\.(md|mdx)$/i.test(filePath);
}

// ============================================================================
// 内容提取工具
// ============================================================================

/**
 * 提取标题
 * @param frontmatter frontmatter 数据
 * @param body 正文内容
 * @param filePath 文件路径（用于生成默认标题）
 */
function extractTitle(
  frontmatter: Record<string, unknown>,
  body: string,
  filePath: string
): string {
  // 优先使用 frontmatter 中的标题
  if (frontmatter.title && typeof frontmatter.title === "string") {
    return frontmatter.title.trim();
  }

  // 尝试从正文中提取第一个 H1 标题
  const h1Match = body.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // 使用文件名作为默认标题
  const fileName =
    filePath
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.(md|mdx)$/i, "") || "Untitled";
  return fileName.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/[-_]/g, " ");
}

/**
 * 提取发布日期
 * @param frontmatter frontmatter 数据
 * @param filePath 文件路径
 */
function extractPublishDate(frontmatter: Record<string, unknown>, filePath: string): number {
  // 优先使用 frontmatter 中的日期
  if (frontmatter.date) {
    const date = new Date(frontmatter.date as string);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  if (frontmatter.publishDate) {
    const date = new Date(frontmatter.publishDate as string);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // 尝试从文件名中提取日期
  const fileName = filePath.split(/[/\\]/).pop() || "";
  const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const date = new Date(dateMatch[1]);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // 默认使用当前时间
  return Date.now();
}

/**
 * 提取标签
 * @param frontmatter frontmatter 数据
 */
function extractTags(frontmatter: Record<string, unknown>): string[] {
  const tags = frontmatter.tags;

  if (Array.isArray(tags)) {
    return tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim());
  }

  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * 提取摘要
 * @param body 正文内容
 * @param maxLength 最大长度
 */
function extractExcerpt(body: string, maxLength: number = 200): string {
  // 移除 Markdown 语法
  const plainText = body
    .replace(/#{1,6}\s+/g, "") // 移除标题标记
    .replace(/\*\*(.*?)\*\*/g, "$1") // 移除粗体标记
    .replace(/\*(.*?)\*/g, "$1") // 移除斜体标记
    .replace(/`(.*?)`/g, "$1") // 移除行内代码标记
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 移除链接，保留文本
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "") // 移除图片
    .replace(/\n+/g, " ") // 将换行符替换为空格
    .trim();

  if (plainText.length <= maxLength) {
    return plainText;
  }

  // 在单词边界截断
  const truncated = plainText.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(" ");

  if (lastSpaceIndex > maxLength * 0.8) {
    return `${truncated.substring(0, lastSpaceIndex)}...`;
  }

  return `${truncated}...`;
}

// ============================================================================
// 验证工具
// ============================================================================

/**
 * 验证内容项是否有效
 * @param item 内容项
 */
export function validateContentItem(item: ContentItem): boolean {
  if (!item.id || !item.title || !item.slug) {
    return false;
  }

  if (!["post", "project", "memo"].includes(item.type)) {
    return false;
  }

  if (!item.contentHash || item.contentHash.length !== 64) {
    return false;
  }

  if (!Number.isInteger(item.lastModified) || item.lastModified <= 0) {
    return false;
  }

  return true;
}

/**
 * 清理和规范化内容项
 * @param item 内容项
 */
export function sanitizeContentItem(item: ContentItem): ContentItem {
  return {
    ...item,
    title: item.title.trim(),
    slug: limax(item.slug),
    excerpt: item.excerpt?.trim() || "",
    tags: item.tags.map((tag) => tag.trim()).filter(Boolean),
    category: item.category?.trim() || undefined,
    author: item.author?.trim() || undefined,
  };
}
