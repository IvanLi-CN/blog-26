import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { z } from "zod";

test("performance probe only excludes the independent release matrix", () => {
  const workflow = z
    .object({
      on: z.object({ workflow_dispatch: z.object({ inputs: z.record(z.string(), z.unknown()) }) }),
      jobs: z.record(z.string(), z.object({ if: z.string().optional() })),
    })
    .parse(load(readFileSync(".github/workflows/ci.yml", "utf8")));
  expect(workflow.on.workflow_dispatch.inputs.performance_probe).toEqual({
    description: "Measure the complete CI workload without the independent release-version matrix",
    type: "boolean",
    default: false,
  });
  const affected = Object.entries(workflow.jobs)
    .filter(([, job]) => job.if?.includes("inputs.performance_probe"))
    .map(([name]) => name);
  expect(affected).toEqual(["frozen-product-smoke"]);
});
