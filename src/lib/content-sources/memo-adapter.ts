/**
 * Memo 数据适配器
 *
 * 处理 memos 表记录与 ContentItem 接口之间的转换
 */

import type { Post as PostRow } from "../schema";
import type { ContentItem } from "./types";

/**
 * 将数据库中的 Memo 记录转换为 ContentItem
 */
export function memoToContentItem(memo: PostRow): ContentItem {
  // 解析 JSON 字段
  const tags = memo.tags ? JSON.parse(memo.tags) : [];
  const metadata = memo.metadata ? JSON.parse(memo.metadata) : {};
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];

  return {
    // ContentItem 核心字段
    id: memo.id,
    type: "memo" as const,
    slug: memo.slug || generateSlugFromId(memo.id),
    title: memo.title || extractTitleFromContent(memo.body),
    excerpt: memo.excerpt || generateExcerptFromContent(memo.body),
    contentHash: memo.contentHash,
    lastModified: memo.lastModified || memo.updateDate || memo.publishDate,
    source: memo.source || memo.dataSource || "webdav",
    filePath: memo.filePath || memo.id,
    draft: Boolean(memo.draft),
    public: Boolean(memo.public ?? true),
    publishDate: memo.publishDate,
    updateDate: memo.updateDate || undefined,
    category: memo.category || undefined,
    tags,
    author: memo.author ?? undefined,
    image: memo.image ?? undefined,
    metadata: {
      ...metadata,
      // 保留 memo 特有的字段
      content: memo.body,
      attachments,
      // 兼容字段
      // 兼容字段（如存在）
      createdAt: memo.publishDate,
      updatedAt: memo.updateDate,
    },
  };
}

/**
 * 将 ContentItem 转换为 Memo 数据库记录
 */
export function contentItemToMemo(item: ContentItem, authorEmail: string): Partial<PostRow> {
  const metadata = { ...item.metadata };

  // 提取 memo 特有字段
  const content = (metadata.content as string) || "";
  const attachments = metadata.attachments || [];
  delete metadata.content;
  delete metadata.attachments;
  delete metadata.authorEmail;
  delete metadata.isPublic;
  delete metadata.createdAt;
  delete metadata.updatedAt;

  return {
    id: item.id,
    type: "memo",
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    contentHash: item.contentHash,
    lastModified: item.lastModified,
    source: item.source,
    filePath: item.filePath,
    draft: item.draft,
    public: item.public,
    publishDate: item.publishDate,
    updateDate: item.updateDate,
    category: item.category,
    tags: JSON.stringify(item.tags),
    author: item.author,
    image: item.image,
    metadata: JSON.stringify({ ...metadata, attachments, authorEmail }),

    // Post body 字段
    body: content,
  };
}

/**
 * 从文件 ID 生成 slug
 */
function generateSlugFromId(id: string): string {
  return id
    .replace(/^\/+|\/+$/g, "") // 移除首尾斜杠
    .replace(/\.[^.]+$/, "") // 移除文件扩展名
    .replace(/[/\\]/g, "-") // 将路径分隔符替换为连字符
    .replace(/[^a-zA-Z0-9\-_]/g, "-") // 替换非法字符
    .replace(/-+/g, "-") // 合并多个连字符
    .toLowerCase();
}

/**
 * 从内容中提取标题
 */
function extractTitleFromContent(content: string): string {
  // 查找第一个 H1 标题
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // 查找第一个 H2 标题
  const h2Match = content.match(/^##\s+(.+)$/m);
  if (h2Match) {
    return h2Match[1].trim();
  }

  // 使用第一行非空内容
  const firstLine = content.split("\n").find((line) => line.trim());
  if (firstLine) {
    return firstLine.trim().substring(0, 50);
  }

  return "无标题 Memo";
}

/**
 * 从内容中生成摘要
 */
function generateExcerptFromContent(content: string): string {
  // 移除 Markdown 标记
  const plainText = content
    .replace(/^#+\s+/gm, "") // 移除标题标记
    .replace(/\*\*(.*?)\*\*/g, "$1") // 移除粗体标记
    .replace(/\*(.*?)\*/g, "$1") // 移除斜体标记
    .replace(/`(.*?)`/g, "$1") // 移除代码标记
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 移除链接，保留文本
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "") // 移除图片
    .trim();

  // 取前150个字符
  return plainText.length > 150 ? `${plainText.substring(0, 150)}...` : plainText;
}

/**
 * 验证 ContentItem 是否为有效的 memo
 */
export function isValidMemoContentItem(item: ContentItem): boolean {
  return (
    item.type === "memo" &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.contentHash === "string" &&
    item.contentHash.length > 0 &&
    typeof item.metadata.content === "string" &&
    item.metadata.content.length > 0
  );
}
