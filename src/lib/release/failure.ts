import { z } from "zod";
import type { ReleaseEntry } from "./ledger";

export const failurePhases = [
  "resolve",
  "restore",
  "freeze_inputs",
  "retain_inputs",
  "record_inputs",
  "preflight_media",
  "build_products",
  "verify_products",
  "retain_products",
  "record_products",
  "publish_prerelease",
  "publish_stable",
  "unknown",
] as const;
export type FailurePhase = (typeof failurePhases)[number];
export const failurePhaseSchema = z.enum(failurePhases);

// The phase is intentionally a string for old ledger entries whose phase was a
// ledger stage (for example, "merged"). New writes use failurePhases only.
export const releaseFailureSchema = z
  .object({
    phase: z.string().min(1),
    step: z.string().min(1).optional(),
    runId: z.string().regex(/^\d+$/),
    attempt: z.number().int().positive(),
  })
  .strict();

export type ReleaseFailure = z.infer<typeof releaseFailureSchema>;

const workflowStepSchema = z
  .object({
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
  })
  .passthrough();
const workflowJobSchema = z
  .object({
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    steps: z.array(workflowStepSchema).optional(),
  })
  .passthrough();

const stepPhase: Record<string, FailurePhase> = {
  "Resolve only registered release merges": "resolve",
  "Bind original release run": "resolve",
  "Restore immutable artifacts from the original run": "restore",
  "Checkout the verified merged source": "restore",
  "Install frozen dependencies": "restore",
  "Install frozen product dependencies": "restore",
  "Freeze public build inputs under the production lock": "freeze_inputs",
  "Retain frozen inputs for 90 days": "retain_inputs",
  "Bind frozen inputs": "record_inputs",
  "Install release Rust toolchain": "preflight_media",
  "Preflight frozen media closure": "preflight_media",
  "Prepare image builder": "build_products",
  "Build the full-feature image from validated static output": "build_products",
  "Verify production-mode frozen products": "verify_products",
  "Retain both immutable products for 90 days": "retain_products",
  "Bind immutable products": "record_products",
  "Publish prerelease products without deployment or latest promotion": "publish_prerelease",
  "Publish stable products, deploy the same static archive, then promote latest": "publish_stable",
};

function terminalFailure(conclusion: string | null, status: string): boolean {
  return (
    ["failure", "cancelled", "timed_out", "action_required"].includes(conclusion || "") ||
    (status === "completed" &&
      conclusion !== null &&
      conclusion !== "success" &&
      conclusion !== "skipped")
  );
}

export function classifyWorkflowFailure(rawJobs: unknown[]): {
  phase: FailurePhase;
  step: string;
} {
  const jobs = rawJobs.map((raw) => workflowJobSchema.parse(raw));
  for (const job of jobs) {
    for (const step of job.steps || []) {
      if (!terminalFailure(step.conclusion, step.status)) continue;
      return { phase: stepPhase[step.name] || "unknown", step: step.name };
    }
    if (terminalFailure(job.conclusion, job.status))
      return { phase: "unknown", step: job.name || "unknown" };
  }
  return { phase: "unknown", step: "unknown" };
}

export function recoveryOperation(
  entry: Pick<ReleaseEntry, "stage" | "inputs" | "products">
): string {
  if (entry.stage === "complete" || entry.stage === "abandoned") return "none";
  if (entry.inputs && !entry.products)
    return "retry-original-run; emergency-abandon-only-after-input-artifact-loss";
  if (!entry.inputs && !entry.products)
    return "retry-original-run; pre-artifact-abandon-remains-available";
  return "retry-original-run; preserve-frozen-artifacts";
}
