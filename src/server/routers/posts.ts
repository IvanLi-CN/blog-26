import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getWebDAVClient, isWebDAVEnabled } from '~/lib/webdav';
import { adminProcedure, createTRPCRouter } from '../trpc';

// 文章数据验证模式
const PostFrontmatterSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  publishDate: z.string().optional(),
  updateDate: z.string().optional(),
  draft: z.boolean().default(false),
  public: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),
  author: z.string().optional(),
  image: z.string().optional(),
  excerpt: z.string().optional(),
  slug: z.string().optional(),
});

const CreatePostSchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
  frontmatter: PostFrontmatterSchema,
  body: z.string(),
  collection: z.enum(['post', 'notes', 'local-notes', 'projects']).default('post'),
});

const UpdatePostSchema = z.object({
  id: z.string().min(1, 'Post ID is required'),
  frontmatter: PostFrontmatterSchema,
  body: z.string(),
});

const DeletePostSchema = z.object({
  id: z.string().min(1, 'Post ID is required'),
});

const GetPostSchema = z.object({
  id: z.string().min(1, 'Post ID is required'),
});

const GetPostBySlugSchema = z.object({
  slug: z.string().min(1, 'Slug is required'),
});

export const postsRouter = createTRPCRouter({
  /**
   * 获取所有文章（仅管理员）
   */
  getAll: adminProcedure.query(async () => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      const posts = await webdavClient.getAllPosts();
      return posts;
    } catch (error) {
      console.error('Failed to get posts:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch posts',
      });
    }
  }),

  /**
   * 根据 ID 获取单个文章（仅管理员）
   */
  getById: adminProcedure.input(GetPostSchema).query(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      const posts = await webdavClient.getAllPosts();
      const post = posts.find((p) => p.id === input.id);

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      return post;
    } catch (error) {
      console.error('Failed to get post:', error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch post',
      });
    }
  }),

  /**
   * 根据 slug 获取单个文章（仅管理员）
   */
  getBySlug: adminProcedure.input(GetPostBySlugSchema).query(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      const post = await webdavClient.getPostBySlug(input.slug);

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      return post;
    } catch (error) {
      console.error('Failed to get post by slug:', error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch post',
      });
    }
  }),

  /**
   * 创建新文章（仅管理员）
   */
  create: adminProcedure.input(CreatePostSchema).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();

      // 检查 slug 是否已存在
      const existingPost = await webdavClient.getPostBySlug(input.slug);
      if (existingPost) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A post with this slug already exists',
        });
      }

      // 创建文章
      const post = await webdavClient.createPost(input.slug, input.frontmatter, input.body, input.collection);

      return post;
    } catch (error) {
      console.error('Failed to create post:', error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create post',
      });
    }
  }),

  /**
   * 更新文章（仅管理员）
   */
  update: adminProcedure.input(UpdatePostSchema).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();

      // 检查文章是否存在
      const posts = await webdavClient.getAllPosts();
      const existingPost = posts.find((p) => p.id === input.id);
      if (!existingPost) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      // 更新文章
      const updatedPost = await webdavClient.updatePost(input.id, input.frontmatter, input.body);

      return updatedPost;
    } catch (error) {
      console.error('Failed to update post:', error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update post',
      });
    }
  }),

  /**
   * 删除文章（仅管理员）
   */
  delete: adminProcedure.input(DeletePostSchema).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();

      // 检查文章是否存在
      const posts = await webdavClient.getAllPosts();
      const existingPost = posts.find((p) => p.id === input.id);
      if (!existingPost) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      // 删除文章
      await webdavClient.deletePost(input.id);

      return { success: true };
    } catch (error) {
      console.error('Failed to delete post:', error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete post',
      });
    }
  }),
});
