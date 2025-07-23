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

    // 改进本地文件的时间解析逻辑 - 按优先级尝试不同的时间字段
    let publishDate: Date | null = null;

    // 优先级：publishDate > date > updateDate
    const timeFields = [parsedFrontmatter.publishDate, parsedFrontmatter.date, parsedFrontmatter.updateDate];

    for (const timeField of timeFields) {
      if (timeField) {
        const testDate = new Date(timeField);
        if (!isNaN(testDate.getTime())) {
          publishDate = testDate;
          break;
        }
      }
    }

    if (!publishDate) {
      console.warn(`No valid time field found for local post ${path}, skipping this file`);
      continue; // 跳过没有有效时间的文件
    }

    let updateDate: Date | undefined;
    if (parsedFrontmatter.updateDate) {
      updateDate = new Date(parsedFrontmatter.updateDate);
      if (isNaN(updateDate.getTime())) {
        console.warn(`Invalid updateDate for local post ${path}:`, parsedFrontmatter.updateDate);
        updateDate = undefined;
      }
    } else if (parsedFrontmatter.date) {
      updateDate = new Date(parsedFrontmatter.date);
      if (isNaN(updateDate.getTime())) {
        console.warn(`Invalid date for local post ${path}:`, parsedFrontmatter.date);
        updateDate = undefined;
      }
    }
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

const normalizeWebDAVPost = async (post: WebDAVPost, fileLastMod?: string): Promise<ContentItem | null> => {
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
    draft = true, // 默认为草稿
    public: isPublic = false, // 默认为私有
    metadata,
  } = post.data;

  const slug = cleanSlug(post.slug);

  // 改进时间解析逻辑 - 按优先级尝试不同的时间字段
  let publishDate: Date | null = null;

  // 优先级：publishDate > date > updateDate
  const timeFields = [rawPublishDate, date, rawUpdateDate];

  for (const timeField of timeFields) {
    if (timeField) {
      const testDate = new Date(timeField);
      if (!isNaN(testDate.getTime())) {
        publishDate = testDate;
        break;
      }
    }
  }

  // 如果没有找到有效时间，使用文件修改时间作为备选
  if (!publishDate && fileLastMod) {
    publishDate = new Date(fileLastMod);
    console.warn(
      `No valid time field found for WebDAV post ${post.slug}, using file modification time: ${fileLastMod}`
    );
  }

  if (!publishDate) {
    console.warn(`No valid time field found for WebDAV post ${post.slug}, skipping this file`);
    return null; // 返回 null 表示跳过这个文件
  }

  let updateDate: Date | undefined;
  if (rawUpdateDate) {
    updateDate = new Date(rawUpdateDate);
    if (isNaN(updateDate.getTime())) {
      console.warn(`Invalid updateDate for post ${post.slug}:`, rawUpdateDate);
      updateDate = undefined;
    }
  } else if (date) {
    updateDate = new Date(date);
    if (isNaN(updateDate.getTime())) {
      console.warn(`Invalid date for post ${post.slug}:`, date);
      updateDate = undefined;
    }
  }
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

export async function loadPostsAndProjects(): Promise<ContentItem[]> {
  let allContent: ContentItem[] = [];

  const localContent = await loadLocalContent();
  allContent.push(...localContent);

  if (isWebDAVEnabled()) {
    try {
      const webdavClient = getWebDAVClient();
      const postsIndex = await webdavClient.getPostsIndex();
      const webdavPostsWithIndex = await Promise.all(
        postsIndex.map(async (fileIndex) => {
          try {
            const post = await webdavClient.getPostByIndex(fileIndex);
            return { post, fileIndex };
          } catch (error) {
            console.warn(`Failed to process file ${fileIndex.path}:`, error);
            return null;
          }
        })
      );
      const validPostsWithIndex = webdavPostsWithIndex.filter(
        (item): item is NonNullable<typeof item> => item !== null
      );
      const normalizedItems = await Promise.all(
        validPostsWithIndex.map(({ post, fileIndex }) => normalizeWebDAVPost(post, fileIndex.lastmod))
      );
      const validNormalizedItems = normalizedItems.filter((item): item is ContentItem => item !== null);
      allContent.push(...validNormalizedItems);
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
    title: memo.data.title || memo.id,
    publishDate: memo.createdAt,
    updateDate: memo.updatedAt,
    public: memo.data.public === true, // 默认为私有，需要明确设置为 true 才公开
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
    const memosIndex = await webdavClient.getMemosIndex();
    const memos = await Promise.all(
      memosIndex.map(async (fileIndex) => {
        try {
          return await webdavClient.getMemoByIndex(fileIndex);
        } catch (error) {
          console.warn(`Failed to process memo file ${fileIndex.path}:`, error);
          return null;
        }
      })
    );
    const validMemos = memos.filter((memo): memo is NonNullable<typeof memo> => memo !== null);
    return validMemos.map(normalizeWebDAVMemo);
  } catch (error) {
    console.warn('Failed to load memos from WebDAV:', error);
    return [];
  }
}

/**
 * 直接获取内容，不使用缓存
 * @deprecated 建议使用数据库缓存系统 (getCachedPosts, getCachedMemos)
 * 仅用于向量化等需要实时数据的场景
 */
export async function fetchContent(types: (ContentType | 'all')[] = ['all']): Promise<ContentItem[]> {
  console.warn('fetchContent() is deprecated, consider using database cache (getCachedPosts, getCachedMemos)');

  const [postsAndProjects, memos] = await Promise.all([loadPostsAndProjects(), loadMemos()]);
  const allContent = [...postsAndProjects, ...memos].sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf());

  if (types.includes('all')) {
    return allContent;
  }

  return allContent.filter((item) => types.includes(item.type));
}
