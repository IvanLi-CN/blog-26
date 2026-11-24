import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  acceptRemoteNew,
  adoptRemoteMedia,
  checkContentRepo,
  diffContentRepo,
  inspectContentMedia,
  readContentRepoStatus,
  readRemoteMedia,
  removeRemoteDeleted,
  retryContentRepoTask,
  saveResolvedContent,
  startContentRepoMerge,
  startContentRepoPull,
  startContentRepoPush,
} from "../../services/content-repo-sync";
import { readContentTaskProgress } from "../../services/content-tasks";
import { adminProcedure, createTRPCRouter } from "../../trpc";

export const adminContentRepoRouter = createTRPCRouter({
  status: adminProcedure.query(() => readContentRepoStatus()),

  media: adminProcedure
    .input(z.object({ path: z.string().min(1) }))
    .query(({ input }) => inspectContentMedia(input)),

  remoteMedia: adminProcedure
    .input(z.object({ sha: z.string().min(1), path: z.string().min(1) }))
    .query(({ input }) => readRemoteMedia(input)),

  adoptMedia: adminProcedure
    .input(z.object({ path: z.string().min(1), mediaPath: z.string().min(1) }))
    .mutation(({ input }) => adoptRemoteMedia(input)),

  resolve: adminProcedure
    .input(z.object({ path: z.string().min(1), text: z.string().min(1) }))
    .mutation(({ input }) => saveResolvedContent(input)),

  diff: adminProcedure
    .input(z.object({ path: z.string().min(1) }))
    .query(({ input }) => diffContentRepo(input)),

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
    .mutation(({ input }) => startContentRepoMerge(input ?? {})),

  pull: adminProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).max(200).optional() }).optional())
    .mutation(({ input }) => startContentRepoPull(input ?? {})),

  push: adminProcedure
    .input(
      z.object({
        ids: z.array(z.string().min(1)).max(200).optional(),
        all: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await startContentRepoPush(input);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        const message = error instanceof Error ? error.message : "推送失败";
        if (message.includes("Task conflict:") || message.includes("already running"))
          throw new TRPCError({ code: "CONFLICT", message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  retry: adminProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .mutation(({ input }) => retryContentRepoTask(input.taskId)),

  taskProgress: adminProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .query(async ({ input }) => {
      const progress = await readContentTaskProgress(input.taskId);
      if (!progress) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      return progress;
    }),
});
