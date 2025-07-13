import type { CollectionEntry } from 'astro:content';
import { getCollection } from 'astro:content';
import { APP_BLOG } from 'astrowind:config';
import type { PaginateFunction } from 'astro';
import { config } from '~/lib/config';
import { getWebDAVClient, isWebDAVEnabled, type WebDAVPost } from '~/lib/webdav';
import type { Post, Taxonomy } from '~/types';
import { calculateReadingTime, parseMarkdownToHTML } from './markdown';
import { BLOG_BASE, CATEGORY_BASE, cleanSlug, POST_PERMALINK_PATTERN, TAG_BASE, trimSlash } from './permalinks';

const generatePermalink = async ({
  id,
  slug,
  publishDate,
  category,
}: {
  id: string;
  slug: string;
  publishDate: Date;
  category: string | undefined;
}) => {
  const year = String(publishDate.getFullYear()).padStart(4, '0');
  const month = String(publishDate.getMonth() + 1).padStart(2, '0');
  const day = String(publishDate.getDate()).padStart(2, '0');
  const hour = String(publishDate.getHours()).padStart(2, '0');
  const minute = String(publishDate.getMinutes()).padStart(2, '0');
  const second = String(publishDate.getSeconds()).padStart(2, '0');

  const permalink = POST_PERMALINK_PATTERN.replace('%slug%', slug)
    .replace('%id%', id)
    .replace('%category%', category || '')
    .replace('%year%', year)
    .replace('%month%', month)
    .replace('%day%', day)
    .replace('%hour%', hour)
    .replace('%minute%', minute)
    .replace('%second%', second);

  return permalink
    .split('/')
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
};

export const getNormalizedPost = async (
  post: CollectionEntry<'post'> | CollectionEntry<'notes'> | CollectionEntry<'local-notes'>
): Promise<Post> => {
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
    images,
    tags: rawTags = [],
    category: rawCategory,
    author,
    draft,
    public: isPublic = true,
    metadata = {},
  } = data;

  const slug = cleanSlug(rawSlug); // cleanSlug(rawSlug.split('/').pop());
  const publishDate = new Date(rawPublishDate ?? date ?? new Date('2017-08-01'));
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

  return {
    id: id,
    slug: slug,
    permalink: await generatePermalink({ id, slug, publishDate, category: category?.slug }),

    publishDate: publishDate,
    updateDate: updateDate,

    title: title ?? id,
    excerpt: excerpt ?? summary,
    image: image ?? images?.[0],

    category: category,
    tags: tags,
    author: author,

    draft: draft,
    public: isPublic,

    metadata,

    Content: Content,
    body: body,
    // or 'content' in case you consume from API

    readingTime: remarkPluginFrontmatter?.readingTime,
  };
};

/**
 * 将 WebDAV 文章转换为标准化的 Post 对象
 */
export const getNormalizedWebDAVPost = async (post: WebDAVPost): Promise<Post> => {
  const {
    publishDate: rawPublishDate,
    updateDate: rawUpdateDate,
    date,
    title,
    excerpt,
    summary,
    image,
    images,
    tags: rawTags = [],
    category: rawCategory,
    author,
    draft = false,
    public: isPublic = true,
    metadata = {},
  } = post.data;

  const slug = cleanSlug(post.slug);
  const publishDate = new Date(rawPublishDate ?? date ?? new Date('2017-08-01'));
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

  // 解析 Markdown 内容为 HTML
  const parsedContent = await parseMarkdownToHTML(post.body);
  const readingTime = calculateReadingTime(post.body);

  return {
    id: post.id,
    slug: slug,
    permalink: await generatePermalink({ id: post.id, slug, publishDate, category: category?.slug }),

    publishDate: publishDate,
    updateDate: updateDate,

    title: title ?? post.id,
    excerpt: excerpt ?? summary,
    image: image ?? images?.[0],

    category: category,
    tags: tags,
    author: author,

    draft: draft,
    public: isPublic,

    metadata,

    Content: undefined, // WebDAV 内容没有预渲染的 Content 组件
    body: post.body, // 保留原始 Markdown 内容
    content: parsedContent, // 解析后的 HTML 内容

    readingTime: readingTime,
  };
};

