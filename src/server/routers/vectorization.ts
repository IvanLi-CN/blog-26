import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { config } from '~/lib/config';
import { getAllFileRecords } from '~/lib/db';
import { taskManager } from '~/lib/task-manager';
import type { VectorizationProgress } from '~/lib/vectorizer';
import { processAndVectorizeAllContent } from '~/lib/vectorizer';
import { adminProcedure, createTRPCRouter, publicProcedure } from '../trpc';

const getStatusSchema = z.object({
  slugs: z.array(z.string()).optional(),
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

      const statusObject: Record<string, 'correct' | 'mismatch' | 'notvectorized'> = {};

      filteredRecords.forEach((record) => {
        const dimension = record.vector ? (record.vector as Buffer).length / 4 : 0;
        if (record.modelName === modelName && dimension === modelDimension) {
          statusObject[record.slug] = 'correct';
        } else {
          statusObject[record.slug] = 'mismatch';
        }
      });

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

  // 开始向量化过程
  startVectorization: adminProcedure.mutation(() => {
    const taskId = nanoid();
    taskManager.create(taskId);

    // 异步执行，不阻塞返回
    (async () => {
      try {
        const onProgress = (progress: VectorizationProgress) => {
          taskManager.update(taskId, 'running', progress);
        };

        await processAndVectorizeAllContent(onProgress);

        taskManager.update(taskId, 'completed', {
          stage: 'done',
          message: '向量化过程成功完成',
        });
      } catch (error) {
        console.error(`Task ${taskId} failed:`, error);
        taskManager.update(taskId, 'failed', {
          stage: 'error',
          message: error instanceof Error ? error.message : '未知错误',
        });
      }
    })();

    return { taskId };
  }),

  // 获取向量化进度
  getProgress: adminProcedure
    .input(
      z.object({
        taskId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const task = taskManager.get(input.taskId);

      if (!task) {
        return {
          status: 'not_found',
          progress: {
            stage: 'error',
            message: `任务 ID ${input.taskId} 未找到`,
          },
        };
      }

      return task;
    }),
});
