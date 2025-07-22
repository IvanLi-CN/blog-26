/**
 * @file src/lib/content-cache.ts
 * @description 内容缓存管理器，负责将所有内容（markdown 纯文本）缓存到 SQLite 数据库中
 * 在项目启动时初始化，之后每 10 分钟刷新一次
 */

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { type ContentItem } from './content';
import { type Memo, memos, type NewMemo, type NewPost, type Post, posts } from './schema';

// 缓存刷新间隔：10 分钟
const CACHE_REFRESH_INTERVAL = 10 * 60 * 1000;

// WebDAV 请求限制配置
const WEBDAV_REQUEST_DELAY = 100; // 每个请求之间的延迟（毫秒）

let refreshTimer: NodeJS.Timeout | null = null;

// 定义进度类型
export interface ContentCacheProgress {
  stage: 'start' | 'posts' | 'memos' | 'done' | 'error';
  message: string;
  percentage?: number;
}

/**
 * 获取数据库实例（确保已初始化）
 */
async function getDB() {
  const dbModule = await import('./db');
  await dbModule.initializeDB();
  return dbModule.db;
}

/**
 * 计算内容哈希
 */
function calculateContentHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 基于 ETag 的智能内容获取（只获取有变化的内容）
 * TODO: 未来可能用于优化性能
 */
async function _fetchWebDAVContentWithETag(): Promise<ContentItem[]> {
  const { getWebDAVClient, isWebDAVEnabled } = await import('./webdav');

  if (!isWebDAVEnabled()) {
    return [];
  }

  const webdavClient = getWebDAVClient();
  const allContent: ContentItem[] = [];

  // 获取文章索引
  const postsIndex = await webdavClient.getPostsIndex();
  console.log(`📋 获取到 ${postsIndex.length} 个文章索引`);

  // 获取闪念索引
  const memosIndex = await webdavClient.getMemosIndex();
  console.log(`📋 获取到 ${memosIndex.length} 个闪念索引`);

  // 获取现有缓存的 ETag 信息
  const db = await getDB();
  const existingPosts = await db.select({ id: posts.id, etag: posts.etag }).from(posts);
  const existingMemos = await db.select({ id: memos.id, etag: memos.etag }).from(memos);

  const existingPostsETag = new Map(existingPosts.map((p) => [p.id, p.etag]));
  const existingMemosETag = new Map(existingMemos.map((m) => [m.id, m.etag]));

  // 分析需要更新的文章
  const postsToUpdate = postsIndex.filter((fileIndex) => {
    const existingETag = existingPostsETag.get(fileIndex.path);
    return !existingETag || existingETag !== fileIndex.etag;
  });

  // 分析需要更新的闪念
  const memosToUpdate = memosIndex.filter((fileIndex) => {
    const existingETag = existingMemosETag.get(fileIndex.path);
    return !existingETag || existingETag !== fileIndex.etag;
  });

  console.log(`🔄 需要更新 ${postsToUpdate.length} 篇文章，${memosToUpdate.length} 条闪念`);

  // 处理需要更新的文章（带速率控制）
  for (let i = 0; i < postsToUpdate.length; i++) {
    const fileIndex = postsToUpdate[i];
    try {
      const post = await webdavClient.getPostByIndex(fileIndex);

      // 转换为 ContentItem 格式，并添加 ETag 信息
      // 安全处理日期字段
      let publishDate = new Date(post.data.publishDate || post.data.date || Date.now());
      if (isNaN(publishDate.getTime())) {
        console.warn(`Invalid publishDate for post ${post.id}, using current time`);
        publishDate = new Date();
      }

      let updateDate: Date | undefined;
      if (post.data.updateDate) {
        updateDate = new Date(post.data.updateDate);
        if (isNaN(updateDate.getTime())) {
          console.warn(`Invalid updateDate for post ${post.id}, ignoring`);
          updateDate = undefined;
        }
      }

      const contentItem: ContentItem = {
        id: post.id,
        slug: post.slug,
        type: post.collection === 'projects' ? 'project' : 'post',
        title: post.data.title || '',
        excerpt: post.data.excerpt || post.data.description || '',
        body: post.body,
        publishDate,
        updateDate,
        draft: post.data.draft || false,
        public: post.data.public !== false,
        category: post.data.category ? { title: post.data.category, slug: post.data.category } : undefined,
        tags: post.data.tags ? post.data.tags.map((tag: string) => ({ title: tag, slug: tag })) : [],
        author: post.data.author || undefined,
        image: post.data.image || undefined,
        metadata: { ...post.data, etag: fileIndex.etag }, // 将 ETag 添加到 metadata 中
      };

      allContent.push(contentItem);

      // 添加小延迟以避免速率限制
      if (i < postsToUpdate.length - 1) {
        await delay(WEBDAV_REQUEST_DELAY);
      }
    } catch (error) {
      console.warn(`跳过文章 ${fileIndex.path}:`, error.message);
    }
  }

  // 处理需要更新的闪念（带速率控制）
  for (let i = 0; i < memosToUpdate.length; i++) {
    const fileIndex = memosToUpdate[i];
    try {
      const memo = await webdavClient.getMemoByIndex(fileIndex);

      // 转换为 ContentItem 格式，并添加 ETag 信息
      // 安全处理日期字段 - Memo 可以使用文件修改时间
      let publishDate = memo.createdAt;
      if (!publishDate || !(publishDate instanceof Date) || isNaN(publishDate.getTime())) {
        console.warn(
          `Invalid createdAt for memo ${memo.id}, this should not happen as WebDAV should provide valid dates`
        );
        continue; // 跳过没有有效时间的 memo（理论上不应该发生）
      }

      let updateDate: Date | undefined = memo.updatedAt;
      if (updateDate && (!(updateDate instanceof Date) || isNaN(updateDate.getTime()))) {
        console.warn(`Invalid updatedAt for memo ${memo.id}, ignoring`);
        updateDate = undefined;
      }

      const contentItem: ContentItem = {
        id: memo.id,
        slug: memo.slug,
        type: 'memo',
        title: memo.data.title || memo.id,
        excerpt: '',
        body: memo.body,
        publishDate,
        updateDate,
        draft: false,
        public: memo.data.public !== false,
        tags: memo.tags ? memo.tags.map((tag: string) => ({ title: tag, slug: tag })) : [],
        metadata: { ...memo.data, etag: fileIndex.etag }, // 将 ETag 添加到 metadata 中
      };

      allContent.push(contentItem);

      // 添加小延迟以避免速率限制
      if (i < memosToUpdate.length - 1) {
        await delay(WEBDAV_REQUEST_DELAY);
      }
    } catch (error) {
      console.warn(`跳过闪念 ${fileIndex.path}:`, error.message);
    }
  }

  return allContent;
}

