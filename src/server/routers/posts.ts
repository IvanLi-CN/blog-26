import { TRPCError } from '@trpc/server';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { z } from 'zod';
import { processAndVectorizeAllContent } from '~/lib/vectorizer';
import { getWebDAVClient, isWebDAVEnabled } from '~/lib/webdav';
import { clearPostsCache } from '~/utils/blog';
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
  collection: z.enum(['posts', 'projects']).default('posts'),
  customPath: z.string().optional(),
});

const UpdatePostSchema = z.object({
  id: z.string().min(1, 'Post ID is required'),
  content: z.string(),
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
      const postsIndex = await webdavClient.getPostsIndex();
      const posts = await Promise.all(
        postsIndex.map(async (fileIndex) => {
          try {
            return await webdavClient.getPostByIndex(fileIndex);
          } catch (error) {
            console.warn(`Failed to process file ${fileIndex.path}:`, error);
            return null;
          }
        })
      );
      return posts.filter((post): post is NonNullable<typeof post> => post !== null);
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
      const postsIndex = await webdavClient.getPostsIndex();
      let post: any = null;

      // 查找匹配的文章
      for (const fileIndex of postsIndex) {
        try {
          const currentPost = await webdavClient.getPostByIndex(fileIndex);
          if (currentPost.id === input.id) {
            post = currentPost;
            break;
          }
        } catch (error) {
          console.warn(`Failed to process file ${fileIndex.path}:`, error);
        }
      }

      if (!post) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      const fullContent = getWebDAVClient().serializeMarkdownContent(post.data, post.body);
      return { ...post, fullContent };
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
      const post = await webdavClient.createPost(
        input.slug,
        input.frontmatter,
        input.body,
        input.collection,
        input.customPath
      );

      // 清除缓存以确保新文章能被立即获取
      clearPostsCache();

      // 触发向量化处理
      try {
        // 使用非阻塞方式触发向量化，不等待完成
        processAndVectorizeAllContent().catch((err) => {
          console.error('文章创建后向量化处理失败:', err);
        });
        console.log('已触发文章创建后的向量化处理');
      } catch (vectorizeError) {
        console.error('触发向量化处理失败:', vectorizeError);
        // 不阻止API返回，即使向量化触发失败
      }

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
      const postsIndex = await webdavClient.getPostsIndex();
      let existingPost: any = null;

      for (const fileIndex of postsIndex) {
        try {
          const currentPost = await webdavClient.getPostByIndex(fileIndex);
          if (currentPost.id === input.id) {
            existingPost = currentPost;
            break;
          }
        } catch (error) {
          console.warn(`Failed to process file ${fileIndex.path}:`, error);
        }
      }

      if (!existingPost) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      // 在服务器端解析和更新 frontmatter，同时保留原始格式
      const { data: frontmatter, content: body } = matter(input.content, {
        engines: {
          yaml: (s: string) => yaml.load(s, { schema: yaml.JSON_SCHEMA }) as object,
        },
      });

      // --- 自动更新字段 ---
      // 1. 从正文更新 title
      const titleMatch = body.match(/^#\s+(.*)/m);
      if (titleMatch && titleMatch[1]) {
        frontmatter.title = titleMatch[1];
      }

      // 2. 从正文更新 tags
      const tagMatches = body.match(/#([^\s#]+)/g);
      if (tagMatches) {
        const newTags = tagMatches.map((tag: string) => tag.substring(1));
        const existingTags = frontmatter.tags || [];
        frontmatter.tags = [...new Set([...existingTags, ...newTags])];
      }

      // 3. 更新 updateDate
      frontmatter.updateDate = new Date().toISOString();

      // --- 确保规范中要求的字段存在 (如果缺失) ---
      if (frontmatter.publishDate === undefined) {
        frontmatter.publishDate = new Date().toISOString();
      }
      if (frontmatter.draft === undefined) {
        frontmatter.draft = true;
      }
      if (frontmatter.public === undefined) {
        frontmatter.public = false;
      }
      if (frontmatter.slug === undefined) {
        frontmatter.slug = frontmatter.title?.toLowerCase().replace(/\s+/g, '-') || '';
      }

      // 更新文章
      const updatedPost = await webdavClient.updatePost(input.id, frontmatter, body);

      // 清除缓存以确保更新的文章能被立即获取
      clearPostsCache();

      // 触发向量化处理
      try {
        // 使用非阻塞方式触发向量化，不等待完成
        processAndVectorizeAllContent().catch((err) => {
          console.error('文章更新后向量化处理失败:', err);
        });
        console.log('已触发文章更新后的向量化处理');
      } catch (vectorizeError) {
        console.error('触发向量化处理失败:', vectorizeError);
        // 不阻止API返回，即使向量化触发失败
      }

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
      const postsIndex = await webdavClient.getPostsIndex();
      let existingPost: any = null;

      for (const fileIndex of postsIndex) {
        try {
          const currentPost = await webdavClient.getPostByIndex(fileIndex);
          if (currentPost.id === input.id) {
            existingPost = currentPost;
            break;
          }
        } catch (error) {
          console.warn(`Failed to process file ${fileIndex.path}:`, error);
        }
      }

      if (!existingPost) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        });
      }

      // 删除文章
      await webdavClient.deletePost(input.id);

      // 清除缓存以确保删除的文章不再被获取
      clearPostsCache();

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

  /**
   * 获取目录树（仅管理员）
   */
  getDirectoryTree: adminProcedure.query(async () => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      return await webdavClient.getDirectoryTree();
    } catch (error) {
      console.error('Failed to get directory tree:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get directory tree',
      });
    }
  }),

  /**
   * 创建目录（仅管理员）
   */
  createDirectory: adminProcedure.input(z.object({ path: z.string() })).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      await webdavClient.createDirectory(input.path);
      return { success: true };
    } catch (error) {
      console.error('Failed to create directory:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create directory',
      });
    }
  }),

  /**
   * 删除目录（仅管理员）
   */
  deleteDirectory: adminProcedure.input(z.object({ path: z.string() })).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      await webdavClient.deleteDirectory(input.path);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete directory:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete directory',
      });
    }
  }),

  /**
   * 重命名文件（仅管理员）
   */
  renameFile: adminProcedure
    .input(z.object({ oldPath: z.string(), newPath: z.string() }))
    .mutation(async ({ input }) => {
      if (!isWebDAVEnabled()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'WebDAV is not enabled',
        });
      }

      try {
        const webdavClient = getWebDAVClient();
        await webdavClient.renameFile(input.oldPath, input.newPath);

        // 清除缓存以确保重命名的文件能被正确获取
        clearPostsCache();

        return { success: true };
      } catch (error) {
        console.error('Failed to rename file:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to rename file',
        });
      }
    }),

  /**
   * 删除文件（仅管理员）
   */
  deleteFile: adminProcedure.input(z.object({ path: z.string() })).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      await webdavClient.deleteFile(input.path);

      // 清除缓存以确保删除的文件不再被获取
      clearPostsCache();

      // 触发向量化处理，清理已删除文件的向量索引
      try {
        // 使用非阻塞方式触发向量化，不等待完成
        processAndVectorizeAllContent().catch((err) => {
          console.error('文件删除后向量化处理失败:', err);
        });
        console.log('已触发文件删除后的向量化处理');
      } catch (vectorizeError) {
        console.error('触发向量化处理失败:', vectorizeError);
        // 不阻止API返回，即使向量化触发失败
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete file',
      });
    }
  }),

  /**
   * 创建新文件（仅管理员）
   */
  createFile: adminProcedure
    .input(
      z.object({
        path: z.string(),
        content: z.string().optional().default(''),
      })
    )
    .mutation(async ({ input }) => {
      if (!isWebDAVEnabled()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'WebDAV is not enabled',
        });
      }

      try {
        const webdavClient = getWebDAVClient();

        // 创建默认的Markdown文件内容
        const defaultContent =
          input.content ||
          `---
title: 新文章
description:
publishDate: ${new Date().toISOString().split('T')[0]}
draft: true
public: true
tags: []
category: ''
author: ''
image: ''
excerpt: ''
slug: ''
---

# 新文章

开始写作...
`;

        await webdavClient.putFile(input.path, defaultContent);

        // 清除缓存以确保新文件能被立即获取
        clearPostsCache();

        return { success: true };
      } catch (error) {
        console.error('Failed to create file:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create file',
        });
      }
    }),
});
