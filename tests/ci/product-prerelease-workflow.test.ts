import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { z } from "zod";

const stepSchema = z.object({
  name: z.string().optional(),
  if: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});
const release = z
  .object({
    jobs: z.object({
      production: z.object({
        concurrency: z.object({ group: z.string(), "cancel-in-progress": z.boolean() }),
        steps: z.array(stepSchema),
      }),
    }),
  })
  .parse(load(readFileSync(".github/workflows/product-release.yml", "utf8")));

describe("prerelease workflow deployment boundary", () => {
  test("manual release exposes only one optional text version request", () => {
    const manual = z
      .object({
        on: z.object({
          workflow_dispatch: z.object({
            inputs: z.record(z.string(), z.object({ type: z.string(), required: z.boolean() })),
          }),
        }),
      })
      .parse(load(readFileSync(".github/workflows/manual-product-release.yml", "utf8")));
    expect(manual.on.workflow_dispatch.inputs).toEqual({
      version: { type: "string", required: false },
    });
  });
  test("prerelease publication receives no production deployment secrets", () => {
    const steps = release.jobs.production.steps;
    const publication = steps.find(
      (step) => step.run === "bun scripts/product-release.ts publish-prerelease"
    );
    const deployment = steps.find(
      (step) => step.run === "bun scripts/product-release.ts publish-stable"
    );
    expect(publication?.if).toContain("steps.identify.outputs.prerelease == 'true'");
    expect(deployment?.if).toContain("steps.identify.outputs.prerelease == 'false'");
    expect(deployment?.env?.EDGEONE_API_TOKEN).toBe("$" + "{{ secrets.EDGEONE_API_TOKEN }}");
    expect(
      steps.filter((step) => JSON.stringify(step).includes("secrets.EDGEONE_API_TOKEN"))
    ).toEqual([deployment]);
    expect(publication?.env?.EDGEONE_API_TOKEN).toBeUndefined();
    expect(release.jobs.production.concurrency).toMatchObject({
      group: "blog26-edgeone-production",
      "cancel-in-progress": false,
    });
  });
});
