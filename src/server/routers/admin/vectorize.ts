import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { vectorizeAll, vectorizeOneBySlug } from "@/lib/ai/vectorization";
import { ragCoverage } from "@/server/services/rag-index";
import { adminProcedure, createTRPCRouter } from "../../trpc";

type Progress = {
  status: "idle" | "running" | "completed" | "error";
  progress: number;
  currentStep?: string;
  processedItems: number;
  totalItems: number;
};

let currentProgress: Progress | null = null;

export const adminVectorizeRouter = createTRPCRouter({
  triggerVectorize: adminProcedure
    .input(
      z.object({
        isFull: z.boolean(),
        model: z.string().optional(),
        chunking: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        currentProgress = {
          status: "running",
          progress: 0,
          processedItems: 0,
          totalItems: 0,
          currentStep: "starting",
        };
        const result = await vectorizeAll({
          isFull: input.isFull,
          model: input.model,
          chunking: input.chunking,
        });
        currentProgress = {
          status: "completed",
          progress: 100,
          currentStep: "done",
          processedItems: result.stats.processed,
          totalItems: result.stats.total,
        };
        return { stats: result.stats, startedAt: Date.now(), finishedAt: Date.now() };
      } catch (error) {
        currentProgress = { status: "error", progress: 0, processedItems: 0, totalItems: 0 };
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (error as Error).message });
      }
    }),

  vectorizeBySlug: adminProcedure
    .input(
      z.object({
        slug: z.string().min(1),
        model: z.string().optional(),
        chunking: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const res = await vectorizeOneBySlug({
          slug: input.slug,
          model: input.model,
          chunking: input.chunking,
        });
        return res;
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (error as Error).message });
      }
    }),

  getVectorizeProgress: adminProcedure.query(async () => {
    return currentProgress;
  }),

  getVectorizationStats: adminProcedure.query(async () => {
    const { status } = await ragCoverage({ source: "blog" });
    return {
      indexed: status.available ? status.contents.indexed : null,
      outdated: status.available ? status.contents.outdated : null,
      unindexed: status.available ? status.contents.unindexed + status.contents.failed : null,
      lastIndexedAt: status.lastIndexedAt,
      model: status.identity.model ?? "",
      dim: status.identity.configuredDim,
      available: status.available,
      reason: status.reason,
    };
  }),
});
