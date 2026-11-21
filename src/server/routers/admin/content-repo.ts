import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { pushContentRepo, readContentRepoStatus } from "../../services/content-repo-sync";
import { adminProcedure, createTRPCRouter } from "../../trpc";

export const adminContentRepoRouter = createTRPCRouter({
  status: adminProcedure.query(() => readContentRepoStatus()),

  push: adminProcedure
    .input(
      z.object({
        ids: z.array(z.string().min(1)).max(200).optional(),
        all: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await pushContentRepo(input);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        const message = error instanceof Error ? error.message : "推送失败";
        if (message.includes("Task conflict:") || message.includes("already running"))
          throw new TRPCError({ code: "CONFLICT", message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),
});