/**
 * 将 ContentItem 转换为数据库记录格式
 */
function contentItemToPost(item: ContentItem): NewPost | null {
  const now = Date.now();
  const contentHash = calculateContentHash(item.body);

  // 如果 metadata 中有 lastmod（来自 WebDAV），使用它；否则使用当前时间
  const lastModified = item.metadata?.lastmod ? new Date(item.metadata.lastmod).getTime() : now;

  // 安全处理 publishDate，确保它是有效的 Date 对象
  if (!item.publishDate || !(item.publishDate instanceof Date) || isNaN(item.publishDate.getTime())) {
    console.warn(`Invalid or missing publishDate for item ${item.id}, skipping this item`);
    return null; // 返回 null 表示跳过这个项目
  }
  const publishDate = item.publishDate;

  // 安全处理 updateDate
  let updateDate: Date | null = null;
  if (item.updateDate && item.updateDate instanceof Date && !isNaN(item.updateDate.getTime())) {
    updateDate = item.updateDate;
  }

  return {
    id: item.id,
    slug: item.slug,
    type: item.type as 'post' | 'project',
    title: item.title || item.id,
    excerpt: item.excerpt || null,
    body: item.body,
    publishDate: Math.floor(publishDate.getTime() / 1000), // 转换为秒时间戳
    updateDate: updateDate ? Math.floor(updateDate.getTime() / 1000) : null, // 转换为秒时间戳
    draft: item.draft || false,
    public: item.public !== false, // 默认为 true
    category: item.category?.title || null,
    tags: item.tags && item.tags.length > 0 ? JSON.stringify(item.tags.map((t) => t.title)) : null,
    author: item.author || null,
    image: typeof item.image === 'string' ? item.image : item.image?.src || null,
    metadata: item.metadata ? JSON.stringify(item.metadata) : null,
    contentHash,
    etag: null, // WebDAV 服务器不支持 ETag，使用修改时间进行变更检测
    lastModified, // 使用 WebDAV 文件的修改时间或当前时间
    createdAt: now,
    updatedAt: now,
  };
}

