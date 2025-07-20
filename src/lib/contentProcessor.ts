import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ContentItem } from '~/lib/content';
import { getCachedMemos, getCachedPosts } from '~/lib/content-cache';
import { getFileRecord, upsertFileRecord } from './db';
import type { NewVectorizedFile } from './schema';

export interface ProcessedContent {
  filepath: string;
  slug: string; // Add slug field
  rawContent: string;
  frontmatter: Record<string, any>;
  contentHash: string;
  lastModified: number; // File system last modified time
  effectiveContentUpdatedAt: number; // Timestamp when content hash last changed (or from DB if no change)
}

/**
 * Represents the details extracted from a file on disk.
 */
export interface FileDetailsFromDisk {
  filepath: string;
  rawContent: string;
  frontmatter: Record<string, any>;
  contentHash: string;
  lastModified: number; // File system last modified time
}

/**
 * 计算内容的 SHA-256 哈希值
 */
function calculateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 处理单个内容文件
 */
export async function processContentFile(filepath: string): Promise<FileDetailsFromDisk> {
  const absolutePath = path.resolve(process.cwd(), filepath);

  // 读取文件内容和状态
  const [content, stats] = await Promise.all([readFile(absolutePath, 'utf-8'), stat(absolutePath)]);

  // 提取 frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch ? JSON.parse(JSON.stringify(frontmatterMatch[1])) : {};

  // 提取正文
  const mainContent = content.replace(/^---\n[\s\S]*?\n---/, '').trim();

  // 计算内容哈希 (只对正文计算)
  const contentHash = calculateContentHash(mainContent);

  return {
    filepath: filepath,
    rawContent: content,
    frontmatter,
    contentHash,
    lastModified: stats.mtimeMs,
  };
}

/**
 * 更新数据库记录
 */
export async function updateContentRecord(
  processed: ProcessedContent,
  modelName: string,
  vector?: Buffer
): Promise<void> {
  const record: NewVectorizedFile = {
    filepath: processed.filepath,
    slug: processed.slug,
    contentHash: processed.contentHash,
    lastModifiedTime: processed.lastModified,
    contentUpdatedAt: processed.effectiveContentUpdatedAt,
    indexedAt: Date.now(),
    modelName: modelName,
    vector,
  };

  await upsertFileRecord(record);
}

/**
 * 统一处理任何来源的内容项，并确定是否需要向量化
 */
async function determineVectorizationStatus(
  item: ContentItem,
  force: boolean = false
): Promise<ProcessedContent | undefined> {
  try {
    // 从 ContentItem 安全地提取数据
    const filepath = item.id;
    const slug = item.slug;
    const rawContent = item.body;
    const frontmatter = item.raw?.frontmatter || item.raw?.data || {};

    // 验证基本数据
    if (!filepath || !slug) {
      console.error(`Error processing item: 'id' or 'slug' is missing.`, item);
      return undefined;
    }
    if (typeof rawContent !== 'string') {
      console.error(`Error processing ${filepath}: content body is not a string, skipping.`);
      return undefined;
    }

    // 计算内容哈希
    const contentHash = calculateContentHash(rawContent);

    // 检查数据库中的现有记录
    const existingRecord = await getFileRecord(filepath);

    let effectiveContentUpdatedAt: number;
    let needsVectorization = false;

    // 确定内容的有效更新时间
    if (existingRecord && existingRecord.contentHash === contentHash) {
      effectiveContentUpdatedAt = existingRecord.contentUpdatedAt;
    } else {
      effectiveContentUpdatedAt = Date.now();
    }

    const embeddingModelName = process.env.EMBEDDING_MODEL_NAME ?? 'text-embedding-3-small';

    // 判断是否需要向量化
    if (force) {
      console.log(`强制处理文件 ${filepath}.`);
      needsVectorization = true;
    } else if (
      !existingRecord ||
      !existingRecord.vector ||
      (existingRecord.vector as Uint8Array).length === 0 ||
      existingRecord.modelName !== embeddingModelName
    ) {
      console.log(`文件 ${filepath} 是新文件、缺少向量或模型不匹配，需要向量化.`);
      needsVectorization = true;
    } else if (existingRecord.indexedAt < effectiveContentUpdatedAt) {
      console.log(`文件 ${filepath} 内容已更新，需要重新向量化 (indexed_at < effectiveContentUpdatedAt).`);
      needsVectorization = true;
    } else {
      console.log(`文件 ${filepath} 未修改且向量化已是最新，跳过处理.`);
    }

    if (needsVectorization) {
      console.log(`准备向量化文件: ${filepath}`);
      return {
        filepath,
        slug,
        rawContent,
        frontmatter,
        contentHash,
        lastModified: item.updateDate?.getTime() || item.publishDate.getTime(),
        effectiveContentUpdatedAt,
      };
    }

    return undefined; // 不需要向量化
  } catch (error) {
    console.error(`处理 ${item.id} 时发生错误:`, error);
    return undefined;
  }
}

/**
 * 批量处理内容文件
 */
export async function processAllContent(
  force: boolean = false,
  onProgress?: (message: string) => void
): Promise<{ filesToProcess: ProcessedContent[]; allFilepaths: Set<string> }> {
  onProgress?.(`开始处理所有内容文件 (force: ${force})...`);
  const filesToProcess: ProcessedContent[] = [];
  const allFilepaths = new Set<string>();

  // 从数据库缓存获取所有内容
  const [cachedPosts, cachedMemos] = await Promise.all([getCachedPosts(), getCachedMemos()]);

  // 转换为 ContentItem 格式
  const allContent: ContentItem[] = [
    ...cachedPosts.map((post) => ({
      id: post.id,
      slug: post.slug,
      type: post.type as ContentItem['type'],
      title: post.title,
      excerpt: post.excerpt || '',
      body: post.body,
      publishDate: new Date(post.publishDate * 1000),
      updateDate: post.updateDate ? new Date(post.updateDate * 1000) : undefined,
      draft: post.draft,
      public: post.public,
      tags: post.tags ? JSON.parse(post.tags).map((tag: string) => ({ slug: tag, title: tag })) : [],
      raw: { data: post.metadata ? JSON.parse(post.metadata) : {} },
    })),
    ...cachedMemos.map((memo) => ({
      id: memo.id,
      slug: memo.slug,
      type: 'memo' as const,
      title: memo.title || '无标题 Memo',
      excerpt: '',
      body: memo.body,
      publishDate: new Date(memo.publishDate * 1000),
      updateDate: memo.updateDate ? new Date(memo.updateDate * 1000) : undefined,
      draft: false,
      public: memo.public,
      tags: memo.tags ? JSON.parse(memo.tags).map((tag: string) => ({ slug: tag, title: tag })) : [],
      raw: { data: {} },
    })),
  ];

  onProgress?.(`共找到 ${allContent.length} 篇内容。`);

  for (const item of allContent) {
    if (item && item.id) {
      allFilepaths.add(item.id);
      const processed = await determineVectorizationStatus(item, force);
      if (processed) {
        filesToProcess.push(processed);
      }
    } else {
      console.warn('发现一个缺少 id 的内容项，已跳过:', item);
    }
  }

  return { filesToProcess, allFilepaths };
}
