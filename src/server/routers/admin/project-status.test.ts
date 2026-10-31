import { describe, expect, test } from "bun:test";
import type { TRPCError } from "@trpc/server";
import { PROJECT_STATUS_KEY } from "@/server/services/project-status";
import { queueProjectStatusCheck } from "./project-status";

describe("admin project status trigger", () => {
  test("queues a manual check on an initialized scheduler", async () => {
    const calls: Array<[string, "scheduler" | "manual"]> = [];
    const result = await queueProjectStatusCheck(() => ({
      getDefinition: () => ({ key: PROJECT_STATUS_KEY }),
      trigger: (...args) => calls.push(args),
    }));

    expect(result).toEqual({ success: true, queued: true, runKey: PROJECT_STATUS_KEY });
    expect(calls).toEqual([[PROJECT_STATUS_KEY, "manual"]]);
  });

  test("starts an uninitialized scheduler before reporting success", async () => {
    let started = false;
    const result = await queueProjectStatusCheck(
      () => ({ getDefinition: () => undefined, trigger: () => undefined }),
      async () => {
        started = true;
        return { getDefinition: () => undefined, trigger: () => undefined };
      }
    );

    expect(started).toBe(true);
    expect(result).toEqual({ success: true, queued: true, runKey: PROJECT_STATUS_KEY });
  });

  test("maps a scheduler conflict to a conflict error", async () => {
    await expect(
      queueProjectStatusCheck(() => ({
        getDefinition: () => ({ key: PROJECT_STATUS_KEY }),
        trigger: () => {
          throw new Error("Job is already running: project-entry-status");
        },
      }))
    ).rejects.toMatchObject<Partial<TRPCError>>({ code: "CONFLICT" });
  });
});
