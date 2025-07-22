import { APP_BLOG } from 'astrowind:config';
import type { PaginateFunction } from 'astro';
import { config } from '~/lib/config';
import { getCachedPosts, getCachedPostsPaginated, refreshContentCache } from '~/lib/content-cache';
import { getAllFileRecords } from '~/lib/db';
import type { Post, Taxonomy } from '~/types';
import { parseMarkdownToHTML } from '~/utils/markdown';
import { BLOG_BASE, CATEGORY_BASE, getPermalink, TAG_BASE } from './permalinks';

/** 刷新文章缓存 */
export const clearPostsCache = async (): Promise<void> => {
  await refreshContentCache();
};

/** 获取向量化状态映射 */
const getVectorizationStatusMap = async (): Promise<
  Record<string, { status: 'correct' | 'mismatch' | 'notvectorized'; errorMessage?: string }>
> => {
  try {
    const { modelName, dimension: modelDimension } = config.embedding;

    if (!modelName || !modelDimension) {
      return {};
    }

    // 确保数据库已初始化
    const { initializeDB } = await import('~/lib/db');
    await initializeDB();

    const records = await getAllFileRecords();
    const statusMap: Record<string, { status: 'correct' | 'mismatch' | 'notvectorized'; errorMessage?: string }> = {};

    records.forEach((record) => {
      const dimension = record.vector ? (record.vector as Buffer).length / 4 : 0;
      if (record.modelName === modelName && dimension === modelDimension) {
        statusMap[record.slug] = { status: 'correct' };
      } else if (record.vector) {
        statusMap[record.slug] = { status: 'mismatch' };
      } else {
        // 没有向量数据，可能是向量化失败
        statusMap[record.slug] = {
          status: 'notvectorized',
          errorMessage: record.errorMessage || undefined,
        };
      }
    });

    return statusMap;
  } catch (error) {
    console.error('Error fetching vectorization status:', error);
    return {};
  }
};

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

/** 获取所有文章 */
export const fetchPosts = async (isAdmin: boolean = false): Promise<Array<Post>> => {
  const [cachedPosts, vectorizationStatusMap] = await Promise.all([getCachedPosts(), getVectorizationStatusMap()]);

  const filteredPosts = cachedPosts
    .filter((post) => post.type === 'post' || post.type === 'project')
    .filter((post) => {
      // 管理员模式下显示所有文章
      if (isAdmin) return true;
      // 非管理员模式下只显示公开且非草稿的文章
      return !post.draft && post.public === true;
    })
    .filter((post) => post.title && post.title.trim() !== ''); // 过滤掉空标题的文章

  // 为每个文章生成渲染后的 HTML 内容
  const postsWithContent = await Promise.all(
    filteredPosts.map(async (post) => {
      const vectorizationStatus = vectorizationStatusMap[post.slug];

      // 渲染 markdown 为 HTML
      const content = await parseMarkdownToHTML(post.body, post.id);

      return {
        id: post.id,
        slug: post.slug,
        permalink: getPermalink(post.slug, post.type),
        title: post.title,
        excerpt: post.excerpt || undefined,
        body: post.body,
        content, // 添加渲染后的 HTML 内容
        publishDate: new Date(post.publishDate * 1000),
        updateDate: post.updateDate ? new Date(post.updateDate * 1000) : undefined,
        draft: post.draft,
        public: post.public,
        category: post.category ? { slug: post.category, title: post.category } : undefined,
        tags: post.tags ? JSON.parse(post.tags).map((tag: string) => ({ slug: tag, title: tag })) : [],
        author: post.author || undefined,
        image: post.image || undefined,
        metadata: post.metadata ? JSON.parse(post.metadata) : undefined,
        vectorizationStatus: vectorizationStatus?.status || 'notvectorized',
        vectorizationError: vectorizationStatus?.errorMessage,
      };
    })
  );

  return postsWithContent.sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf());
};

