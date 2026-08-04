import { z } from "zod";
import * as Search from "@/lib/ai/search";
import { isSearchQueryWithinBudget } from "@/lib/search/query";
import { createTRPCRouter, publicProcedure } from "../trpc";

const searchQueryInput = z.string().refine(isSearchQueryWithinBudget, {
  message: "Search query exceeds the supported resource limits",
});

export const aiSearchRouter = createTRPCRouter({
  semantic: publicProcedure
    .input(
      z.object({
        q: searchQueryInput.min(1),
        topK: z.number().min(1).max(100).optional(),
        type: z.enum(["all", "post", "memo"]).optional(),
        model: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return Search.semantic({ ...input, publishedOnly: true });
    }),

  enhanced: publicProcedure
    .input(
      z.object({
        q: searchQueryInput.min(1),
        topK: z.number().min(1).max(100).optional(),
        rerankTopK: z.number().min(1).max(50).optional(),
        rerank: z.boolean().optional(),
        model: z.string().optional(),
        rerankerModel: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return Search.enhanced({ ...input, publishedOnly: true });
    }),
});

export const searchRouter = createTRPCRouter({
  ai: aiSearchRouter,
});
