import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getWebDAVClient, isWebDAVEnabled } from '~/lib/webdav';
import { adminProcedure, createTRPCRouter, publicProcedure } from '../trpc';

// Memo 输入验证 schema
const CreateMemoSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  isPublic: z.boolean().optional().default(true),
});

const UpdateMemoSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  content: z.string().min(1, 'Content is required'),
});

const DeleteMemoSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

/**
 * Memos 相关的 tRPC 路由
 */
export const memosRouter = createTRPCRouter({
  /**
   * 获取所有 Memos（公开访问）
   */
  getAll: publicProcedure.query(async ({ ctx }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      const allMemos = await webdavClient.getAllMemos();

      // 如果不是管理员，只返回公开的 Memo
      const filteredMemos = ctx.isAdmin ? allMemos : allMemos.filter((memo) => memo.data.public !== false);

      return filteredMemos.map((memo) => ({
        id: memo.id,
        slug: memo.slug,
        title: memo.data.title || '无标题 Memo',
        content: memo.body,
        createdAt: memo.createdAt.toISOString(),
        updatedAt: memo.updatedAt.toISOString(),
        data: memo.data,
        isPublic: memo.data.public !== false, // 默认为 true
      }));
    } catch (error) {
      console.error('Failed to get memos:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get memos',
      });
    }
  }),

  /**
   * 创建新 Memo（仅管理员）
   */
  create: adminProcedure.input(CreateMemoSchema).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      const memo = await webdavClient.createMemo(input.content, input.isPublic);

      return {
        id: memo.id,
        slug: memo.slug,
        title: memo.data.title || '无标题 Memo',
        content: memo.body,
        createdAt: memo.createdAt.toISOString(),
        updatedAt: memo.updatedAt.toISOString(),
        data: memo.data,
      };
    } catch (error) {
      console.error('Failed to create memo:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create memo',
      });
    }
  }),

  /**
   * 更新 Memo（仅管理员）
   */
  update: adminProcedure.input(UpdateMemoSchema).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      const memo = await webdavClient.updateMemo(input.id, input.content);

      return {
        id: memo.id,
        slug: memo.slug,
        title: memo.data.title || '无标题 Memo',
        content: memo.body,
        createdAt: memo.createdAt.toISOString(),
        updatedAt: memo.updatedAt.toISOString(),
        data: memo.data,
      };
    } catch (error) {
      console.error('Failed to update memo:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update memo',
      });
    }
  }),

  /**
   * 删除 Memo（仅管理员）
   */
  delete: adminProcedure.input(DeleteMemoSchema).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();
      await webdavClient.deleteMemo(input.id);

      return { success: true };
    } catch (error) {
      console.error('Failed to delete memo:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete memo',
      });
    }
  }),
});