const load = async function (): Promise<Array<Post>> {
  let allPosts: Post[] = [];

  // 始终从本地 Content Collections 获取数据
  try {
    const posts = await Promise.all([getCollection('post'), getCollection('notes'), getCollection('local-notes')]).then(
      ([posts, notes, localNotes]) => [...posts, ...notes, ...localNotes]
    );
    const normalizedPosts = await Promise.all(posts.map(async (post) => await getNormalizedPost(post)));
    allPosts.push(...normalizedPosts);
  } catch (error) {
    console.warn('Failed to load posts from Content Collections:', error);
  }

  // 如果启用了 WebDAV，从 WebDAV 获取额外的数据并合并
  if (isWebDAVEnabled()) {
    try {
      const webdavClient = getWebDAVClient();
      const webdavPosts = await webdavClient.getAllPosts();
      const normalizedWebDAVPosts = await Promise.all(
        webdavPosts.map(async (post) => await getNormalizedWebDAVPost(post))
      );
      allPosts.push(...normalizedWebDAVPosts);
    } catch (error) {
      console.warn('Failed to load posts from WebDAV:', error);
    }
  }

  const results = allPosts
    .sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf())
    .filter((post) => !post.draft || process.env.ADMIN_MODE === 'true');

  return results;
};

let _posts: Array<Post>;

/** */
export const isBlogEnabled = APP_BLOG.isEnabled;
export const isRelatedPostsEnabled = APP_BLOG.isRelatedPostsEnabled;
export const isBlogListRouteEnabled = APP_BLOG.list.isEnabled;
export const isBlogPostRouteEnabled = APP_BLOG.post.isEnabled;
export const isBlogCategoryRouteEnabled = APP_BLOG.category.isEnabled;
export const isBlogTagRouteEnabled = APP_BLOG.tag.isEnabled;

export const blogListRobots = APP_BLOG.list.robots;
export const blogPostRobots = APP_BLOG.post.robots;
export const blogCategoryRobots = APP_BLOG.category.robots;
export const blogTagRobots = APP_BLOG.tag.robots;

export const blogPostsPerPage = APP_BLOG?.postsPerPage;

/** */
export const fetchPosts = async (): Promise<Array<Post>> => {
  if (!_posts) {
    _posts = await load();
  }

  return _posts;
};

/** */
export const findPostsBySlugs = async (slugs: Array<string>): Promise<Array<Post>> => {
  if (!Array.isArray(slugs)) return [];

  const posts = await fetchPosts();

  return slugs.reduce(function (r: Array<Post>, slug: string) {
    posts.some(function (post: Post) {
      return slug === post.slug && r.push(post);
    });
    return r;
  }, []);
};

/** */
export const getPostBySlug = async (slug: string): Promise<Post | undefined> => {
  const posts = await fetchPosts();
  return posts.find((post) => post.slug === slug);
};
/** */
export const findPostsByIds = async (ids: Array<string>): Promise<Array<Post>> => {
  if (!Array.isArray(ids)) return [];

  const posts = await fetchPosts();

  return ids.reduce(function (r: Array<Post>, id: string) {
    posts.some(function (post: Post) {
      return id === post.id && r.push(post);
    });
    return r;
  }, []);
};

/** */
export const findLatestPosts = async ({ count }: { count?: number }): Promise<Array<Post>> => {
  const _count = count || 4;
  const posts = await fetchPosts();

  return posts ? posts.slice(0, _count) : [];
};

/** 获取所有项目 */
export const fetchProjects = async (): Promise<Array<Post>> => {
  const posts = await fetchPosts();
  const webdavConfig = config.webdav;
  const projectsPath = webdavConfig.projectsPath || '/projects';

  return posts.filter(
    (post) =>
      post.id.startsWith('Project/') || // 支持本地 Content Collections 中的项目
      post.id.startsWith(projectsPath + '/') || // 支持 WebDAV 中配置的项目目录
      post.id.includes(projectsPath + '/') // 支持嵌套的项目目录
  );
};

