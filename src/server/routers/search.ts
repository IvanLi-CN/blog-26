import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as Search from "@/lib/ai/search";
import { ContentSearchError } from "@/lib/search/native-query";
import { isSearchQueryWithinBudget } from "@/lib/search/query";
import { contentSearchInputSchema, executeContentModes } from "@/server/services/content-search";
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
        q: z.string().min(1).max(8192),
        topK: z.number().int().min(1).max(100).optional(),
        rerankTopK: z.number().int().min(1).max(50).optional(),
        rerank: z.boolean().optional(),
        model: z.string().optional(),
        rerankerModel: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        return await Search.enhanced({ ...input, publishedOnly: true });
      } catch (error) {
        if (error instanceof ContentSearchError)
          throw new TRPCError({ code: error.code, message: error.message });
        throw error;
      }
    }),
});

export const searchRouter = createTRPCRouter({
  ai: aiSearchRouter,
  content: publicProcedure.input(contentSearchInputSchema).query(async ({ input }) => {
    try {
      return await executeContentModes(input, { publishedOnly: true });
    } catch (error) {
      if (error instanceof ContentSearchError)
        throw new TRPCError({ code: error.code, message: error.message });
      throw error;
    }
  }),
});
