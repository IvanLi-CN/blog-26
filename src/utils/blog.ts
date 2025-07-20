import { APP_BLOG } from 'astrowind:config';
import type { PaginateFunction } from 'astro';
import { getCachedPosts, refreshContentCache } from '~/lib/content-cache';
import type { Post, Taxonomy } from '~/types';
import { BLOG_BASE, CATEGORY_BASE, getPermalink, TAG_BASE } from './permalinks';

/** 刷新文章缓存 */
export const clearPostsCache = async (): Promise<void> => {
  await refreshContentCache();
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
export const fetchPosts = async (): Promise<Array<Post>> => {
  const cachedPosts = await getCachedPosts();
  return cachedPosts
    .filter((post) => post.type === 'post' || post.type === 'project')
    .filter((post) => !post.draft || process.env.ADMIN_MODE === 'true')
    .map((post) => ({
      id: post.id,
      slug: post.slug,
      permalink: getPermalink(post.slug, post.type),
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
    })) as Post[];
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
  const cachedPosts = await getCachedPosts();
  return cachedPosts
    .filter((post) => post.type === 'project')
    .filter((post) => !post.draft || process.env.ADMIN_MODE === 'true')
    .map((post) => ({
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
    })) as Post[];
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