/** 获取精选项目（用于首页展示） */
export const findFeaturedProjects = async ({ count }: { count?: number }): Promise<Array<Post>> => {
  const _count = count || 6;
  const projects = await fetchProjects();

  return projects ? projects.slice(0, _count) : [];
};

/**
 * @deprecated 这些静态路径生成函数现在不再使用，因为已转换为 SSR
 * 保留用于向后兼容性
 */
export const getStaticPathsBlogList = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isBlogEnabled || !isBlogListRouteEnabled) return [];
  return paginate(await fetchPosts(), {
    params: { blog: BLOG_BASE || undefined },
    pageSize: blogPostsPerPage,
  });
};

/**
 * @deprecated 这些静态路径生成函数现在不再使用，因为已转换为 SSR
 * 保留用于向后兼容性
 */
export const getStaticPathsBlogPost = async () => {
  if (!isBlogEnabled || !isBlogPostRouteEnabled) return [];
  return (await fetchPosts()).flatMap((post) => ({
    params: {
      blog: post.permalink,
    },
    props: { post },
  }));
};

/**
 * @deprecated 这些静态路径生成函数现在不再使用，因为已转换为 SSR
 * 保留用于向后兼容性
 */
export const getStaticPathsBlogCategory = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isBlogEnabled || !isBlogCategoryRouteEnabled) return [];

  const posts = await fetchPosts();
  const categories = {};
  posts.map((post) => {
    if (post.category?.slug) {
      categories[post.category?.slug] = post.category;
    }
  });

  return Array.from(Object.keys(categories)).flatMap((categorySlug) =>
    paginate(
      posts.filter((post) => post.category?.slug && categorySlug === post.category?.slug),
      {
        params: { category: categorySlug, blog: CATEGORY_BASE || undefined },
        pageSize: blogPostsPerPage,
        props: { category: categories[categorySlug] },
      }
    )
  );
};

export const getAllTags = async () => {
  const posts = await fetchPosts();
  const tags = new Map<string, Taxonomy & { posts: Array<Post> }>();
  posts.map((post) => {
    if (Array.isArray(post.tags)) {
      for (const tag of post.tags) {
        if (!tags.has(tag.slug)) {
          tags.set(tag.slug, {
            ...tag,
            posts: [post],
          });
        } else {
          tags.get(tag.slug)!.posts.push(post);
        }
      }
    }
  });
  return Array.from(tags.values());
};

/**
 * @deprecated 这些静态路径生成函数现在不再使用，因为已转换为 SSR
 * 保留用于向后兼容性
 */
export const getStaticPathsBlogTag = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isBlogEnabled || !isBlogTagRouteEnabled) return [];

  const tags = await getAllTags();

  return tags.flatMap((tag) =>
    paginate(tag.posts || [], {
      params: { tag: tag.slug, blog: TAG_BASE || undefined },
      pageSize: blogPostsPerPage,
      props: { tag },
    })
  );
};

/** */
export async function getRelatedPosts(originalPost: Post, maxResults: number = 4): Promise<Post[]> {
  const allPosts = await fetchPosts();
  const originalTagsSet = new Set(originalPost.tags ? originalPost.tags.map((tag) => tag.slug) : []);

  const postsWithScores = allPosts.reduce((acc: { post: Post; score: number }[], iteratedPost: Post) => {
    if (iteratedPost.slug === originalPost.slug) return acc;

    let score = 0;
    if (iteratedPost.category && originalPost.category && iteratedPost.category.slug === originalPost.category.slug) {
      score += 5;
    }

    if (iteratedPost.tags) {
      iteratedPost.tags.forEach((tag) => {
        if (originalTagsSet.has(tag.slug)) {
          score += 1;
        }
      });
    }

    acc.push({ post: iteratedPost, score });
    return acc;
  }, []);

  postsWithScores.sort((a, b) => b.score - a.score);

  const selectedPosts: Post[] = [];
  let i = 0;
  while (selectedPosts.length < maxResults && i < postsWithScores.length) {
    selectedPosts.push(postsWithScores[i].post);
    i++;
  }

  return selectedPosts;
}
