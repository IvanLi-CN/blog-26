/**
 * @file src/lib/content.ts
 * @description This file provides a unified interface for fetching various content types
 * such as posts, projects, and memos from different data sources (local files, WebDAV).
 * It aims to centralize data fetching logic and provide a consistent data structure.
 */

import matter from 'gray-matter';
import { z } from 'zod';
import { getWebDAVClient, isWebDAVEnabled, type WebDAVMemo, type WebDAVPost } from '~/lib/webdav';
import { calculateReadingTime, parseMarkdownToHTML } from '~/utils/markdown';
import { cleanSlug, getPermalink } from '~/utils/permalinks';

export type ContentType = 'post' | 'project' | 'memo';

export interface Taxonomy {
  slug: string;
  title: string;
}

export interface ContentItem {
  permalink?: string;
  id: string;
  slug: string;
  type: ContentType;
  title: string;
  publishDate: Date;
  updateDate?: Date;
  draft?: boolean;
  public?: boolean;
  excerpt?: string;
  body: string;
  content?: any;
  readingTime?: number;
  category?: Taxonomy;
  tags?: Taxonomy[];
  author?: string;
  image?: string | { src: string; [key: string]: any };
  metadata?: any;
  raw?: any;
}

const FrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  publishDate: z.any().optional(),
  updateDate: z.any().optional(),
  date: z.any().optional(),
  draft: z.boolean().default(true), // 默认为非草稿
  public: z.boolean().default(true),
  excerpt: z.string().optional(),
  summary: z.string().optional(),
  image: z.any().optional(),
  images: z.array(z.any()).optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  author: z.string().optional(),
  metadata: z.any().optional(),
});

async function loadLocalContent(): Promise<ContentItem[]> {
  const files = import.meta.glob('/src/content/**/*.{md,mdx}', { query: '?raw', import: 'default' });
  const items: ContentItem[] = [];

  for (const path in files) {
    const rawContent = await files[path]();
    const { data: frontmatter, content: body } = matter(rawContent as string);

    const parsedFrontmatter = FrontmatterSchema.parse(frontmatter);

    const id = path;
    const slug = cleanSlug(
      parsedFrontmatter.slug ||
        path
          .split('/')
          .pop()
          ?.replace(/\.mdx?$/, '') ||
        ''
    );
    const type: ContentType = path.startsWith('/src/content/projects/') ? 'project' : 'post';

    const publishDate = parsedFrontmatter.publishDate ? new Date(parsedFrontmatter.publishDate) : new Date();
    const updateDate = parsedFrontmatter.updateDate
      ? new Date(parsedFrontmatter.updateDate)
      : parsedFrontmatter.date
        ? new Date(parsedFrontmatter.date)
        : undefined;
    const excerpt = parsedFrontmatter.excerpt ?? parsedFrontmatter.summary;

    items.push({
      id,
      slug,
      type,
      permalink: getPermalink(slug, type),
      title: parsedFrontmatter.title,
      publishDate,
      updateDate,
      draft: parsedFrontmatter.draft,
      public: parsedFrontmatter.public,
      excerpt,
      body,
      // `content` would be rendered by Astro on the page, not here.
      readingTime: calculateReadingTime(body),
      category: parsedFrontmatter.category
        ? { slug: cleanSlug(parsedFrontmatter.category), title: parsedFrontmatter.category }
        : undefined,
      tags: (parsedFrontmatter.tags || []).map((tag: string) => ({
        slug: cleanSlug(tag),
        title: tag,
      })),
      author: parsedFrontmatter.author,
      image: parsedFrontmatter.image,
      metadata: parsedFrontmatter.metadata,
      raw: { frontmatter, body },
    });
  }
  return items;
}

const normalizeWebDAVPost = async (post: WebDAVPost): Promise<ContentItem> => {
  const {
    publishDate: rawPublishDate,
    updateDate: rawUpdateDate,
    date,
    title,
    excerpt: rawExcerpt,
    summary,
    image,
    tags: rawTags = [],
    category: rawCategory,
    author,
    draft = true,
    public: isPublic = true,
    metadata,
  } = post.data;

  const slug = cleanSlug(post.slug);
  const publishDate = new Date(rawPublishDate ?? new Date());
  const updateDate = rawUpdateDate ? new Date(rawUpdateDate) : date ? new Date(date) : undefined;
  const excerpt = rawExcerpt ?? summary;

  const category = rawCategory ? { slug: cleanSlug(rawCategory), title: rawCategory } : undefined;
  const tags = rawTags.map((tag: string) => ({
    slug: cleanSlug(tag),
    title: tag,
  }));

  const parsedContent = await parseMarkdownToHTML(post.body, post.id);
  const readingTime = calculateReadingTime(post.body);
  const type: ContentType = post.collection === 'projects' ? 'project' : 'post';
  const permalink = getPermalink(slug, type);

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
    excerpt,
    body: post.body,
    content: parsedContent,
    readingTime,
    category,
    tags,
    author,
    image,
    metadata,
    raw: post,
  };
};

async function loadPostsAndProjects(): Promise<ContentItem[]> {
  let allContent: ContentItem[] = [];

  const localContent = await loadLocalContent();
  allContent.push(...localContent);

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

  // 确保所有内容都有有效的 ID，然后去重
  const validContent = allContent.filter((item) => item && item.id);
  const uniqueContent = Array.from(new Map(validContent.map((item) => [item.id, item])).values());

  return uniqueContent.sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf());
}

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

let _contentCache: ContentItem[] | undefined;
let _cacheTimestamp: number = 0;
const CACHE_DURATION = 1000 * 60 * 5;

export function clearContentCache(): void {
  _contentCache = undefined;
  _cacheTimestamp = 0;
}

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
