import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { z } from "zod";
import releaseContract from "../../.github/release-contract.json";

const stepSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  if: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});
const release = z
  .object({
    on: z.object({
      workflow_dispatch: z.record(z.string(), z.unknown()),
      workflow_run: z.object({
        workflows: z.array(z.string()),
        types: z.array(z.string()),
        branches: z.array(z.string()),
      }),
    }),
    jobs: z.object({
      production: z.object({
        if: z.string(),
        "timeout-minutes": z.number(),
        concurrency: z.object({ group: z.string(), "cancel-in-progress": z.boolean() }),
        steps: z.array(stepSchema),
      }),
    }),
  })
  .parse(load(readFileSync(".github/workflows/product-release.yml", "utf8")));
const followup = z
  .object({
    on: z.object({
      workflow_dispatch: z.object({
        inputs: z.record(z.string(), z.object({ type: z.string(), required: z.boolean() })),
      }),
    }),
    jobs: z.object({
      followup: z.object({
        if: z.string(),
        "timeout-minutes": z.number(),
        concurrency: z.object({ group: z.string(), "cancel-in-progress": z.boolean() }).strict(),
        permissions: z.record(z.string(), z.string()),
      }),
    }),
  })
  .parse(load(readFileSync(".github/workflows/release-merge-followup.yml", "utf8")));
const cancelledRecovery = z
  .object({
    on: z.object({
      workflow_dispatch: z.object({
        inputs: z.object({
          release_id: z.object({ type: z.string(), required: z.boolean() }),
        }),
      }),
    }),
    jobs: z.object({
      abandon: z.object({
        "timeout-minutes": z.number(),
        permissions: z.record(z.string(), z.string()),
      }),
    }),
  })
  .parse(load(readFileSync(".github/workflows/abandon-cancelled-release.yml", "utf8")));
const failedInputsRecovery = z
  .object({
    on: z.object({
      workflow_dispatch: z.object({
        inputs: z.object({
          release_id: z.object({ type: z.string(), required: z.boolean() }),
          confirm_loss: z.object({ type: z.string(), required: z.boolean() }),
          incident_reason: z.object({ type: z.string(), required: z.boolean() }),
        }),
      }),
    }),
    jobs: z.object({
      abandon: z.object({
        "timeout-minutes": z.number(),
        permissions: z.record(z.string(), z.string()),
      }),
    }),
  })
  .parse(load(readFileSync(".github/workflows/abandon-failed-inputs-release.yml", "utf8")));
const failedEvaluationRecovery = z
  .object({
    on: z.object({
      workflow_dispatch: z.object({
        inputs: z.object({
          release_id: z.object({ type: z.string(), required: z.boolean() }),
          incident_reason: z.object({ type: z.string(), required: z.boolean() }),
        }),
      }),
    }),
    jobs: z.object({
      abandon: z.object({
        if: z.string(),
        "timeout-minutes": z.number(),
        permissions: z.record(z.string(), z.string()),
      }),
    }),
  })
  .parse(load(readFileSync(".github/workflows/abandon-failed-release-evaluation.yml", "utf8")));
const retryRecovery = z
  .object({
    on: z.object({
      workflow_dispatch: z.object({
        inputs: z.record(z.string(), z.object({ type: z.string(), required: z.boolean() })),
      }),
    }),
    permissions: z.record(z.string(), z.string()),
    jobs: z.object({
      retry: z.object({
        if: z.string(),
        "timeout-minutes": z.number(),
        permissions: z.record(z.string(), z.string()),
      }),
    }),
  })
  .parse(load(readFileSync(".github/workflows/retry-product-release.yml", "utf8")));
const bootstrapLedgerRecovery = readFileSync(
  ".github/workflows/bootstrap-release-ledger-recovery.yml",
  "utf8"
);

