import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  acceptRemoteNew,
  checkContentRepo,
  mergeContentRepo,
  pullContentRepo,
  pushContentRepo,
  readContentRepoStatus,
  removeRemoteDeleted,
} from "../../services/content-repo-sync";
import { adminProcedure, createTRPCRouter } from "../../trpc";

export const adminContentRepoRouter = createTRPCRouter({
  status: adminProcedure.query(() => readContentRepoStatus()),

  check: adminProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).max(200).optional() }).optional())
    .query(({ input }) => checkContentRepo(input ?? {})),

  acceptRemote: adminProcedure
    .input(z.object({ paths: z.array(z.string().min(1)).max(200).optional() }).optional())
    .mutation(({ input }) => acceptRemoteNew(input ?? {})),

  removeRemoteDeleted: adminProcedure
    .input(z.object({ paths: z.array(z.string().min(1)).max(200).optional() }).optional())
    .mutation(({ input }) => removeRemoteDeleted(input ?? {})),

  merge: adminProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).max(200).optional() }).optional())
    .mutation(({ input }) => mergeContentRepo(input ?? {})),

  pull: adminProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).max(200).optional() }).optional())
    .mutation(({ input }) => pullContentRepo(input ?? {})),

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
