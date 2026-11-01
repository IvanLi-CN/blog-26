import { describe, expect, test } from "bun:test";
import type { TRPCError } from "@trpc/server";
import { PROJECT_STATUS_KEY } from "@/server/services/project-status";
import { adminProjectStatusRouter, queueProjectStatusCheck } from "./project-status";

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
    const calls: Array<[string, "scheduler" | "manual"]> = [];
    const scheduler = {
      getDefinition: () => ({ key: PROJECT_STATUS_KEY }),
      trigger: (...args: [string, "scheduler" | "manual"]) => calls.push(args),
    };
    const result = await queueProjectStatusCheck(
      () => ({ getDefinition: () => undefined, trigger: () => undefined }),
      async () => {
        started = true;
        return scheduler;
      }
    );

    expect(started).toBe(true);
    expect(calls).toEqual([[PROJECT_STATUS_KEY, "manual"]]);
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

  test("rejects cross-origin admin trigger requests", async () => {
    const caller = adminProjectStatusRouter.createCaller({
      req: new Request("http://localhost/api/trpc", {
        headers: { origin: "https://evil.example" },
      }),
      resHeaders: new Headers(),
      user: { id: "admin", nickname: "admin", email: "admin@test.local" },
      isAdmin: true,
      clientAddress: "test",
    });

    await expect(caller.trigger()).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
  });
});
