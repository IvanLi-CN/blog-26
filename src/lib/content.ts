/**
 * @file src/lib/content.ts
 * @description This file provides a unified interface for fetching various content types
 * such as posts, projects, and memos from different data sources (local files, WebDAV).
 * It aims to centralize data fetching logic and provide a consistent data structure.
 */

import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';

import { getWebDAVClient, isWebDAVEnabled, type WebDAVMemo, type WebDAVPost } from '~/lib/webdav';
import { calculateReadingTime, parseMarkdownToHTML } from '~/utils/markdown';
import { cleanSlug, getPermalink } from '~/utils/permalinks';

// 1. 定义内容类型和统一的数据结构
// =================================================================================================

/**
 * 定义支持的内容类型
 */
export type ContentType = 'post' | 'project' | 'memo';

/**
 * 定义分类和标签的通用结构
 */
export interface Taxonomy {
  slug: string;
  title: string;
}

/**
 * 统一的内容项接口
 * 所有来源（本地文件、WebDAV）的内容都将被规范化为此格式
 */
export interface ContentItem {
  permalink?: string; // 永久链接
  id: string; // 唯一标识符（例如，文件路径）
  slug: string; // URL友好的 slug
  type: ContentType; // 内容类型

  // 核心元数据
  title: string;
  publishDate: Date;
  updateDate?: Date;
  draft?: boolean;
  public?: boolean;

  // 内容
  excerpt?: string; // 摘要
  body: string; // 原始 Markdown 内容
  content?: any; // 渲染后的 HTML 内容或 Astro 组件
  readingTime?: number; // 阅读时间（分钟）

  // 关联数据
  category?: Taxonomy;
  tags?: Taxonomy[];
  author?: string;
  image?: string | { src: string; [key: string]: any }; // 图像可以是字符串或对象

  // 原始数据
  raw?: any; // 用于存储特定于源的原始数据
}

// 后续将在此处添加获取逻辑

// 2. 内容规范化函数
// =================================================================================================

/**
 * 将 Astro 本地内容集合的条目规范化为 ContentItem
 */
const normalizeLocalPost = async (
  post: CollectionEntry<'post'> | CollectionEntry<'notes'> | CollectionEntry<'local-notes'>
): Promise<ContentItem> => {
  const { id, slug: rawSlug = '', data, body } = post;
  const { Content, remarkPluginFrontmatter } = await post.render();

  const {
    publishDate: rawPublishDate,
    updateDate: rawUpdateDate,
    date,
    title,
    excerpt,
    summary,
    image,
    tags: rawTags = [],
    category: rawCategory,
    author,
    draft = false,
    public: isPublic = true,
  } = data;

  const slug = cleanSlug(rawSlug);
  const publishDate = new Date(rawPublishDate ?? date ?? new Date());
  const updateDate = rawUpdateDate ? new Date(rawUpdateDate) : undefined;

  const category = rawCategory
    ? {
        slug: cleanSlug(rawCategory),
        title: rawCategory,
      }
    : undefined;

  const tags = rawTags.map((tag: string) => ({
    slug: cleanSlug(tag),
    title: tag,
  }));

  // 判断类型
  const type: ContentType = id.startsWith('Project/') ? 'project' : 'post';

  const permalink = getPermalink(slug, 'post');

  return {
    id,
    slug,
    type,
    permalink,
    title: title ?? id,
    publishDate,
    updateDate,
    draft,
    public: isPublic,
    excerpt: excerpt ?? summary,
    body,
    content: Content,
    readingTime: remarkPluginFrontmatter?.readingTime,
    category,
    tags,
    author,
    image,
    raw: post,
  };
};

/**
 * 将 WebDAV 文章规范化为 ContentItem
 */
