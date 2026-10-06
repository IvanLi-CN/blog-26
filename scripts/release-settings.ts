import { z } from "zod";
import { readQuality } from "../src/lib/release/completion";
import { GitHubRelease } from "../src/lib/release/github";
import { readContract } from "../src/lib/release/source";

const contract = readContract();
const quality = readQuality();
const github = new GitHubRelease(contract, "github-actions");
const apply = process.argv.includes("--apply");
const prefix = `${github.root}/branches/main/protection`;
if (apply) {
  const main = z
    .object({ commit: z.object({ sha: z.string() }) })
    .parse(github.api(`${github.root}/branches/main`));
  const checks = github
    .pages(`${github.root}/commits/${main.commit.sha}/check-runs?per_page=100`, "check_runs")
    .map((raw) => z.object({ app: z.object({ id: z.number(), slug: z.string() }) }).parse(raw));
  const actions = checks.find((check) => check.app.slug === "github-actions")?.app;
  if (!actions)
    throw new Error("Cannot bind required checks to the repository's actual GitHub Actions App");
  github.api(github.root, "PATCH", { allow_auto_merge: true });
  github.api(`${github.root}/actions/permissions/workflow`, "PUT", {
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: true,
  });
  github.api(prefix, "PUT", {
    required_status_checks: {
      strict: true,
      checks: quality.required_checks.map((context) => ({ context, app_id: actions.id })),
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      required_approving_review_count: 0,
      require_last_push_approval: false,
    },
    restrictions: null,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: false,
    lock_branch: false,
    allow_fork_syncing: false,
  });
  github.api(`${prefix}/required_signatures`, "POST");
}
const repo = z.object({ allow_auto_merge: z.boolean() }).parse(github.api(github.root));
const workflowPermissions = z
  .object({
    default_workflow_permissions: z.string(),
    can_approve_pull_request_reviews: z.boolean(),
  })
  .parse(github.api(`${github.root}/actions/permissions/workflow`));
const protection = z
  .object({
    required_status_checks: z.object({
      strict: z.boolean(),
      checks: z.array(z.object({ context: z.string(), app_id: z.number() })),
    }),
    enforce_admins: z.object({ enabled: z.boolean() }),
    required_pull_request_reviews: z.object({
      required_approving_review_count: z.number(),
      bypass_pull_request_allowances: z
        .object({
          users: z.array(z.unknown()),
          teams: z.array(z.unknown()),
          apps: z.array(z.unknown()),
        })
        .optional(),
    }),
    allow_force_pushes: z.object({ enabled: z.boolean() }),
    allow_deletions: z.object({ enabled: z.boolean() }),
  })
  .parse(github.api(prefix));
const signatures = z
  .object({ enabled: z.boolean() })
  .parse(github.api(`${prefix}/required_signatures`));
const actual = protection.required_status_checks.checks.map((check) => check.context).sort();
const bypass = protection.required_pull_request_reviews.bypass_pull_request_allowances;
if (
  !repo.allow_auto_merge ||
  workflowPermissions.default_workflow_permissions !== "read" ||
  !workflowPermissions.can_approve_pull_request_reviews ||
  !protection.required_status_checks.strict ||
  !protection.enforce_admins.enabled ||
  !signatures.enabled ||
  protection.allow_force_pushes.enabled ||
  protection.allow_deletions.enabled ||
  protection.required_pull_request_reviews.required_approving_review_count !== 0 ||
  actual.join("\n") !== [...quality.required_checks].sort().join("\n") ||
  protection.required_status_checks.checks.some((check) => check.app_id <= 0) ||
  (bypass && Object.values(bypass).some((identities) => identities.length))
)
  throw new Error("Repository release protection does not match the approved contract");
console.log(
  JSON.stringify(
    {
      repository: contract.repository,
      allowAutoMerge: true,
      actionsCanCreatePullRequests: true,
      defaultActionsPermissions: "read",
      strictUpToDate: true,
      verifiedCommits: true,
      administratorsConstrained: true,
      appBypass: false,
      requiredChecks: actual,
    },
    null,
    2
  )
);
