import { readFileSync } from "node:fs";
import { z } from "zod";
import type { GitHubRelease } from "./github";
import {
  changeLedger,
  initialLedger,
  type LedgerStore,
  type ReleaseEntry,
  type ReleaseLedger,
  updateRelease,
} from "./ledger";
import { compareVersions, shaSchema } from "./policy";
import {
  assertMerge,
  assertReleasePull,
  assessReleaseSource,
  verifyTrustedTags,
} from "./preparation";
import { changedBlobs, gitFile, gitOutput, policyIdentity } from "./source";
import { isPrerelease } from "./version";

export const qualitySchema = z
  .object({
    schema_version: z.literal(1),
    policy: z
      .object({
        baseline_policy: z.literal("explicit-waiver-required"),
        require_signed_commits: z.literal(true),
        branch_protection: z
          .object({
            protected_branches: z.tuple([z.literal("main")]),
            require_pull_request: z.literal(true),
            disallow_direct_pushes: z.literal(true),
            strict: z.literal(true),
            enforce_admins: z.literal(true),
            allow_force_pushes: z.literal(false),
            allow_deletions: z.literal(false),
            required_approving_review_count: z.literal(0),
          })
          .strict(),
      })
      .strict(),
    required_checks: z.array(z.string().min(1)).min(1),
    main_required_checks: z.array(z.string().min(1)).min(1),
    informational_checks: z.array(z.string()),
    waivers: z.tuple([]),
    expected_pr_workflows: z.array(
      z.object({ workflow: z.string(), jobs: z.array(z.string()) }).strict()
    ),
  })
  .strict();
export type QualityPolicy = z.infer<typeof qualitySchema>;
export function readQuality(path = ".github/quality-gates.json"): QualityPolicy {
  const quality = qualitySchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const expected = quality.expected_pr_workflows.flatMap((workflow) => workflow.jobs);
  if (
    new Set(quality.required_checks).size !== quality.required_checks.length ||
    expected.length !== quality.required_checks.length ||
    expected.some((check) => !quality.required_checks.includes(check)) ||
    quality.main_required_checks.some((check) => !quality.required_checks.includes(check))
  )
    throw new Error("Quality check names are inconsistent");
  return quality;
}

