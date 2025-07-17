import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fetchContent } from '~/lib/content';
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
 * 处理单个内容文件，并确定是否需要向量化
 */
export async function processContent(
  post: any, // 使用 any 类型以接纳来自 ContentItem 的 raw 数据
  force: boolean = false
): Promise<ProcessedContent | undefined> {
  try {
    const filepath = post.id; // Use post.id as filepath
    const slug = post.slug; // Get slug from post object
    const rawContent = post.body; // Use post.body directly
    const frontmatter = post.data; // Use post.data directly

    if (typeof rawContent !== 'string') {
      console.error(`Error processing ${post.id}: content body is not a string, skipping.`);
      return undefined;
    }

    // Calculate content hash from rawContent (post.body)
    const contentHash = calculateContentHash(rawContent);

    // Try to get existing record from DB
    const existingRecord = await getFileRecord(filepath);

    let effectiveContentUpdatedAt: number;
    let needsVectorization = false;

    // Determine effectiveContentUpdatedAt based on content hash change
    if (existingRecord && existingRecord.contentHash === contentHash) {
      // Content hash hasn't changed, use the existing contentUpdatedAt from DB
      effectiveContentUpdatedAt = existingRecord.contentUpdatedAt;
      console.log(`文件 ${filepath} 内容未修改，沿用数据库中的 content_updated_at.`);
    } else {
      // New file or content hash changed, set content_updated_at to now
      effectiveContentUpdatedAt = Date.now();
      console.log(`文件 ${filepath} 内容已修改或为新文件，设置 content_updated_at 为当前时间.`);
    }

    const embeddingModelName = process.env.EMBEDDING_MODEL_NAME ?? 'text-embedding-3-small';
    // Determine if needs vectorization
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
    } else if (existingRecord.indexedAt <= effectiveContentUpdatedAt) {
      console.log(`文件 ${filepath} 需要重新向量化 (indexed_at <= effectiveContentUpdatedAt).`);
      needsVectorization = true;
    } else {
      console.log(`文件 ${filepath} 未修改且向量化已是最新，跳过处理.`);
    }

    if (needsVectorization) {
      console.log(`处理文件 ${filepath} 并添加到向量化列表.`);
      // Create ProcessedContent object by combining data
      return {
        filepath: filepath,
        slug: slug,
        rawContent: rawContent,
        frontmatter: frontmatter,
        contentHash: contentHash,
        // lastModified is not used as per user request
        lastModified: existingRecord?.lastModifiedTime || Date.now(), // Use existing or current time if new
        effectiveContentUpdatedAt: effectiveContentUpdatedAt,
      };
    } else {
      return undefined; // No vectorization needed
    }
  } catch (error) {
    console.error(`Error processing ${post.id}:`, error);
    return undefined; // Return undefined on error
  }
}
/**
 * 处理 WebDAV 内容文件
 */
export async function processWebDAVContent(
  post: any, // 使用 any 类型以接纳来自 ContentItem 的 raw 数据
  force: boolean = false
): Promise<ProcessedContent | undefined> {
  try {
    const filepath = post.id;
    const slug = post.slug;
    const rawContent = post.body;
    const frontmatter = post.data;

    if (typeof rawContent !== 'string') {
      console.error(`Error processing WebDAV ${post.id}: content body is not a string, skipping.`);
      return undefined;
    }

    // Calculate content hash from rawContent
    const contentHash = calculateContentHash(rawContent);

    // Try to get existing record from DB
    const existingRecord = await getFileRecord(filepath);

    let effectiveContentUpdatedAt: number;
    let needsVectorization = false;

    // Determine effectiveContentUpdatedAt based on content hash change
    if (existingRecord && existingRecord.contentHash === contentHash) {
      // Content hash hasn't changed, use the existing contentUpdatedAt from DB
      effectiveContentUpdatedAt = existingRecord.contentUpdatedAt;
      console.log(`WebDAV 文件 ${filepath} 内容未修改，沿用数据库中的 content_updated_at.`);
    } else {
      // New file or content hash changed, set content_updated_at to now
      effectiveContentUpdatedAt = Date.now();
      console.log(`WebDAV 文件 ${filepath} 内容已修改或为新文件，设置 content_updated_at 为当前时间.`);
    }

    const embeddingModelName = process.env.EMBEDDING_MODEL_NAME ?? 'text-embedding-3-small';
    // Determine if needs vectorization
    if (force) {
      console.log(`强制处理 WebDAV 文件 ${filepath}.`);
      needsVectorization = true;
    } else if (
      !existingRecord ||
      !existingRecord.vector ||
      (existingRecord.vector as Uint8Array).length === 0 ||
      existingRecord.modelName !== embeddingModelName
    ) {
      console.log(`WebDAV 文件 ${filepath} 是新文件、缺少向量或模型不匹配，需要向量化.`);
      needsVectorization = true;
    } else if (existingRecord.indexedAt <= effectiveContentUpdatedAt) {
      console.log(`WebDAV 文件 ${filepath} 需要重新向量化 (indexed_at <= effectiveContentUpdatedAt).`);
      needsVectorization = true;
    } else {
      console.log(`WebDAV 文件 ${filepath} 未修改且向量化已是最新，跳过处理.`);
    }

    if (needsVectorization) {
      console.log(`处理 WebDAV 文件 ${filepath} 并添加到向量化列表.`);
      return {
        filepath: filepath,
        slug: slug,
        rawContent: rawContent,
        frontmatter: frontmatter,
        contentHash: contentHash,
        lastModified: existingRecord?.lastModifiedTime || Date.now(),
        effectiveContentUpdatedAt: effectiveContentUpdatedAt,
      };
    } else {
      return undefined; // No vectorization needed
    }
  } catch (error) {
    console.error(`Error processing WebDAV ${post.id}:`, error);
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

  // 使用新的统一方法获取所有内容
  const allContent = await fetchContent(['all'], true); // 强制刷新缓存
  onProgress?.(`共找到 ${allContent.length} 篇内容。`);

  for (const item of allContent) {
    allFilepaths.add(item.id); // Add all found files to the set
    // 根据 item.raw 的存在和结构来判断来源
    const isLocal = 'render' in item.raw;
    const processed = isLocal ? await processContent(item.raw, force) : await processWebDAVContent(item.raw, force);

    if (processed) {
      filesToProcess.push(processed);
    }
  }

  return { filesToProcess, allFilepaths };
}
