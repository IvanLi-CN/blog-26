import { TRPCError } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { config } from '~/lib/config';
import { getAllFileRecords } from '~/lib/db';
import type { VectorizationProgress } from '~/lib/vectorizer';
import { processAndVectorizeAllContent, processAndVectorizeBatchContent } from '~/lib/vectorizer';
import { adminProcedure, createTRPCRouter, publicProcedure } from '../trpc';

// 1. 创建一个事件发射器实例
const vectorizationEvents = new EventEmitter();

const getStatusSchema = z.object({
  slugs: z.array(z.string()).optional(),
});

const batchVectorizeSchema = z.object({
  slugs: z.array(z.string()),
});

export const vectorizationRouter = createTRPCRouter({
  // 获取向量化状态
  getStatus: publicProcedure.input(getStatusSchema.optional()).query(async ({ input }) => {
    try {
      const { modelName, dimension: modelDimension } = config.embedding;

      if (!modelName || !modelDimension) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Embedding model environment variables are not set.',
        });
      }

      const records = await getAllFileRecords();
      const requestedSlugs = input?.slugs || [];

      const filteredRecords =
        requestedSlugs.length > 0 ? records.filter((record) => requestedSlugs.includes(record.slug)) : records;

      const statusObject: Record<string, { status: 'correct' | 'mismatch' | 'notvectorized'; errorMessage?: string }> =
        {};

      filteredRecords.forEach((record) => {
        const dimension = record.vector ? (record.vector as Buffer).length / 4 : 0;
        if (record.modelName === modelName && dimension === modelDimension) {
          statusObject[record.slug] = { status: 'correct' };
        } else if (record.vector) {
          statusObject[record.slug] = { status: 'mismatch' };
        } else {
          // 没有向量数据，可能是向量化失败
          statusObject[record.slug] = {
            status: 'notvectorized',
            errorMessage: record.errorMessage || undefined,
          };
        }
      });

      if (requestedSlugs.length > 0) {
        const existingSlugs = filteredRecords.map((r) => r.slug);
        const missingSlugs = requestedSlugs.filter((slug) => !existingSlugs.includes(slug));

        missingSlugs.forEach((slug) => {
          statusObject[slug] = { status: 'notvectorized' };
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

  // 2. 将 startVectorization 更改为 mutation
  startVectorization: adminProcedure.mutation(async () => {
    // 在后台运行向量化，不阻塞 mutation 返回
    processAndVectorizeAllContent((progress) => {
      vectorizationEvents.emit('progress', progress);
    }).catch((error) => {
      console.error('Vectorization failed in background:', error);
      const message = error instanceof Error ? error.message : '未知错误';
      vectorizationEvents.emit('progress', {
        stage: 'error',
        message: `向量化失败: ${message}`,
      });
    });

    return { success: true, message: '向量化过程已启动' };
  }),

  // 批量向量化特定文章
  batchVectorize: adminProcedure.input(batchVectorizeSchema).mutation(async ({ input }) => {
    // 在后台运行批量向量化，不阻塞 mutation 返回
    processAndVectorizeBatchContent(input.slugs, (progress) => {
      vectorizationEvents.emit('progress', progress);
    }).catch((error) => {
      console.error('Batch vectorization failed in background:', error);
      const message = error instanceof Error ? error.message : '未知错误';
      vectorizationEvents.emit('progress', {
        stage: 'error',
        message: `批量向量化失败: ${message}`,
      });
    });

    return { success: true, message: `已启动 ${input.slugs.length} 篇文章的向量化过程` };
  }),

  // 3. 创建一个新的 onProgress subscription
  onProgress: publicProcedure.subscription(() => {
    return observable<VectorizationProgress>((emit) => {
      const onProgress = (progress: VectorizationProgress) => {
        emit.next(progress);
      };

      vectorizationEvents.on('progress', onProgress);

      // 清理函数
      return () => {
        vectorizationEvents.off('progress', onProgress);
      };
    });
  }),
});