const normalizeWebDAVPost = async (post: WebDAVPost): Promise<ContentItem> => {
  const {
    publishDate: rawPublishDate,
    updateDate: rawUpdateDate,
    date,
    title,
    excerpt,
    summary,
    image,
    tags: rawTags = [],
    category: rawCategory,
    author,
    draft = false,
    public: isPublic = true,
  } = post.data;

  const slug = cleanSlug(post.slug);
  const publishDate = new Date(rawPublishDate ?? date ?? new Date());
  const updateDate = rawUpdateDate ? new Date(rawUpdateDate) : undefined;

  const category = rawCategory
    ? {
        slug: cleanSlug(rawCategory),
        title: rawCategory,
      }
    : undefined;

  const tags = rawTags.map((tag: string) => ({
    slug: cleanSlug(tag),
    title: tag,
  }));

  const parsedContent = await parseMarkdownToHTML(post.body, post.id);
  const readingTime = calculateReadingTime(post.body);

  // 判断类型
  const projectsPath = getWebDAVClient().projectsPath;
  const type: ContentType =
    post.id.startsWith('Project/') || post.id.startsWith(projectsPath + '/') || post.id.includes(projectsPath + '/')
      ? 'project'
      : 'post';

  const permalink = getPermalink(slug, 'post');

  return {
    id: post.id,
    slug,
    type,
    permalink,
    title: title ?? post.id,
    publishDate,
    updateDate,
    draft,
    public: isPublic,
    excerpt: excerpt ?? summary,
    body: post.body,
    content: parsedContent,
    readingTime,
    category,
    tags,
    author,
    image,
    raw: post,
  };
};

// 3. 数据加载器
// =================================================================================================

/**
 * 从所有来源（本地+WebDAV）加载文章和项目
 */
async function loadPostsAndProjects(): Promise<ContentItem[]> {
  let allContent: ContentItem[] = [];

  // 从本地 Content Collections 加载
  try {
    const collections = await Promise.all([
      getCollection('post'),
      getCollection('notes'),
      getCollection('local-notes'),
    ]).then((collections) => collections.flat());

    const normalizedItems = await Promise.all(collections.map(normalizeLocalPost));
    allContent.push(...normalizedItems);
  } catch (error) {
    console.warn('Failed to load content from local collections:', error);
  }

  // 如果启用了 WebDAV，从 WebDAV 加载
  if (isWebDAVEnabled()) {
    try {
      const webdavClient = getWebDAVClient();
      const webdavPosts = await webdavClient.getAllPosts();
      const normalizedItems = await Promise.all(webdavPosts.map(normalizeWebDAVPost));
      allContent.push(...normalizedItems);
    } catch (error) {
      console.warn('Failed to load content from WebDAV:', error);
    }
  }

  // 去重和排序
  const uniqueContent = Array.from(new Map(allContent.map((item) => [item.id, item])).values());
  return uniqueContent.sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf());
}

/**
 * 将 WebDAV Memo 规范化为 ContentItem
 */
const normalizeWebDAVMemo = (memo: WebDAVMemo): ContentItem => {
  return {
    id: memo.id,
    slug: memo.slug,
    type: 'memo',
    title: memo.data.title || '无标题 Memo',
    publishDate: memo.createdAt,
    updateDate: memo.updatedAt,
    public: memo.data.public !== false,
    body: memo.body,
    tags: memo.tags?.map((tag) => ({ slug: cleanSlug(tag), title: tag })) || [],
    raw: memo,
  };
};

/**
 * 从 WebDAV 加载闪念
 */
async function loadMemos(): Promise<ContentItem[]> {
  if (!isWebDAVEnabled()) {
    return [];
  }

  try {
    const webdavClient = getWebDAVClient();
    const memos = await webdavClient.getAllMemos();
    return memos.map(normalizeWebDAVMemo);
  } catch (error) {
    console.warn('Failed to load memos from WebDAV:', error);
    return [];
  }
}

// 4. 核心获取函数和缓存
// =================================================================================================

let _contentCache: ContentItem[] | undefined;
let _cacheTimestamp: number = 0;
const CACHE_DURATION = 1000 * 60 * 5; // 5 分钟缓存

/**
 * 清除内容缓存
 */
export function clearContentCache(): void {
  _contentCache = undefined;
  _cacheTimestamp = 0;
}

/**
 * 统一的内容获取函数
 * @param types 要获取的内容类型数组
 * @param forceRefresh 是否强制刷新缓存
 * @returns 内容项数组
 */
export async function fetchContent(
  types: (ContentType | 'all')[] = ['all'],
  forceRefresh: boolean = false
): Promise<ContentItem[]> {
  const now = Date.now();
  const isCacheExpired = now - _cacheTimestamp > CACHE_DURATION;

  if (forceRefresh || !_contentCache || isCacheExpired) {
    const [postsAndProjects, memos] = await Promise.all([loadPostsAndProjects(), loadMemos()]);
    _contentCache = [...postsAndProjects, ...memos].sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf());
    _cacheTimestamp = now;
  }

  if (types.includes('all')) {
    return _contentCache;
  }

  return _contentCache.filter((item) => types.includes(item.type));
}