describe("prerelease workflow deployment boundary", () => {
  test("product release can be resumed from the uniquely registered merged identity", () => {
    expect(release.on.workflow_dispatch).toEqual({});
    expect(release.on.workflow_run).toEqual({
      workflows: ["CI/CD Pipeline", "E2E Tests"],
      types: ["completed"],
      branches: ["main"],
    });
    expect(release.jobs.production.if).toContain("github.event_name == 'workflow_dispatch'");
  });

  test("production release timeout matches the signed contract", () => {
    expect(release.jobs.production["timeout-minutes"]).toBe(releaseContract.releaseTimeoutMinutes);
    expect(release.jobs.production["timeout-minutes"]).toBe(360);
  });

  test("recovers artifacts before checking out the verified product source", () => {
    const steps = release.jobs.production.steps;
    const restoreIndex = steps.findIndex(
      (step) => step.run === "bun scripts/product-release.ts restore"
    );
    const sourceIndex = steps.findIndex(
      (step) => step.name === "Checkout the verified merged source"
    );
    expect(restoreIndex).toBeGreaterThanOrEqual(0);
    expect(sourceIndex).toBeGreaterThan(restoreIndex);
    expect(steps[restoreIndex]?.id).toBe("restore");
  });

  test("production freeze uses bounded parallel media downloads", () => {
    const freeze = release.jobs.production.steps.find(
      (step) => step.run === "bun scripts/product-release.ts freeze-inputs"
    );
    expect(freeze?.env?.PUBLIC_STATIC_MEDIA_DOWNLOAD_CONCURRENCY).toBe("2");
  });

  test("preflights frozen media before image packaging and records stable boundaries", () => {
    const steps = release.jobs.production.steps;
    const inputRecord = steps.findIndex((step) => step.id === "record-inputs");
    const preflight = steps.findIndex((step) => step.id === "preflight-media");
    const imageBuild = steps.findIndex((step) => step.id === "build-products");
    const compatibility = steps.findIndex((step) => step.id === "apply-preflight-playbook-tooling");
    expect(inputRecord).toBeGreaterThanOrEqual(0);
    expect(compatibility).toBeGreaterThan(inputRecord);
    expect(compatibility).toBeLessThan(preflight);
    expect(steps[compatibility]?.run).toContain("release-playbook-tooling/fixed");
    expect(steps[compatibility]?.run).toContain("package-public-media.ts");
    expect(steps[compatibility]?.run).toContain("release-inputs.ts");
    expect(steps[compatibility]?.run).toContain("site-lib-playbook.ts");
    expect(steps[compatibility]?.run).toContain("verify-playbook-artifact.ts");
    expect(preflight).toBeGreaterThan(inputRecord);
    expect(imageBuild).toBeGreaterThan(preflight);
    expect(steps[preflight]?.run).toContain("preflight-frozen-media");
    expect(steps[imageBuild]?.run).toContain("--use-preflight");
    expect(steps[preflight]?.name).toBe("Preflight frozen media closure");
    expect(steps[imageBuild]?.name).toBe(
      "Build the full-feature image from validated static output"
    );
  });

  test("retained Playbook verification supplies authenticated legacy file bytes", () => {
    const verifier = readFileSync("scripts/verify-playbook-artifact.ts", "utf8");
    expect(verifier).toContain("const rawFiles = new Map<string, Uint8Array>()");
    expect(verifier).toContain("rawFiles.set(file.path, bytes)");
    expect(verifier).toContain("    rawFiles,\n    { stripInternalMetadata: true }\n  );");
  });

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
    const deploymentSecretSteps = steps.filter((step) =>
      JSON.stringify(step).includes("secrets.EDGEONE_API_TOKEN")
    );
    expect(deploymentSecretSteps).toHaveLength(1);
    expect(deploymentSecretSteps[0]?.run).toBe(deployment?.run);
    expect(publication?.env?.EDGEONE_API_TOKEN).toBeUndefined();
    expect(release.jobs.production.concurrency).toMatchObject({
      group: "blog26-edgeone-production",
      "cancel-in-progress": false,
    });
  });

  test("release followup is explicitly dispatched with check publication permission", () => {
    expect(followup.on.workflow_dispatch.inputs).toEqual({
      release_id: { type: "string", required: true },
      pr_number: { type: "string", required: true },
      head_sha: { type: "string", required: true },
    });
    expect(followup.jobs.followup["timeout-minutes"]).toBe(90);
    expect(followup.jobs.followup.if).toBe("github.event_name == 'workflow_dispatch'");
    expect(followup.jobs.followup.concurrency).toEqual({
      group: "release-merge-followup",
      "cancel-in-progress": false,
    });
    expect(followup.jobs.followup.permissions).toMatchObject({
      actions: "write",
      checks: "write",
      "pull-requests": "read",
    });
  });

  test("cancelled release recovery is explicitly scoped to one release identity", () => {
    expect(cancelledRecovery.on.workflow_dispatch.inputs).toEqual({
      release_id: { type: "string", required: true },
    });
    expect(cancelledRecovery.jobs.abandon["timeout-minutes"]).toBe(20);
    expect(cancelledRecovery.jobs.abandon.permissions).toMatchObject({
      actions: "read",
      contents: "write",
    });
  });

  test("failed frozen-input recovery is explicitly scoped to one release identity", () => {
    expect(failedInputsRecovery.on.workflow_dispatch.inputs).toEqual({
      release_id: { type: "string", required: true },
      confirm_loss: { type: "boolean", required: true },
      incident_reason: { type: "string", required: true },
    });
    expect(failedInputsRecovery.jobs.abandon["timeout-minutes"]).toBe(20);
    expect(failedInputsRecovery.jobs.abandon.permissions).toMatchObject({
      actions: "read",
      contents: "write",
    });
  });

  test("failed preparation evaluation recovery requires exact failure evidence", () => {
    expect(failedEvaluationRecovery.on.workflow_dispatch.inputs).toEqual({
      release_id: { type: "string", required: true },
      incident_reason: { type: "string", required: true },
    });
    expect(failedEvaluationRecovery.jobs.abandon.if).toContain("refs/heads/main");
    expect(failedEvaluationRecovery.jobs.abandon["timeout-minutes"]).toBe(20);
    expect(failedEvaluationRecovery.jobs.abandon.permissions).toMatchObject({
      actions: "read",
      contents: "write",
      "pull-requests": "read",
    });
  });

  test("retry accepts only a release identity and reruns the original run", () => {
    expect(retryRecovery.on.workflow_dispatch.inputs).toEqual({
      release_id: { type: "string", required: true },
    });
    expect(retryRecovery.permissions).toEqual({ contents: "read", actions: "write" });
    expect(retryRecovery.jobs.retry.if).toContain("github.ref == 'refs/heads/main'");
    expect(retryRecovery.jobs.retry.permissions).toEqual({ contents: "read", actions: "write" });
  });

  test("ledger recovery validates the target before writing an immutable marker", () => {
    expect(bootstrapLedgerRecovery).toContain("legacyCommit.author?.login !== owner");
    expect(bootstrapLedgerRecovery).toContain('legacyCommit.committer?.login !== "web-flow"');
    expect(bootstrapLedgerRecovery).toContain(
      "legacyCommit.commit?.verification?.verified !== true"
    );
    expect(bootstrapLedgerRecovery).toContain(
      "legacy_sha must be on the root-bound release ledger ancestor chain"
    );
    expect(bootstrapLedgerRecovery).toContain("commit.parents.length !== 1");
    expect(bootstrapLedgerRecovery).toMatch(/Bootstrap-Source: \$\{bootstrapSource\}/);
    const validation = bootstrapLedgerRecovery.indexOf("const legacyCommit = await api");
    const mutation = bootstrapLedgerRecovery.indexOf("createCommitOnBranch");
    expect(validation).toBeGreaterThanOrEqual(0);
    expect(mutation).toBeGreaterThan(validation);
  });
});
