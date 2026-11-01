import { expect, it } from "bun:test";
import { jobDefinitions } from "@/server/jobs/definitions";

it("schedules AI usage maintenance through the canonical runner", () => {
  const definition = jobDefinitions.find((job) => job.key === "ai-usage-maintenance");

  expect(definition).toMatchObject({
    key: "ai-usage-maintenance",
    schedule: { kind: "dailyAt", hour: 2, minute: 0 },
  });
  expect(definition?.run).toBeFunction();
});
