import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getCachedMemos, getCachedPosts, refreshContentCache } from '~/lib/content-cache';
import { adminProcedure, createTRPCRouter, publicProcedure } from '../trpc';

export const contentCacheRouter = createTRPCRouter({
  // 获取缓存状态
  getStatus: publicProcedure.query(async () => {
    try {
      const [posts, memos] = await Promise.all([getCachedPosts(), getCachedMemos()]);

      return {
        posts: {
          count: posts.length,
          lastUpdated: posts.length > 0 ? Math.max(...posts.map((p) => p.updatedAt)) : null,
        },
        memos: {
          count: memos.length,
          lastUpdated: memos.length > 0 ? Math.max(...memos.map((m) => m.updatedAt)) : null,
        },
        totalItems: posts.length + memos.length,
      };
    } catch (error) {
      console.error('Error fetching cache status:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch cache status.',
      });
    }
  }),

  // 获取缓存的文章列表
  getPosts: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        type: z.enum(['post', 'project', 'all']).default('all'),
      })
    )
    .query(async ({ input }) => {
      try {
        const allPosts = await getCachedPosts();

        // 过滤类型
        const filteredPosts = input.type === 'all' ? allPosts : allPosts.filter((p) => p.type === input.type);

        // 按发布日期排序（最新的在前）
        const sortedPosts = filteredPosts.sort((a, b) => b.publishDate - a.publishDate);

        // 分页
        const paginatedPosts = sortedPosts.slice(input.offset, input.offset + input.limit);

        return {
          posts: paginatedPosts.map((post) => ({
            id: post.id,
            slug: post.slug,
            type: post.type,
            title: post.title,
            excerpt: post.excerpt,
            publishDate: new Date(post.publishDate),
            updateDate: post.updateDate ? new Date(post.updateDate) : null,
            draft: post.draft,
            public: post.public,
            category: post.category,
            tags: post.tags ? JSON.parse(post.tags) : [],
            author: post.author,
            image: post.image,
          })),
          total: filteredPosts.length,
          hasMore: input.offset + input.limit < filteredPosts.length,
        };
      } catch (error) {
        console.error('Error fetching cached posts:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch cached posts.',
        });
      }
    }),

  // 获取缓存的闪念列表
  getMemos: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const allMemos = await getCachedMemos();

        // 按发布日期排序（最新的在前）
        const sortedMemos = allMemos.sort((a, b) => b.publishDate - a.publishDate);

        // 分页
        const paginatedMemos = sortedMemos.slice(input.offset, input.offset + input.limit);

        return {
          memos: paginatedMemos.map((memo) => ({
            id: memo.id,
            slug: memo.slug,
            title: memo.title,
            publishDate: new Date(memo.publishDate),
            updateDate: memo.updateDate ? new Date(memo.updateDate) : null,
            public: memo.public,
            tags: memo.tags ? JSON.parse(memo.tags) : [],
            attachments: memo.attachments ? JSON.parse(memo.attachments) : [],
          })),
          total: allMemos.length,
          hasMore: input.offset + input.limit < allMemos.length,
        };
      } catch (error) {
        console.error('Error fetching cached memos:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch cached memos.',
        });
      }
    }),

  // 手动刷新缓存（仅管理员）
  refresh: adminProcedure.mutation(async () => {
    try {
      await refreshContentCache();
      return { success: true, message: '内容缓存刷新成功' };
    } catch (error) {
      console.error('Error refreshing content cache:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to refresh content cache.',
      });
    }
  }),
});