function contentItemToMemo(item: ContentItem): NewMemo | null {
  const now = Date.now();
  const contentHash = calculateContentHash(item.body);

  // 如果 metadata 中有 lastmod（来自 WebDAV），使用它；否则使用当前时间
  const lastModified = item.metadata?.lastmod ? new Date(item.metadata.lastmod).getTime() : now;

  // 安全处理 publishDate，确保它是有效的 Date 对象
  // 对于 memo，publishDate 应该总是有效的（因为 WebDAV 会提供备选时间）
  if (!item.publishDate || !(item.publishDate instanceof Date) || isNaN(item.publishDate.getTime())) {
    console.warn(`Invalid or missing publishDate for memo ${item.id}, this should not happen`);
    return null; // 返回 null 表示跳过这个项目
  }
  const publishDate = item.publishDate;

  // 安全处理 updateDate
  let updateDate: Date | null = null;
  if (item.updateDate && item.updateDate instanceof Date && !isNaN(item.updateDate.getTime())) {
    updateDate = item.updateDate;
  }

  return {
    id: item.id,
    slug: item.slug,
    title: item.title || item.id,
    body: item.body,
    publishDate: Math.floor(publishDate.getTime() / 1000), // 转换为秒时间戳
    updateDate: updateDate ? Math.floor(updateDate.getTime() / 1000) : null, // 转换为秒时间戳
    public: item.public !== false, // 默认为 true
    tags: item.tags && item.tags.length > 0 ? JSON.stringify(item.tags.map((t) => t.title)) : null,
    attachments: null, // TODO: 从 raw 数据中提取附件信息
    contentHash,
    etag: null, // WebDAV 服务器不支持 ETag，使用修改时间进行变更检测
    lastModified, // 使用 WebDAV 文件的修改时间或当前时间
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 强制刷新文章缓存（忽略 ETag 和修改时间检测）
 */
async function forceRefreshPostsCache(onProgress?: (progress: ContentCacheProgress) => void): Promise<void> {
  console.log('🔄 开始强制刷新文章缓存...');
  onProgress?.({ stage: 'posts', message: '开始强制刷新文章缓存...' });

  try {
    // 获取 WebDAV 文件索引
    const { getWebDAVClient, isWebDAVEnabled } = await import('./webdav');
    let webdavPostsIndex: any[] = [];
    let webdavClient: any = null;

    if (isWebDAVEnabled()) {
      webdavClient = getWebDAVClient();
      webdavPostsIndex = await webdavClient.getPostsIndex();
      console.log(`📋 获取到 ${webdavPostsIndex.length} 个 WebDAV 文章索引`);
    }

    // 获取本地内容（从 content collections）
    const { loadPostsAndProjects } = await import('./content');
    const localContent = await loadPostsAndProjects();
    console.log(`📋 获取到 ${localContent.length} 个本地文章`);

    // 获取现有缓存记录
    const db = await getDB();
    const existingPosts = await db.select().from(posts);
    const existingPostsMap = new Map(existingPosts.map((p) => [p.id, p]));

    const toInsert: NewPost[] = [];
    const toUpdate: { id: string; data: Partial<NewPost> }[] = [];
    const processedIds = new Set<string>();

    // 强制处理本地文章（忽略内容哈希检测）
    for (let i = 0; i < localContent.length; i++) {
      const item = localContent[i];
      const progress = Math.round(((i + 1) / localContent.length) * 20); // 本地文章占20%进度 (5-25%)
      onProgress?.({
        stage: 'posts',
        message: `处理本地文章: ${item.title || item.id}`,
        percentage: 5 + progress,
      });

      const newPost = contentItemToPost(item);
      if (!newPost) {
        console.warn(`跳过无效时间的本地文章: ${item.title || item.id}`);
        continue;
      }
      const existing = existingPostsMap.get(item.id);

      processedIds.add(item.id);

      if (!existing) {
        toInsert.push(newPost);
        console.log(`✅ 准备插入本地文章: ${item.title || item.id}`);
      } else {
        // 强制更新，忽略内容哈希检测
        toUpdate.push({
          id: item.id,
          data: {
            ...newPost,
            createdAt: existing.createdAt,
            updatedAt: Date.now(),
          },
        });
        console.log(`🔄 准备更新本地文章: ${item.title || item.id}`);
      }
    }

    // 强制处理所有 WebDAV 文章（忽略修改时间检测）
    console.log(`🔄 强制更新所有 ${webdavPostsIndex.length} 个 WebDAV 文章`);
    onProgress?.({ stage: 'posts', message: `开始处理 ${webdavPostsIndex.length} 个 WebDAV 文章...`, percentage: 25 });

    // 处理需要更新的文章（带速率控制）
    for (let i = 0; i < webdavPostsIndex.length; i++) {
      const fileIndex = webdavPostsIndex[i];
      const progress = Math.round(((i + 1) / webdavPostsIndex.length) * 20); // WebDAV文章占20%进度 (25-45%)
      onProgress?.({
        stage: 'posts',
        message: `处理 WebDAV 文章 (${i + 1}/${webdavPostsIndex.length}): ${fileIndex.path}`,
        percentage: 25 + progress,
      });

      try {
        const post = await webdavClient.getPostByIndex(fileIndex);
        console.log(`✅ 成功获取 WebDAV 文章: ${post.data.title || fileIndex.path}`);

        // 转换为 ContentItem 格式，并添加 ETag 信息
        const contentItem: ContentItem = {
          id: post.id,
          slug: post.slug,
          type: post.type,
          title: post.data.title || post.id,
          excerpt: post.data.excerpt || '',
          body: post.body,
          publishDate: post.createdAt,
          updateDate: post.updatedAt,
          draft: post.data.draft || false,
          public: post.data.public !== false,
          category: post.data.category ? { title: post.data.category, slug: post.data.category } : undefined,
          tags: post.tags ? post.tags.map((tag: string) => ({ title: tag, slug: tag })) : [],
          author: post.data.author || null,
          image: post.data.image || null,
          metadata: { ...post.data, etag: fileIndex.etag }, // 将 ETag 添加到 metadata 中
        };

        const newPost = contentItemToPost(contentItem);
        if (!newPost) {
          console.warn(`跳过无效时间的 WebDAV 文章: ${post.data.title || fileIndex.path}`);
          continue;
        }
        const existing = existingPostsMap.get(fileIndex.path);

        processedIds.add(fileIndex.path);

        if (!existing) {
          toInsert.push(newPost);
          console.log(`✅ 准备插入 WebDAV 文章: ${post.data.title || fileIndex.path}`);
        } else {
          // 强制更新，忽略修改时间检测
          toUpdate.push({
            id: fileIndex.path,
            data: {
              ...newPost,
              createdAt: existing.createdAt,
              updatedAt: Date.now(),
            },
          });
          console.log(`🔄 准备更新 WebDAV 文章: ${post.data.title || fileIndex.path}`);
        }

        // 添加小延迟以避免速率限制
        if (i < webdavPostsIndex.length - 1) {
          await delay(WEBDAV_REQUEST_DELAY);
        }
      } catch (error) {
        console.error(`❌ 处理文章 ${fileIndex.path} 失败:`, error);
        onProgress?.({
          stage: 'posts',
          message: `❌ 处理文章失败: ${fileIndex.path} - ${error.message}`,
          percentage: 25 + Math.round(((i + 1) / webdavPostsIndex.length) * 20),
        });
        // 继续处理其他文章
      }
    }

    // 批量插入新记录
    if (toInsert.length > 0) {
      onProgress?.({ stage: 'posts', message: `正在插入 ${toInsert.length} 条新文章记录...`, percentage: 45 });
      await db.insert(posts).values(toInsert);
      console.log(`✅ 插入了 ${toInsert.length} 条新文章记录`);
      onProgress?.({ stage: 'posts', message: `✅ 成功插入 ${toInsert.length} 条新文章记录`, percentage: 46 });
    }

    // 批量更新现有记录
    if (toUpdate.length > 0) {
      onProgress?.({ stage: 'posts', message: `正在更新 ${toUpdate.length} 条文章记录...`, percentage: 47 });
      for (const update of toUpdate) {
        await db.update(posts).set(update.data).where(eq(posts.id, update.id));
      }
      console.log(`✅ 更新了 ${toUpdate.length} 条文章记录`);
      onProgress?.({ stage: 'posts', message: `✅ 成功更新 ${toUpdate.length} 条文章记录`, percentage: 48 });
    }

    // 删除不再存在的记录（检查本地和 WebDAV 索引）
    const allValidIds = new Set([
      ...localContent.map((item) => item.id),
      ...webdavPostsIndex.map((fileIndex) => fileIndex.path),
    ]);

    const toDelete = existingPosts.filter((p) => !allValidIds.has(p.id));
    if (toDelete.length > 0) {
      onProgress?.({ stage: 'posts', message: `正在删除 ${toDelete.length} 条过期文章记录...`, percentage: 49 });
      for (const post of toDelete) {
        await db.delete(posts).where(eq(posts.id, post.id));
      }
      console.log(`✅ 删除了 ${toDelete.length} 条过期文章记录`);
      onProgress?.({ stage: 'posts', message: `✅ 成功删除 ${toDelete.length} 条过期文章记录`, percentage: 49.5 });
    }

    console.log('✅ 文章缓存强制刷新完成');
    onProgress?.({ stage: 'posts', message: '✅ 文章缓存强制刷新完成', percentage: 50 });
  } catch (error) {
    console.error('❌ 文章缓存强制刷新失败:', error);
  }
}

/**
 * 基于 ETag 的智能文章缓存刷新
 */
async function refreshPostsCache(onProgress?: (progress: ContentCacheProgress) => void): Promise<void> {
  console.log('🔄 开始刷新文章缓存...');
  onProgress?.({ stage: 'posts', message: '开始刷新文章缓存...' });

  try {
    // 获取 WebDAV 文件索引
    const { getWebDAVClient, isWebDAVEnabled } = await import('./webdav');
    let webdavPostsIndex: any[] = [];

    if (isWebDAVEnabled()) {
      const webdavClient = getWebDAVClient();
      webdavPostsIndex = await webdavClient.getPostsIndex();
      console.log(`📋 获取到 ${webdavPostsIndex.length} 个 WebDAV 文章索引`);
    }

    // 获取本地内容（从 content collections）
    const { loadPostsAndProjects } = await import('./content');
    const localContent = await loadPostsAndProjects();
    console.log(`📋 获取到 ${localContent.length} 个本地文章`);

    // 获取现有缓存记录
    const db = await getDB();
    const existingPosts = await db.select().from(posts);
    const existingPostsMap = new Map(existingPosts.map((p) => [p.id, p]));

    const toInsert: NewPost[] = [];
    const toUpdate: { id: string; data: Partial<NewPost> }[] = [];
    const processedIds = new Set<string>();

    // 处理本地文章（总是更新，因为没有 ETag）
    for (const item of localContent) {
      const newPost = contentItemToPost(item);
      if (!newPost) {
        console.warn(`跳过无效时间的本地文章: ${item.title || item.id}`);
        continue;
      }
      const existing = existingPostsMap.get(item.id);

      processedIds.add(item.id);

      if (!existing) {
        toInsert.push(newPost);
      } else if (existing.contentHash !== newPost.contentHash) {
        toUpdate.push({
          id: item.id,
          data: {
            ...newPost,
            createdAt: existing.createdAt,
            updatedAt: Date.now(),
          },
        });
      }
    }

    // 处理 WebDAV 文章（基于修改时间智能更新）
    const webdavPostsToUpdate = webdavPostsIndex.filter((fileIndex) => {
      const existing = existingPostsMap.get(fileIndex.path);
      if (!existing) {
        return true; // 新文件，需要更新
      }

      // 比较修改时间（将 ISO 字符串转换为时间戳进行比较）
      const fileLastMod = new Date(fileIndex.lastmod).getTime();
      const cachedLastMod = existing.lastModified;

      return fileLastMod > cachedLastMod; // 文件更新时间比缓存更新，需要更新
    });

    console.log(`🔄 需要更新 ${webdavPostsToUpdate.length} 篇 WebDAV 文章`);

    // 获取需要更新的 WebDAV 文章内容
    for (let i = 0; i < webdavPostsToUpdate.length; i++) {
      const fileIndex = webdavPostsToUpdate[i];
      try {
        if (isWebDAVEnabled()) {
          const webdavClient = getWebDAVClient();
          const post = await webdavClient.getPostByIndex(fileIndex);

          const contentItem: ContentItem = {
            id: post.id,
            slug: post.slug,
            type: post.collection === 'projects' ? 'project' : 'post',
            title: post.data.title || post.id,
            excerpt: post.data.excerpt || post.data.description || '',
            body: post.body,
            publishDate: new Date(post.data.publishDate || post.data.date || Date.now()),
            updateDate: post.data.updateDate ? new Date(post.data.updateDate) : undefined,
            draft: post.data.draft || false,
            public: post.data.public !== false,
            category: post.data.category ? { title: post.data.category, slug: post.data.category } : undefined,
            tags: post.data.tags ? post.data.tags.map((tag: string) => ({ title: tag, slug: tag })) : [],
            author: post.data.author || undefined,
            image: post.data.image || undefined,
            metadata: { ...post.data, lastmod: fileIndex.lastmod },
          };

          const newPost = contentItemToPost(contentItem);
          if (!newPost) {
            console.warn(`跳过无效时间的 WebDAV 文章: ${post.data.title || contentItem.id}`);
            continue;
          }
          const existing = existingPostsMap.get(contentItem.id);

          processedIds.add(contentItem.id);

          if (!existing) {
            toInsert.push(newPost);
          } else {
            toUpdate.push({
              id: contentItem.id,
              data: {
                ...newPost,
                createdAt: existing.createdAt,
                updatedAt: Date.now(),
              },
            });
          }

          // 添加延迟以避免速率限制
          if (i < webdavPostsToUpdate.length - 1) {
            await delay(WEBDAV_REQUEST_DELAY);
          }
        }
      } catch (error) {
        console.warn(`跳过 WebDAV 文章 ${fileIndex.path}:`, error.message);
      }
    }

    // 批量插入新记录
    if (toInsert.length > 0) {
      for (const post of toInsert) {
        try {
          await db.insert(posts).values(post);
        } catch (error) {
          if (error.message.includes('UNIQUE constraint failed')) {
            await db
              .update(posts)
              .set({
                ...post,
                updatedAt: Date.now(),
              })
              .where(eq(posts.id, post.id));
          } else {
            throw error;
          }
        }
      }
      console.log(`✅ 插入了 ${toInsert.length} 条新文章记录`);
    }

    // 批量更新记录
    for (const { id, data } of toUpdate) {
      await db.update(posts).set(data).where(eq(posts.id, id));
    }
    if (toUpdate.length > 0) {
      console.log(`✅ 更新了 ${toUpdate.length} 条文章记录`);
    }

    // 删除不再存在的记录（检查本地和 WebDAV 索引）
    const allValidIds = new Set([
      ...localContent.map((item: ContentItem) => item.id),
      ...webdavPostsIndex.map((fileIndex) => fileIndex.path),
    ]);

    const toDelete = existingPosts.filter((p) => !allValidIds.has(p.id));
    for (const post of toDelete) {
      await db.delete(posts).where(eq(posts.id, post.id));
    }
    if (toDelete.length > 0) {
      console.log(`✅ 删除了 ${toDelete.length} 条过期文章记录`);
    }

    console.log('✅ 文章缓存刷新完成');
  } catch (error) {
    console.error('❌ 文章缓存刷新失败:', error);
  }
}

/**
 * 强制刷新闪念缓存（忽略修改时间检测）
 */
async function forceRefreshMemosCache(onProgress?: (progress: ContentCacheProgress) => void): Promise<void> {
  console.log('🔄 开始强制刷新闪念缓存...');
  onProgress?.({ stage: 'memos', message: '开始强制刷新闪念缓存...' });

  try {
    // 获取数据库实例
    const db = await getDB();

    // 获取 WebDAV 闪念索引
    const { getWebDAVClient, isWebDAVEnabled } = await import('./webdav');
    let webdavMemosIndex: any[] = [];
    let webdavClient: any = null;

    if (isWebDAVEnabled()) {
      webdavClient = getWebDAVClient();
      webdavMemosIndex = await webdavClient.getMemosIndex();
      console.log(`📋 获取到 ${webdavMemosIndex.length} 个 WebDAV 闪念索引`);
    }

    // 获取现有缓存记录
    const existingMemos = await db.select().from(memos);
    const existingMemosMap = new Map(existingMemos.map((m) => [m.id, m]));

    const toInsert: NewMemo[] = [];
    const toUpdate: { id: string; data: Partial<NewMemo> }[] = [];
    const processedIds = new Set<string>();

    // 强制处理所有 WebDAV 闪念（忽略修改时间检测）
    console.log(`🔄 强制更新所有 ${webdavMemosIndex.length} 条 WebDAV 闪念`);
    onProgress?.({ stage: 'memos', message: `开始处理 ${webdavMemosIndex.length} 条 WebDAV 闪念...`, percentage: 50 });

    // 处理需要更新的闪念（带速率控制）
    for (let i = 0; i < webdavMemosIndex.length; i++) {
      const fileIndex = webdavMemosIndex[i];
      const progress = Math.round(((i + 1) / webdavMemosIndex.length) * 30); // 闪念处理占30%进度 (50-80%)
      onProgress?.({
        stage: 'memos',
        message: `处理闪念 (${i + 1}/${webdavMemosIndex.length}): ${fileIndex.path}`,
        percentage: 50 + progress,
      });

      try {
        const memo = await webdavClient.getMemoByIndex(fileIndex);
        console.log(`✅ 成功获取闪念: ${memo.data.title || fileIndex.path}`);

        // 转换为 ContentItem 格式，并添加 ETag 信息
        const contentItem: ContentItem = {
          id: memo.id,
          slug: memo.slug,
          type: 'memo',
          title: memo.data.title || memo.id,
          excerpt: '',
          body: memo.body,
          publishDate: memo.createdAt,
          updateDate: memo.updatedAt,
          draft: false,
          public: memo.data.public !== false,
          tags: memo.tags ? memo.tags.map((tag: string) => ({ title: tag, slug: tag })) : [],
          metadata: { ...memo.data, etag: fileIndex.etag }, // 将 ETag 添加到 metadata 中
        };

        const newMemo = contentItemToMemo(contentItem);
        if (!newMemo) {
          console.warn(`跳过无效时间的闪念: ${memo.data.title || fileIndex.path}`);
          continue;
        }
        const existing = existingMemosMap.get(fileIndex.path);

        processedIds.add(fileIndex.path);

        if (!existing) {
          toInsert.push(newMemo);
          console.log(`✅ 准备插入闪念: ${memo.data.title || fileIndex.path}`);
        } else {
          // 强制更新，忽略修改时间检测
          toUpdate.push({
            id: fileIndex.path,
            data: {
              ...newMemo,
              createdAt: existing.createdAt,
              updatedAt: Date.now(),
            },
          });
          console.log(`🔄 准备更新闪念: ${memo.data.title || fileIndex.path}`);
        }

        // 添加小延迟以避免速率限制
        if (i < webdavMemosIndex.length - 1) {
          await delay(WEBDAV_REQUEST_DELAY);
        }
      } catch (error) {
        console.error(`❌ 处理闪念 ${fileIndex.path} 失败:`, error);
        onProgress?.({
          stage: 'memos',
          message: `❌ 处理闪念失败: ${fileIndex.path} - ${error.message}`,
          percentage: 50 + Math.round(((i + 1) / webdavMemosIndex.length) * 30),
        });
        // 继续处理其他闪念
      }
    }

    // 批量插入新记录
    if (toInsert.length > 0) {
      onProgress?.({ stage: 'memos', message: `正在插入 ${toInsert.length} 条新闪念记录...`, percentage: 80 });
      await db.insert(memos).values(toInsert);
      console.log(`✅ 插入了 ${toInsert.length} 条新闪念记录`);
      onProgress?.({ stage: 'memos', message: `✅ 成功插入 ${toInsert.length} 条新闪念记录`, percentage: 85 });
    }

    // 批量更新现有记录
    if (toUpdate.length > 0) {
      onProgress?.({ stage: 'memos', message: `正在更新 ${toUpdate.length} 条闪念记录...`, percentage: 87 });
      for (const update of toUpdate) {
        await db.update(memos).set(update.data).where(eq(memos.id, update.id));
      }
      console.log(`✅ 更新了 ${toUpdate.length} 条闪念记录`);
      onProgress?.({ stage: 'memos', message: `✅ 成功更新 ${toUpdate.length} 条闪念记录`, percentage: 90 });
    }

    // 删除不再存在的记录（检查 WebDAV 索引）
    const allValidIds = new Set(webdavMemosIndex.map((fileIndex) => fileIndex.path));

    const toDelete = existingMemos.filter((m) => !allValidIds.has(m.id));
    if (toDelete.length > 0) {
      onProgress?.({ stage: 'memos', message: `正在删除 ${toDelete.length} 条过期闪念记录...`, percentage: 92 });
      for (const memo of toDelete) {
        await db.delete(memos).where(eq(memos.id, memo.id));
      }
      console.log(`✅ 删除了 ${toDelete.length} 条过期闪念记录`);
      onProgress?.({ stage: 'memos', message: `✅ 成功删除 ${toDelete.length} 条过期闪念记录`, percentage: 94 });
    }

    console.log('✅ 闪念缓存强制刷新完成');
    onProgress?.({ stage: 'memos', message: '✅ 闪念缓存强制刷新完成', percentage: 95 });
  } catch (error) {
    console.error('❌ 闪念缓存强制刷新失败:', error);
  }
}

/**
 * 基于 ETag 的智能闪念缓存刷新
 */
async function refreshMemosCache(onProgress?: (progress: ContentCacheProgress) => void): Promise<void> {
  console.log('🔄 开始刷新闪念缓存...');
  onProgress?.({ stage: 'memos', message: '开始刷新闪念缓存...' });

  try {
    // 获取数据库实例
    const db = await getDB();

    // 获取 WebDAV 闪念索引
    const { getWebDAVClient, isWebDAVEnabled } = await import('./webdav');
    let webdavMemosIndex: any[] = [];

    if (isWebDAVEnabled()) {
      const webdavClient = getWebDAVClient();
      webdavMemosIndex = await webdavClient.getMemosIndex();
      console.log(`📋 获取到 ${webdavMemosIndex.length} 个 WebDAV 闪念索引`);
    }

    // 获取现有缓存记录
    const existingMemos = await db.select().from(memos);
    const existingMemosMap = new Map(existingMemos.map((m) => [m.id, m]));

    const toInsert: NewMemo[] = [];
    const toUpdate: { id: string; data: Partial<NewMemo> }[] = [];
    const processedIds = new Set<string>();

    // 处理 WebDAV 闪念（基于修改时间智能更新）
    const webdavMemosToUpdate = webdavMemosIndex.filter((fileIndex) => {
      const existing = existingMemosMap.get(fileIndex.path);
      if (!existing) {
        return true; // 新文件，需要更新
      }

      // 比较修改时间（将 ISO 字符串转换为时间戳进行比较）
      const fileLastMod = new Date(fileIndex.lastmod).getTime();
      const cachedLastMod = existing.lastModified;

      return fileLastMod > cachedLastMod; // 文件更新时间比缓存更新，需要更新
    });

    console.log(`🔄 需要更新 ${webdavMemosToUpdate.length} 条 WebDAV 闪念`);

    // 获取需要更新的 WebDAV 闪念内容
    for (let i = 0; i < webdavMemosToUpdate.length; i++) {
      const fileIndex = webdavMemosToUpdate[i];
      try {
        if (isWebDAVEnabled()) {
          const webdavClient = getWebDAVClient();
          const memo = await webdavClient.getMemoByIndex(fileIndex);

          const contentItem: ContentItem = {
            id: memo.id,
            slug: memo.slug,
            type: 'memo',
            title: memo.data.title || memo.id,
            excerpt: '',
            body: memo.body,
            publishDate: memo.createdAt,
            updateDate: memo.updatedAt,
            draft: false,
            public: memo.data.public !== false,
            tags: memo.tags ? memo.tags.map((tag: string) => ({ title: tag, slug: tag })) : [],
            metadata: { ...memo.data, lastmod: fileIndex.lastmod },
          };

          const newMemo = contentItemToMemo(contentItem);
          if (!newMemo) {
            console.warn(`跳过无效时间的闪念: ${memo.data.title || contentItem.id}`);
            continue;
          }
          const existing = existingMemosMap.get(contentItem.id);

          processedIds.add(contentItem.id);

          if (!existing) {
            toInsert.push(newMemo);
          } else {
            toUpdate.push({
              id: contentItem.id,
              data: {
                ...newMemo,
                createdAt: existing.createdAt,
                updatedAt: Date.now(),
              },
            });
          }

          // 添加延迟以避免速率限制
          if (i < webdavMemosToUpdate.length - 1) {
            await delay(WEBDAV_REQUEST_DELAY);
          }
        }
      } catch (error) {
        console.warn(`跳过 WebDAV 闪念 ${fileIndex.path}:`, error.message);
      }
    }

    // 批量插入新记录
    if (toInsert.length > 0) {
      for (const memo of toInsert) {
        try {
          await db.insert(memos).values(memo);
        } catch (error) {
          if (error.message.includes('UNIQUE constraint failed')) {
            await db
              .update(memos)
              .set({
                ...memo,
                updatedAt: Date.now(),
              })
              .where(eq(memos.id, memo.id));
          } else {
            throw error;
          }
        }
      }
      console.log(`✅ 插入了 ${toInsert.length} 条新闪念记录`);
    }

    // 批量更新记录
    for (const { id, data } of toUpdate) {
      await db.update(memos).set(data).where(eq(memos.id, id));
    }
    if (toUpdate.length > 0) {
      console.log(`✅ 更新了 ${toUpdate.length} 条闪念记录`);
    }

    // 删除不再存在的记录（检查 WebDAV 索引）
    const allValidIds = new Set(webdavMemosIndex.map((fileIndex) => fileIndex.path));

    const toDelete = existingMemos.filter((m) => !allValidIds.has(m.id));
    for (const memo of toDelete) {
      await db.delete(memos).where(eq(memos.id, memo.id));
    }
    if (toDelete.length > 0) {
      console.log(`✅ 删除了 ${toDelete.length} 条过期闪念记录`);
    }

    console.log('✅ 闪念缓存刷新完成');
  } catch (error) {
    console.error('❌ 闪念缓存刷新失败:', error);
  }
}

/**
 * 刷新所有内容缓存
 * @param force 是否强制刷新（忽略 ETag 和修改时间检测）
 * @param onProgress 进度回调函数
 */
export async function refreshContentCache(
  force: boolean = false,
  onProgress?: (progress: ContentCacheProgress) => void
): Promise<void> {
  const logPrefix = force ? '🚀 开始强制刷新内容缓存...' : '🚀 开始刷新内容缓存...';
  console.log(logPrefix);
  onProgress?.({ stage: 'start', message: force ? '开始强制刷新内容缓存...' : '开始刷新内容缓存...', percentage: 0 });

  const startTime = Date.now();

  try {
    // 刷新文章缓存 (0-50%)
    onProgress?.({ stage: 'posts', message: '正在刷新文章缓存...', percentage: 5 });
    if (force) {
      await forceRefreshPostsCache(onProgress);
    } else {
      await refreshPostsCache(onProgress);
    }

    // 刷新闪念缓存 (50-95%)
    onProgress?.({ stage: 'memos', message: '正在刷新闪念缓存...', percentage: 50 });
    if (force) {
      await forceRefreshMemosCache(onProgress);
    } else {
      await refreshMemosCache(onProgress);
    }

    const duration = (Date.now() - startTime) / 1000;
    const successMessage = force
      ? `强制刷新内容缓存完成，耗时 ${duration.toFixed(2)}s`
      : `内容缓存刷新完成，耗时 ${duration.toFixed(2)}s`;

    console.log(`✅ ${successMessage}`);
    onProgress?.({ stage: 'done', message: successMessage, percentage: 100 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    const fullErrorMessage = `内容缓存刷新失败: ${errorMessage}`;
    console.error(`❌ ${fullErrorMessage}`);
    onProgress?.({ stage: 'error', message: fullErrorMessage });
    throw error;
  }
}

/**
 * 强制刷新所有内容缓存（忽略 ETag 和修改时间检测）
 * @deprecated 使用 refreshContentCache(true) 替代
 */
export async function forceRefreshContentCache(): Promise<void> {
  return refreshContentCache(true);
}

/**
 * 启动内容缓存管理器
 * 立即执行一次刷新，然后每 10 分钟刷新一次
 */
export async function startContentCacheManager(): Promise<void> {
  console.log('🎯 启动内容缓存管理器...');

  // 立即执行一次刷新
  await refreshContentCache();

  // 设置定时刷新
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(async () => {
    await refreshContentCache();
  }, CACHE_REFRESH_INTERVAL);

  console.log(`✅ 内容缓存管理器已启动，将每 ${CACHE_REFRESH_INTERVAL / 1000 / 60} 分钟刷新一次`);
}

/**
 * 停止内容缓存管理器
 */
export function stopContentCacheManager(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    console.log('🛑 内容缓存管理器已停止');
  }
}

/**
 * 从缓存中获取文章
 */
export async function getCachedPosts(): Promise<Post[]> {
  const db = await getDB();
  return await db.select().from(posts);
}

/**
 * 从缓存中获取闪念
 */
export async function getCachedMemos(): Promise<Memo[]> {
  const db = await getDB();
  return await db.select().from(memos);
}

/**
 * 从缓存中根据 slug 获取文章
 */
export async function getCachedPostBySlug(slug: string): Promise<Post | null> {
  const db = await getDB();
  const result = await db.select().from(posts).where(eq(posts.slug, slug)).limit(1);
  return result[0] || null;
}

/**
 * 从缓存中根据 slug 获取闪念
 */
export async function getCachedMemoBySlug(slug: string): Promise<Memo | null> {
  const db = await getDB();
  const result = await db.select().from(memos).where(eq(memos.slug, slug)).limit(1);
  return result[0] || null;
}