/** 分页获取文章 */
export const fetchPostsPaginated = async (options: {
  page?: number;
  limit?: number;
  isAdmin?: boolean;
  type?: 'post' | 'project' | 'all';
}): Promise<{
  posts: Array<Post>;
  total: number;
  totalPages: number;
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
}> => {
  const result = await getCachedPostsPaginated(options);
  const vectorizationStatusMap = await getVectorizationStatusMap();

  // 为每个文章添加向量化状态和处理内容
  const postsWithContent = await Promise.all(
    result.posts.map(async (post) => {
      const vectorizationStatus = vectorizationStatusMap[post.slug];

      // 解析 markdown 内容为 HTML
      let content = '';
      if (post.body) {
        try {
          content = await parseMarkdownToHTML(post.body);
        } catch (error) {
          console.warn(`Failed to parse markdown for post ${post.slug}:`, error);
          content = post.body; // 回退到原始内容
        }
      }

      // 解析 category、tags 和 metadata
      let category: Taxonomy | undefined = undefined;
      let tags: Taxonomy[] | undefined = undefined;
      let metadata: any = undefined;

      if (post.category) {
        try {
          const categoryData = typeof post.category === 'string' ? JSON.parse(post.category) : post.category;
          category = categoryData;
        } catch {
          // 如果解析失败，忽略 category
        }
      }

      if (post.tags) {
        try {
          const tagsData = typeof post.tags === 'string' ? JSON.parse(post.tags) : post.tags;
          if (Array.isArray(tagsData)) {
            // 确保每个 tag 都有正确的结构
            tags = tagsData.filter((tag) => tag && typeof tag === 'object' && tag.title && tag.slug);
          }
        } catch {
          // 如果解析失败，忽略 tags
        }
      }

      if (post.metadata) {
        try {
          metadata = typeof post.metadata === 'string' ? JSON.parse(post.metadata) : post.metadata;
        } catch {
          // 如果解析失败，忽略 metadata
        }
      }

      return {
        ...post,
        content,
        permalink: post.slug, // 使用 slug 作为 permalink
        publishDate: new Date(post.publishDate), // 转换为 Date 对象
        updateDate: post.updateDate ? new Date(post.updateDate) : undefined,
        excerpt: post.excerpt || undefined, // 转换 null 为 undefined
        author: post.author || undefined, // 转换 null 为 undefined
        category,
        tags,
        metadata,
        vectorizationStatus: vectorizationStatus?.status || 'notvectorized',
        vectorizationError: vectorizationStatus?.errorMessage,
      };
    })
  );

  return {
    ...result,
    posts: postsWithContent,
  };
};

/** */
export const findPostsBySlugs = async (slugs: Array<string>, isAdmin: boolean = false): Promise<Array<Post>> => {
  if (!Array.isArray(slugs)) return [];

  const posts = await fetchPosts(isAdmin);

  return slugs.reduce(function (r: Array<Post>, slug: string) {
    posts.some(function (post: Post) {
      return slug === post.slug && r.push(post);
    });
    return r;
  }, []);
};

/** */
export const getPostBySlug = async (slug: string, isAdmin: boolean = false): Promise<Post | undefined> => {
  const posts = await fetchPosts(isAdmin);
  return posts.find((post) => post.slug === slug);
};
/** */
export const findPostsByIds = async (ids: Array<string>, isAdmin: boolean = false): Promise<Array<Post>> => {
  if (!Array.isArray(ids)) return [];

  const posts = await fetchPosts(isAdmin);

  return ids.reduce(function (r: Array<Post>, id: string) {
    posts.some(function (post: Post) {
      return id === post.id && r.push(post);
    });
    return r;
  }, []);
};

/** */
export const findLatestPosts = async (
  { count }: { count?: number },
  isAdmin: boolean = false
): Promise<Array<Post>> => {
  const _count = count || 4;
  const posts = await fetchPosts(isAdmin);

  return posts ? posts.slice(0, _count) : [];
};

/** 获取所有项目 */
export const fetchProjects = async (isAdmin: boolean = false): Promise<Array<Post>> => {
  const [cachedPosts, vectorizationStatusMap] = await Promise.all([getCachedPosts(), getVectorizationStatusMap()]);

  return cachedPosts
    .filter((post) => post.type === 'project')
    .filter((post) => {
      // 管理员模式下显示所有项目
      if (isAdmin) return true;
      // 非管理员模式下只显示公开且非草稿的项目
      return !post.draft && post.public === true;
    })
    .filter((post) => post.title && post.title.trim() !== '') // 过滤掉空标题的文章
    .map((post) => {
      const vectorizationStatus = vectorizationStatusMap[post.slug];
      return {
        id: post.id,
        slug: post.slug,
        permalink: getPermalink(post.slug, 'project'),
        title: post.title,
        excerpt: post.excerpt || undefined,
        body: post.body,
        publishDate: new Date(post.publishDate * 1000),
        updateDate: post.updateDate ? new Date(post.updateDate * 1000) : undefined,
        draft: post.draft,
        public: post.public,
        category: post.category ? { slug: post.category, title: post.category } : undefined,
        tags: post.tags ? JSON.parse(post.tags).map((tag: string) => ({ slug: tag, title: tag })) : [],
        author: post.author || undefined,
        image: post.image || undefined,
        metadata: post.metadata ? JSON.parse(post.metadata) : undefined,
        vectorizationStatus: vectorizationStatus?.status || 'notvectorized',
        vectorizationError: vectorizationStatus?.errorMessage,
      };
    })
    .sort((a, b) => b.publishDate.valueOf() - a.publishDate.valueOf());
};

/** 获取精选项目（用于首页展示） */
export const findFeaturedProjects = async (
  { count }: { count?: number },
  isAdmin: boolean = false
): Promise<Array<Post>> => {
  const _count = count || 6;
  const projects = await fetchProjects(isAdmin);

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
