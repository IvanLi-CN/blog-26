/**
 * 多源内容采集系统 - 工具函数
 *
 * 提供 Markdown 解析、哈希计算、路径处理等通用工具函数
 */

import matter from "gray-matter";
import limax from "limax";
import { nanoid } from "nanoid";
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

  // 提取标签（合并frontmatter标签和内联标签）
  const tags = extractAllTags(frontmatter, body);

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
  // Prefer Bun's CryptoHasher when available (synchronous, Bun-compatible)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bunGlobal = (globalThis as any).Bun;
    if (bunGlobal && typeof bunGlobal.CryptoHasher === "function") {
      const hasher = new bunGlobal.CryptoHasher(algorithm);
      hasher.update(content);
      return hasher.digest("hex"); // 64-length hex for sha256
    }
  } catch {
    // ignore and fallback
  }

  // Environment-neutral, synchronous fallback that yields a 64-hex digest.
  // Construct 8 independent 32-bit FNV-1a style rounds with different salts
  // and concatenate their hex outputs to reach 64 characters. This is
  // deterministic and sufficient for change detection while remaining safe for
  // client bundles (no Node-only APIs, no async WebCrypto).

  // Single 32-bit FNV-1a style round
  const fnv1a32 = (str: string, seed: number): number => {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      // Mix using shifts to simulate multiplication by FNV prime without BigInt
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  };

  // Different salts (odd numbers) to decorrelate rounds
  const SALTS = [
    0x811c9dc5, // FNV offset basis
    0x811c9dc5 ^ 0x9e3779b9,
    0x811c9dc5 ^ 0x7f4a7c15,
    0x811c9dc5 ^ 0x94d049bb,
    0x811c9dc5 ^ 0xd1b54a32,
    0x811c9dc5 ^ 0x3c6ef372,
    0x811c9dc5 ^ 0xa54ff53a,
    0x811c9dc5 ^ 0x510e527f,
  ];

  let digest = "";
  for (let i = 0; i < SALTS.length; i++) {
    const part = fnv1a32(`${i}|${content}|${content.length}`, SALTS[i])
      .toString(16)
      .padStart(8, "0");
    digest += part;
  }

  // Ensure 64 hex chars
  if (digest.length !== 64) {
    digest = (digest + digest).slice(0, 64);
  }
  return digest;
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

  // 检查新格式：{datePrefix}_{titleSlug}.md (如: 20241201_react-learning)
  const newFormatMatch = fileName.match(/^(\d{8})_(.+)$/);
  if (newFormatMatch) {
    const titleSlug = newFormatMatch[2];
    // 如果titleSlug看起来像nanoid（8位字母数字），为同步生成一个新的nanoid
    if (/^[a-zA-Z0-9_-]{8}$/.test(titleSlug)) {
      return generateNanoidSlug(8);
    }
    // 否则使用titleSlug作为基础生成slug
    return limax(titleSlug);
  }

  // 优先查找时间戳模式（如 -1756460268805）
  const timestampMatch = fileName.match(/-(\d{10,13})$/);
  if (timestampMatch) {
    // 直接使用时间戳作为 slug
    return timestampMatch[1];
  }

  // 移除旧格式日期前缀（如 2023-12-01-title.md -> title）
  const withoutDatePrefix = fileName.replace(/^\d{4}-\d{2}-\d{2}-/, "");

  // 如果处理后的文件名为空或太短，生成nanoid
  if (!withoutDatePrefix || withoutDatePrefix.length < 2) {
    return generateNanoidSlug(8);
  }

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
export function extractTitle(
  frontmatter: Record<string, unknown>,
  body: string,
  filePath: string
): string {
  // 优先使用 frontmatter 中的标题
  if (frontmatter.title && typeof frontmatter.title === "string") {
    return frontmatter.title.trim();
  }

  // 尝试从正文中提取标题，按优先级 H1 > H2 > ... > H7
  // 支持文档规范要求的 H1-H7 标题提取
  const titlePatterns = [
    /^#\s+(.+)$/m, // H1
    /^##\s+(.+)$/m, // H2
    /^###\s+(.+)$/m, // H3
    /^####\s+(.+)$/m, // H4
    /^#####\s+(.+)$/m, // H5
    /^######\s+(.+)$/m, // H6
    /^#######\s+(.+)$/m, // H7
  ];

  for (const pattern of titlePatterns) {
    const match = body.match(pattern);
    if (match) {
      return match[1].trim();
    }
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
export function extractPublishDate(frontmatter: Record<string, unknown>, filePath: string): number {
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

  // 支持多种日期格式
  // 格式1: YYYY-MM-DD (如 2024-01-15)
  let dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const date = new Date(dateMatch[1]);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }

  // 格式2: YYYYMMDD_ (如 20240115_)
  dateMatch = fileName.match(/^(\d{8})_/);
  if (dateMatch) {
    const dateStr = dateMatch[1];
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const date = new Date(`${year}-${month}-${day}`);
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
 * 从正文内容中提取内联标签
 * @param body 正文内容
 * @returns 内联标签数组
 */
export function extractInlineTags(body: string): string[] {
  if (!body) return [];

  const inlineTags: string[] = [];
  // 匹配 #标签 格式，支持中英文、数字、连字符
  const tagRegex = /#([^\s#]+)/g;
  let match: RegExpExecArray | null;

  match = tagRegex.exec(body);
  while (match !== null) {
    const tagContent = match[1];
    const hashIndex = match.index;

    // 检查是否是URL中的hash部分（简单检查前面是否有http或www）
    const beforeHash = body.substring(Math.max(0, hashIndex - 20), hashIndex);
    if (!/https?:\/\/|www\./i.test(beforeHash)) {
      // 验证标签格式：支持中英文、数字、连字符
      if (/^[\w\u4e00-\u9fff-]+$/.test(tagContent)) {
        inlineTags.push(tagContent);
      }
    }

    // 获取下一个匹配
    match = tagRegex.exec(body);
  }

  // 去重并返回
  return [...new Set(inlineTags)];
}

/**
 * 合并frontmatter标签和内联标签
 * @param frontmatter frontmatter 数据
 * @param body 正文内容
 * @returns 合并后的标签数组
 */
export function extractAllTags(frontmatter: Record<string, unknown>, body: string): string[] {
  const frontmatterTags = extractTags(frontmatter);
  const inlineTags = extractInlineTags(body);

  // 合并并去重
  const allTags = [...frontmatterTags, ...inlineTags];
  return [...new Set(allTags)];
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

// ============================================================================
// Memo 专用工具函数
// ============================================================================

/**
 * 生成nanoid slug（用于界面创建闪念时）
 * @param length slug长度，默认为8
 * @returns 唯一的nanoid字符串
 */
export function generateNanoidSlug(length: number = 8): string {
  return nanoid(length);
}

/**
 * 从标题生成URL友好的slug
 * @param title 标题
 * @returns URL友好的slug
 */
export function generateTitleSlug(title: string): string {
  if (!title) return "";

  // 使用limax处理中英文标题，生成URL友好的slug
  return limax(title, {
    replacement: "-",
    maintainCase: false,
    separator: "-",
  });
}

/**
 * 生成memo文件名（符合文档规范）
 * @param content 内容
 * @param title 标题（可选）
 * @param timestamp 时间戳（可选，默认当前时间）
 * @returns 文件名格式：{datePrefix}_{titleSlug}.md
 */
export function generateMemoFilename(content: string, title?: string, timestamp?: number): string {
  const now = new Date(timestamp || Date.now());

  // 生成日期前缀 YYYYMMDD
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const datePrefix = `${year}${month}${day}`;

  // 确定标题
  let finalTitle = title;
  if (!finalTitle) {
    // 从内容中提取标题
    const titlePatterns = [
      /^#\s+(.+)$/m, // H1
      /^##\s+(.+)$/m, // H2
      /^###\s+(.+)$/m, // H3
      /^####\s+(.+)$/m, // H4
      /^#####\s+(.+)$/m, // H5
      /^######\s+(.+)$/m, // H6
      /^#######\s+(.+)$/m, // H7
    ];

    for (const pattern of titlePatterns) {
      const match = content.match(pattern);
      if (match) {
        finalTitle = match[1].trim();
        break;
      }
    }
  }

  // 生成titleSlug
  let titleSlug: string;
  if (finalTitle) {
    titleSlug = generateTitleSlug(finalTitle);
    // 如果生成的slug为空或过短，使用nanoid
    if (!titleSlug || titleSlug.length < 2) {
      titleSlug = generateNanoidSlug(8);
    }
  } else {
    // 没有标题时使用nanoid
    titleSlug = generateNanoidSlug(8);
  }

  return `${datePrefix}_${titleSlug}.md`;
}