const runSchema = z.object({
  id: z.number().int().positive(),
  workflow_id: z.number().int().positive(),
  run_attempt: z.number().int().positive(),
  head_sha: shaSchema,
  head_branch: z.string().nullable(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  path: z.string(),
  head_repository: z.object({ full_name: z.string() }),
});
export type WorkflowRun = z.infer<typeof runSchema>;

export function assertRunSource(
  github: GitHubRelease,
  run: WorkflowRun,
  sourceSha: string,
  workflowPath: string
): void {
  if (
    run.head_repository.full_name !== github.contract.repository ||
    !["push", "workflow_dispatch"].includes(run.event) ||
    run.head_branch !== github.contract.branch ||
    run.head_sha !== sourceSha ||
    run.path !== workflowPath
  )
    throw new Error("Workflow run is not a trusted main evaluation for this source");
}

export function mainChecksPassed(
  github: GitHubRelease,
  sourceSha: string,
  quality: QualityPolicy
): boolean {
  return evaluationChecksPassed(github, sourceSha, quality.main_required_checks, "main");
}

export function evaluationChecksPassed(
  github: GitHubRelease,
  sourceSha: string,
  required: string[],
  branch: string
): boolean {
  const checks = new Map<string, string | null>();
  for (const path of ["ci.yml", "e2e.yml"]) {
    const workflow = z
      .object({ id: z.number().int().positive(), path: z.string() })
      .parse(github.api(`${github.root}/actions/workflows/${path}`));
    const runs = github
      .pages(
        `${github.root}/actions/workflows/${workflow.id}/runs?branch=${encodeURIComponent(branch)}&head_sha=${sourceSha}&per_page=100`,
        "workflow_runs"
      )
      .map((raw) => runSchema.parse(raw))
      .filter((run) => ["push", "workflow_dispatch"].includes(run.event))
      .sort((a, b) => b.id - a.id);
    const selected = runs[0];
    if (!selected) return false;
    if (
      selected.head_repository.full_name !== github.contract.repository ||
      selected.head_branch !== branch ||
      selected.head_sha !== sourceSha ||
      selected.path !== `.github/workflows/${path}`
    )
      throw new Error("Required evaluation has an untrusted source");
    if (selected.workflow_id !== workflow.id) throw new Error("Workflow identity changed");
    if (selected.status !== "completed") return false;
    if (selected.conclusion !== "success")
      throw new Error("Required main evaluation failed; retry its original CI run");
    const jobs = github.pages(
      `${github.root}/actions/runs/${selected.id}/attempts/${selected.run_attempt}/jobs?per_page=100`,
      "jobs"
    );
    for (const raw of jobs) {
      const job = z
        .object({
          name: z.string(),
          head_sha: shaSchema,
          status: z.string(),
          conclusion: z.string().nullable(),
        })
        .parse(raw);
      if (job.head_sha !== sourceSha) throw new Error("Required job has a different source SHA");
      if (checks.has(job.name)) throw new Error("Required check names must identify a unique job");
      checks.set(job.name, job.status === "completed" ? job.conclusion : null);
    }
  }
  return required.every((name) => checks.get(name) === "success");
}

export async function resolveCompletedRelease(
  github: GitHubRelease,
  store: LedgerStore,
  quality: QualityPolicy,
  triggeringRun: unknown,
  releaseRunId: number,
  bind = true
): Promise<ReleaseEntry | undefined> {
  const run = runSchema.parse(triggeringRun);
  if (
    !["push", "workflow_dispatch"].includes(run.event) ||
    run.head_branch !== "main" ||
    run.head_repository.full_name !== github.contract.repository ||
    ![".github/workflows/ci.yml", ".github/workflows/e2e.yml"].includes(run.path)
  )
    return undefined;
  if (!github.reference(`heads/${github.contract.ledgerBranch}`)) return undefined;
  const current = await store.read();
  let matched: ReleaseEntry | undefined;
  for (const entry of current.ledger.entries) {
    if (entry.mergeSha === run.head_sha) {
      matched = entry;
      break;
    }
    if (entry.stage === "pr_open" && entry.prNumber) {
      const pull = github.pull(entry.prNumber);
      if (pull.merged && pull.merge_commit_sha === run.head_sha) {
        assertMerge(github, entry, pull, run.head_sha);
        matched = entry;
        break;
      }
    }
  }
  if (!matched || matched.stage === "complete") return undefined;
  if (matched.policyDigest !== policyIdentity(github.contract, quality))
    throw new Error("Release policy changed; cannot reinterpret the original identity");
  if (matched.releaseRunId && matched.releaseRunId !== releaseRunId) return undefined;
  verifyTrustedTags(github, current.ledger);
  if (!matched.prNumber) throw new Error("Release PR proof is missing");
  assertMerge(github, matched, github.pull(matched.prNumber), run.head_sha);
  if (!mainChecksPassed(github, run.head_sha, quality)) return undefined;
  if (matched.stage !== "pr_open") return matched;
  if (!bind) return { ...matched, stage: "merged", mergeSha: run.head_sha, releaseRunId };
  const original = matched;
  return changeLedger(store, (ledger) => {
    const updated = updateRelease(ledger, original.id, {
      stage: "merged",
      mergeSha: run.head_sha,
      releaseRunId,
    });
    return { ledger: updated, result: updated.entries.find((entry) => entry.id === original.id) };
  });
}

async function readPolicyLedger(github: GitHubRelease, store: LedgerStore): Promise<ReleaseLedger> {
  if (!github.reference(`heads/${github.contract.ledgerBranch}`))
    return initialLedger(github.contract);
  try {
    return (await store.read()).ledger;
  } catch (error) {
    const recovered = await store.read({ allowLegacyHead: true, allowLegacyAncestor: true });
    if (!recovered.legacySha) throw error;
    return recovered.ledger;
  }
}

export async function validateCandidatePolicy(
  github: GitHubRelease,
  store: LedgerStore,
  quality: QualityPolicy,
  event: unknown,
  eventName: string,
  candidateSha: string
): Promise<string> {
  const raw = z
    .object({ pull_request: z.object({ number: z.number().int().positive() }).optional() })
    .parse(event);
  let pull = raw.pull_request ? github.pull(raw.pull_request.number) : undefined;
  const head = pull?.head.sha || shaSchema.parse(candidateSha);
  const parent = gitOutput(["rev-parse", `${head}^`]).trim();
  const pullBase = pull
    ? z
        .object({ base: z.object({ sha: shaSchema }) })
        .parse(github.api(`${github.root}/pulls/${pull.number}`)).base.sha
    : parent;
  const direct = changedBlobs(pullBase, head);
  const versionOnly = Object.keys(direct).length === 1 && Object.hasOwn(direct, "VERSION");
  if (versionOnly) {
    // PR creation and its durable PR-number write are separate server operations.
    // Wait only for that already-reserved preparation; never waive its provenance.
    let ledger = await readPolicyLedger(github, store);
    if (!pull && eventName === "workflow_dispatch") {
      const prepared = ledger.entries.find(
        (item) => item.preparationHead === head && item.prNumber
      );
      if (prepared?.prNumber) pull = github.pull(prepared.prNumber);
    }
    let entry = ledger.entries.find((item) =>
      pull ? item.preparationHead === head : item.mergeSha === head
    );
    for (let attempt = 0; pull && !entry?.prNumber && attempt < 12; attempt++) {
      await new Promise((done) => setTimeout(done, 5000));
      ledger = await readPolicyLedger(github, store);
      entry = ledger.entries.find((item) => item.preparationHead === head);
    }
    if (!entry && !pull && ["push", "workflow_dispatch"].includes(eventName)) {
      for (const item of ledger.entries.filter((item) => item.prNumber)) {
        const linked = github.pull(item.prNumber || 0);
        if (linked.merged && linked.merge_commit_sha === head) {
          entry = item;
          break;
        }
      }
    }
    if (!entry?.prNumber || entry.policyDigest !== policyIdentity(github.contract, quality))
      throw new Error("VERSION-only change has no valid durable preparation");
    const linked = pull || github.pull(entry.prNumber);
    if (pull) {
      assertReleasePull(github, entry, linked);
      if (linked.state !== "open" || github.reference("heads/main") !== entry.sourceSha)
        throw new Error("Release source moved before merge");
    } else assertMerge(github, entry, linked, head);
    const reserved = entry;
    const assessment = assessReleaseSource(
      github,
      {
        ...ledger,
        entries: ledger.entries.filter(
          (item) =>
            isPrerelease(item.version) ||
            compareVersions(item.version, reserved.baselineVersion) <= 0
        ),
      },
      reserved.sourceSha
    );
    if (assessment.evidenceDigest !== entry.evidenceDigest || assessment.impact !== entry.impact)
      throw new Error("Reserved semantic evidence no longer matches its source");
    return `Verified release identity ${entry.id}`;
  }
  if (Object.hasOwn(direct, "VERSION")) {
    const previous = gitFile(pullBase, "VERSION");
    if (
      previous !== undefined ||
      gitFile(head, "VERSION") !== `${github.contract.bootstrap.version}\n`
    )
      throw new Error("Ordinary changes cannot modify VERSION; use Manual Product Release");
  }
  const assessment = assessReleaseSource(github, await readPolicyLedger(github, store), head);
  return `Verified ${assessment.impact} impact for ${Object.keys(assessment.changed).length} source changes`;
}
