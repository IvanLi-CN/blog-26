import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { config } from '~/lib/config';
import { getAllFileRecords } from '~/lib/db';
import type { VectorizationProgress } from '~/lib/vectorizer';
import { processAndVectorizeAllContent } from '~/lib/vectorizer';
import { adminProcedure, createTRPCRouter, publicProcedure } from '../trpc';

// 输入验证 schemas
const getStatusSchema = z.object({
  slugs: z.array(z.string()).optional(),
});

export type VectorizationStatus = {
  slug: string;
  status: 'correct' | 'mismatch' | 'notvectorized';
};

export const vectorizationRouter = createTRPCRouter({
  // 获取向量化状态
  getStatus: publicProcedure.input(getStatusSchema.optional()).query(async ({ input }) => {
    try {
      const { modelName } = config.embedding;
      const { dimension: modelDimension } = config.embedding;

      if (!modelName || !modelDimension) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Embedding model environment variables are not set.',
        });
      }

      const records = await getAllFileRecords();
      const requestedSlugs = input?.slugs || [];

      // 如果指定了 slugs 参数，只返回这些文章的状态
      const filteredRecords =
        requestedSlugs.length > 0 ? records.filter((record) => requestedSlugs.includes(record.slug)) : records;

      const statusObject: Record<string, string> = {};

      // 处理存在的记录
      filteredRecords.forEach((record) => {
        const dimension = record.vector ? (record.vector as Buffer).length / 4 : 0;
        if (record.modelName === modelName && dimension === modelDimension) {
          statusObject[record.slug] = 'correct';
        } else {
          statusObject[record.slug] = 'mismatch';
        }
      });

      // 对于请求的但不存在的 slugs，返回 notvectorized 状态
      if (requestedSlugs.length > 0) {
        const existingSlugs = filteredRecords.map((r) => r.slug);
        const missingSlugs = requestedSlugs.filter((slug) => !existingSlugs.includes(slug));

        missingSlugs.forEach((slug) => {
          statusObject[slug] = 'notvectorized';
        });
      }

      return statusObject;
    } catch (error) {
      console.error('Error fetching vectorization status:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch vectorization status.',
      });
    }
  }),

  // 开始向量化过程（仅管理员）
  startVectorization: adminProcedure.mutation(async () => {
    try {
      console.log('触发向量化 API...');

      // 注意：tRPC 不直接支持流式响应
      // 这里我们收集所有进度信息并返回最终结果
      const progressLog: VectorizationProgress[] = [];

      const sendProgress = (progress: VectorizationProgress) => {
        progressLog.push(progress);
        console.log('向量化进度:', progress);
      };

      sendProgress({ stage: 'info', message: '向量化过程开始' });

      // 调用主向量化函数并传入进度回调
      await processAndVectorizeAllContent(sendProgress);

      console.log('向量化 API 完成.');
      sendProgress({ stage: 'done', message: '向量化过程成功完成' });

      return {
        success: true,
        message: '向量化过程成功完成',
        progressLog,
      };
    } catch (error) {
      console.error('向量化 API 过程出错:', error);
      const errorMessage = error instanceof Error ? error.message : '向量化 API 过程出错';

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: errorMessage,
      });
    }
  }),

  // 获取向量化进度（流式，但在 tRPC 中我们返回当前状态）
  getProgress: adminProcedure.query(async () => {
    // 这里可以实现一个简单的进度查询
    // 由于 tRPC 不支持 SSE，我们返回当前状态
    try {
      const records = await getAllFileRecords();
      const { modelName, dimension: modelDimension } = config.embedding;

      if (!modelName || !modelDimension) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Embedding model configuration not found.',
        });
      }

      const totalFiles = records.length;
      const vectorizedFiles = records.filter((record) => {
        const dimension = record.vector ? (record.vector as Buffer).length / 4 : 0;
        return record.modelName === modelName && dimension === modelDimension;
      }).length;

      return {
        total: totalFiles,
        vectorized: vectorizedFiles,
        percentage: totalFiles > 0 ? Math.round((vectorizedFiles / totalFiles) * 100) : 0,
        status: vectorizedFiles === totalFiles ? 'completed' : 'in_progress',
      };
    } catch (error) {
      console.error('Error getting vectorization progress:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get vectorization progress.',
      });
    }
  }),
});
