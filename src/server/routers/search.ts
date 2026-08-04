import { z } from "zod";
import * as Search from "@/lib/ai/search";
import { createTRPCRouter, publicProcedure } from "../trpc";

export const aiSearchRouter = createTRPCRouter({
  semantic: publicProcedure
    .input(
      z.object({
        q: z.string().min(1),
        topK: z.number().min(1).max(100).optional(),
        type: z.enum(["all", "post", "memo"]).optional(),
        publishedOnly: z.boolean().optional(),
        model: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return Search.semantic(input);
    }),

  enhanced: publicProcedure
    .input(
      z.object({
        q: z.string().min(1),
        topK: z.number().min(1).max(100).optional(),
        rerankTopK: z.number().min(1).max(50).optional(),
        rerank: z.boolean().optional(),
        model: z.string().optional(),
        rerankerModel: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return Search.enhanced(input);
    }),
});

export const searchRouter = createTRPCRouter({
  ai: aiSearchRouter,
});
