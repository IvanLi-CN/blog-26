import { describe, expect, test } from "bun:test";
import {
  classifyWorkflowFailure,
  failurePhases,
  recoveryOperation,
  releaseFailureSchema,
} from "../../src/lib/release/failure";

describe("product release failure classification", () => {
  test("maps stable workflow steps to the recovery phase contract", () => {
    const cases = [
      ["Freeze public build inputs under the production lock", "freeze_inputs"],
      ["Preflight frozen media closure", "preflight_media"],
      ["Build the full-feature image from validated static output", "build_products"],
      ["Verify production-mode frozen products", "verify_products"],
      [
        "Publish stable products, deploy the same static archive, then promote latest",
        "publish_stable",
      ],
    ] as const;
    for (const [name, phase] of cases)
      expect(
        classifyWorkflowFailure([
          {
            name: "production",
            status: "completed",
            conclusion: "failure",
            steps: [{ name, status: "completed", conclusion: "failure" }],
          },
        ])
      ).toEqual({ phase, step: name });
  });

  test("falls back to unknown without inventing a ledger stage", () => {
    expect(
      classifyWorkflowFailure([
        {
          name: "production",
          status: "completed",
          conclusion: "failure",
          steps: [
            { name: "Unrecognized release boundary", status: "completed", conclusion: "failure" },
          ],
        },
      ])
    ).toEqual({ phase: "unknown", step: "Unrecognized release boundary" });
    expect(failurePhases).toContain("unknown");
  });

  test("accepts legacy failure records and new step metadata", () => {
    expect(releaseFailureSchema.parse({ phase: "merged", runId: "7", attempt: 1 })).toEqual({
      phase: "merged",
      runId: "7",
      attempt: 1,
    });
    expect(
      releaseFailureSchema.parse({
        phase: "preflight_media",
        step: "Preflight frozen media closure",
        runId: "7",
        attempt: 2,
      })
    ).toMatchObject({ phase: "preflight_media", step: "Preflight frozen media closure" });
  });

  test("describes the recovery boundary from artifact state", () => {
    expect(
      recoveryOperation({ stage: "merged", inputs: undefined, products: undefined })
    ).toContain("pre-artifact");
    expect(
      recoveryOperation({
        stage: "merged",
        inputs: {
          runId: 7,
          artifactId: 10,
          artifactName: `release-${"a".repeat(64)}-inputs`,
          manifestDigest: "a".repeat(64),
          archiveDigest: `sha256:${"b".repeat(64)}`,
        },
        products: undefined,
      })
    ).toContain("emergency-abandon-only-after-input-artifact-loss");
    expect(recoveryOperation({ stage: "complete", inputs: undefined, products: undefined })).toBe(
      "none"
    );
  });
});
