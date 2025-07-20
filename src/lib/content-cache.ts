/**
 * @file src/lib/content-cache.ts
 * @description 内容缓存管理器，负责将所有内容（markdown 纯文本）缓存到 SQLite 数据库中
 * 在项目启动时初始化，之后每 10 分钟刷新一次
 */

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { type ContentItem, fetchContent } from './content';
import { db } from './db';
import { type Memo, memos, type NewMemo, type NewPost, type Post, posts } from './schema';

// 缓存刷新间隔：10 分钟
const CACHE_REFRESH_INTERVAL = 10 * 60 * 1000;

// WebDAV 请求限制配置
const WEBDAV_REQUEST_DELAY = 100; // 每个请求之间的延迟（毫秒）

let refreshTimer: NodeJS.Timeout | null = null;

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
      const contentItem: ContentItem = {
        id: post.id,
        slug: post.slug,
        type: post.collection === 'projects' ? 'project' : 'post',
        title: post.data.title || '',
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
      const contentItem: ContentItem = {
        id: memo.id,
        slug: memo.slug,
        type: 'memo',
        title: memo.data.title || '',
        excerpt: '',
        body: memo.body,
        publishDate: memo.createdAt,
        updateDate: memo.updatedAt,
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
function contentItemToPost(item: ContentItem): NewPost {
  const now = Date.now();
  const contentHash = calculateContentHash(item.body);

  // 如果 metadata 中有 lastmod（来自 WebDAV），使用它；否则使用当前时间
  const lastModified = item.metadata?.lastmod ? new Date(item.metadata.lastmod).getTime() : now;

  return {
    id: item.id,
    slug: item.slug,
    type: item.type as 'post' | 'project',
    title: item.title || '',
    excerpt: item.excerpt || null,
    body: item.body,
    publishDate: item.publishDate.getTime(),
    updateDate: item.updateDate?.getTime() || null,
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

function contentItemToMemo(item: ContentItem): NewMemo {
  const now = Date.now();
  const contentHash = calculateContentHash(item.body);

  // 如果 metadata 中有 lastmod（来自 WebDAV），使用它；否则使用当前时间
  const lastModified = item.metadata?.lastmod ? new Date(item.metadata.lastmod).getTime() : now;

  return {
    id: item.id,
    slug: item.slug,
    title: item.title || null,
    body: item.body,
    publishDate: item.publishDate.getTime(),
    updateDate: item.updateDate?.getTime() || null,
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
 * 基于 ETag 的智能文章缓存刷新
 */
async function refreshPostsCache(): Promise<void> {
  console.log('🔄 开始刷新文章缓存...');

  try {
    // 获取 WebDAV 文件索引
    const { getWebDAVClient, isWebDAVEnabled } = await import('./webdav');
    let webdavPostsIndex: any[] = [];

    if (isWebDAVEnabled()) {
      const webdavClient = getWebDAVClient();
      webdavPostsIndex = await webdavClient.getPostsIndex();
      console.log(`📋 获取到 ${webdavPostsIndex.length} 个 WebDAV 文章索引`);
    }

    // 获取本地内容
    const localContent = await fetchContent(['post', 'project'], false);
    console.log(`📋 获取到 ${localContent.length} 个本地文章`);

    // 获取现有缓存记录
    const existingPosts = await db.select().from(posts);
    const existingPostsMap = new Map(existingPosts.map((p) => [p.id, p]));

    const toInsert: NewPost[] = [];
    const toUpdate: { id: string; data: Partial<NewPost> }[] = [];
    const processedIds = new Set<string>();

    // 处理本地文章（总是更新，因为没有 ETag）
    for (const item of localContent) {
      const newPost = contentItemToPost(item);
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
            title: post.data.title || '',
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
      ...localContent.map((item) => item.id),
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
 * 基于 ETag 的智能闪念缓存刷新
 */
async function refreshMemosCache(): Promise<void> {
  console.log('🔄 开始刷新闪念缓存...');

  try {
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
            title: memo.data.title || '',
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
 */
export async function refreshContentCache(): Promise<void> {
  console.log('🚀 开始刷新内容缓存...');
  const startTime = Date.now();

  await Promise.all([refreshPostsCache(), refreshMemosCache()]);

  const duration = Date.now() - startTime;
  console.log(`✅ 内容缓存刷新完成，耗时 ${duration}ms`);
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
  return await db.select().from(posts);
}

/**
 * 从缓存中获取闪念
 */
export async function getCachedMemos(): Promise<Memo[]> {
  return await db.select().from(memos);
}

/**
 * 从缓存中根据 slug 获取文章
 */
export async function getCachedPostBySlug(slug: string): Promise<Post | null> {
  const result = await db.select().from(posts).where(eq(posts.slug, slug)).limit(1);
  return result[0] || null;
}

/**
 * 从缓存中根据 slug 获取闪念
 */
export async function getCachedMemoBySlug(slug: string): Promise<Memo | null> {
  const result = await db.select().from(memos).where(eq(memos.slug, slug)).limit(1);
  return result[0] || null;
}
