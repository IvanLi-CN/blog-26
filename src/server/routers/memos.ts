import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { fetchContent } from '~/lib/content';
import { getWebDAVClient, isWebDAVEnabled } from '~/lib/webdav';
import { adminProcedure, createTRPCRouter, publicProcedure } from '../trpc';

// Memo 输入验证 schema
const CreateMemoSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  isPublic: z.boolean().optional().default(true),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        path: z.string(),
        contentType: z.string().optional(),
        size: z.number().optional(),
        isImage: z.boolean(),
      })
    )
    .optional()
    .default([]),
});

const UpdateMemoSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  content: z.string().min(1, 'Content is required'),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        path: z.string(),
        contentType: z.string().optional(),
        size: z.number().optional(),
        isImage: z.boolean(),
      })
    )
    .optional()
    .default([]),
});

const DeleteMemoSchema = z.object({
  id: z.string().min(1, 'ID is required'),
});

const UploadAttachmentSchema = z.object({
  memoId: z.string().min(1, 'Memo ID is required'),
  filename: z.string().min(1, 'Filename is required'),
  content: z.string().min(1, 'File content is required'), // Base64 encoded
  contentType: z.string().optional(),
  isTemporary: z.boolean().optional().default(true), // 默认为临时文件
});

/**
 * Memos 相关的 tRPC 路由
 */
export const memosRouter = createTRPCRouter({
  /**
   * 获取所有 Memos（公开访问）
   */
  getAll: publicProcedure.query(async ({ ctx }) => {
    try {
      const allMemos = await fetchContent(['memo']);
      // 如果不是管理员，只返回公开的 Memo
      const filteredMemos = ctx.isAdmin ? allMemos : allMemos.filter((memo) => memo.public !== false);

      return filteredMemos.map((memo) => ({
        id: memo.id,
        slug: memo.slug,
        title: memo.title,
        content: memo.body,
        createdAt: memo.publishDate.toISOString(),
        updatedAt: memo.updateDate?.toISOString() || memo.publishDate.toISOString(),
        data: memo.raw?.data || {},
        isPublic: memo.public !== false, // 默认为 true
        attachments: memo.raw?.attachments || [],
        tags: memo.tags?.map((t) => t.title) || [],
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
      const memo = await webdavClient.createMemo(input.content, input.isPublic, input.attachments);

      return {
        id: memo.id,
        slug: memo.slug,
        title: memo.data.title || '无标题 Memo',
        content: memo.body,
        createdAt: memo.createdAt.toISOString(),
        updatedAt: memo.updatedAt.toISOString(),
        data: memo.data,
        attachments: memo.attachments || [],
        tags: memo.tags || [],
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

  /**
   * 上传 Memo 附件（仅管理员）
   */
  uploadAttachment: adminProcedure.input(UploadAttachmentSchema).mutation(async ({ input }) => {
    if (!isWebDAVEnabled()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'WebDAV is not enabled',
      });
    }

    try {
      const webdavClient = getWebDAVClient();

      // 解码 Base64 内容
      const buffer = Buffer.from(input.content, 'base64');
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

      // 上传附件（默认为临时文件）
      const attachmentPath = await webdavClient.uploadMemoAttachment(
        input.memoId,
        input.filename,
        arrayBuffer,
        input.contentType,
        input.isTemporary
      );

      // 检测文件类型
      const isImage = input.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(input.filename);

      return {
        filename: input.filename,
        path: attachmentPath,
        contentType: input.contentType,
        size: buffer.length,
        isImage,
      };
    } catch (error) {
      console.error('Failed to upload attachment:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to upload attachment',
      });
    }
  }),
});
