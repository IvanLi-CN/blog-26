import { z } from "zod";
import type { GitHubRelease, ReleasePull } from "./github";
import {
  changeLedger,
  type LedgerStore,
  type ReleaseEntry,
  type ReleaseLedger,
  reserveRelease,
  updateRelease,
} from "./ledger";
import { compareVersions } from "./policy";
import { policyIdentity, sourceAssessment } from "./source";

export function releaseBranch(entry: ReleaseEntry): string {
  return `th/release-${entry.id.slice(0, 24)}`;
}

export function assertPreparation(github: GitHubRelease, entry: ReleaseEntry, sha: string): void {
  github.verifyBotCommit(sha);
  const commit = github.commit(sha);
  if (commit.parents.length !== 1 || commit.parents[0]?.sha !== entry.sourceSha)
    throw new Error("Preparation source parent changed");
  if (
    !commit.message.includes(`Release-Identity: ${entry.id}`) ||
    !commit.message.includes(`Policy-Digest: ${entry.policyDigest}`) ||
    !commit.message.includes(`Evidence-Digest: ${entry.evidenceDigest}`)
  )
    throw new Error("Preparation provenance is missing");
  const files = github.changedFiles(entry.sourceSha, sha);
  if (
    files.length !== 1 ||
    files[0] !== "VERSION" ||
    github.file("VERSION", sha) !== `${entry.version}\n`
  )
    throw new Error("Preparation must change only VERSION to the reserved value");
}

export function assertReleasePull(
  github: GitHubRelease,
  entry: ReleaseEntry,
  pull: ReleasePull
): void {
  if (
    pull.number !== entry.prNumber ||
    pull.head.sha !== entry.preparationHead ||
    pull.head.ref !== releaseBranch(entry) ||
    pull.head.repo?.full_name !== github.contract.repository ||
    pull.base.repo.full_name !== github.contract.repository ||
    pull.base.ref !== github.contract.branch ||
    pull.user.login !== `${github.botSlug}[bot]`
  )
    throw new Error("Release PR does not match its reserved provenance");
  assertPreparation(github, entry, pull.head.sha);
}

export function assertMerge(
  github: GitHubRelease,
  entry: ReleaseEntry,
  pull: ReleasePull,
  mergeSha: string
): void {
  assertReleasePull(github, entry, pull);
  if (!pull.merged || pull.merge_commit_sha !== mergeSha)
    throw new Error("Release PR was not merged at this source SHA");
  const commit = github.commit(mergeSha);
  if (
    !commit.verification.verified ||
    commit.parents.length !== 1 ||
    commit.parents[0]?.sha !== entry.sourceSha
  )
    throw new Error("Squash merge must preserve the verified exact source parent");
  const files = github.changedFiles(entry.sourceSha, mergeSha);
  if (
    files.length !== 1 ||
    files[0] !== "VERSION" ||
    github.file("VERSION", mergeSha) !== `${entry.version}\n`
  )
    throw new Error("Merged release tree differs from the approved preparation");
}

export function verifyTrustedTags(github: GitHubRelease, ledger: ReleaseLedger): void {
  const tags = github.canonicalTags();
  const bootstrap = tags.find((tag) => tag.version === ledger.bootstrap.version);
  if (bootstrap?.sha !== ledger.bootstrap.sourceSha)
    throw new Error("Approved bootstrap tag is absent or has a different source");
  for (const tag of tags) {
    if (tag.version === ledger.bootstrap.version) continue;
    const entry = ledger.entries.find((item) => item.version === tag.version);
    // Earlier tags do not supply a baseline; all tags above bootstrap need ledger provenance.
    if (
      compareVersions(tag.version, ledger.bootstrap.version) > 0 &&
      (!entry ||
        entry.mergeSha !== tag.sha ||
        !["frozen", "published", "deployed", "complete"].includes(entry.stage))
    )
      throw new Error("A canonical version is occupied by an unknown identity");
  }
}

export async function prepareRelease(
  github: GitHubRelease,
  store: LedgerStore,
  quality: unknown,
  actor: string,
  input: string,
  preparationRunId: number
): Promise<ReleaseEntry> {
  const sourceSha = github.reference(`heads/${github.contract.branch}`);
  if (!sourceSha) throw new Error("Default branch is missing");
  const initial = await store.read();
  verifyTrustedTags(github, initial.ledger);
  // Inspect closed PRs before reserving, so their versions are burned durably.
  for (const old of initial.ledger.entries.filter((entry) => entry.stage === "pr_open")) {
    if (!old.prNumber) throw new Error("Missing PR provenance");
    const pull = github.pull(old.prNumber);
    assertReleasePull(github, old, pull);
    if (pull.state === "closed" && !pull.merged)
      await changeLedger(store, (ledger) => ({
        ledger: updateRelease(ledger, old.id, { stage: "abandoned" }),
        result: null,
      }));
  }
  const current = await store.read();
  const existingRun = current.ledger.entries.find(
    (entry) => entry.preparationRunId === preparationRunId
  );
  const policyDigest = policyIdentity(github.contract, quality);
  if (
    existingRun &&
    (existingRun.actor !== actor ||
      existingRun.policyDigest !== policyDigest ||
      input !== existingRun.versionInput ||
      existingRun.stage === "abandoned")
  )
    throw new Error("Preparation retry cannot change its original identity");
  const assessment = existingRun ? undefined : sourceAssessment(current.ledger, sourceSha);
  const reserved =
    existingRun ||
    (await changeLedger(store, (ledger) => {
      if (!assessment) throw new Error("New preparation requires verified source evidence");
      const result = reserveRelease(ledger, {
        sourceSha,
        policyDigest,
        evidenceDigest: assessment.evidenceDigest,
        impact: assessment.impact,
        actor,
        version: input,
        preparationRunId,
      });
      return { ledger: result.ledger, result: result.entry };
    }));
  if (reserved.stage !== "reserved" && reserved.stage !== "pr_open") return reserved;
  if (reserved.prNumber) {
    const previous = github.pull(reserved.prNumber);
    assertReleasePull(github, reserved, previous);
    if (previous.merged) return reserved;
  }
  if (github.reference(`heads/${github.contract.branch}`) !== reserved.sourceSha)
    throw new Error("Main moved during preparation; preserve the reservation and prepare again");
  const branch = releaseBranch(reserved);
  let head = github.reference(`heads/${branch}`);
  if (!head) {
    github.createBranch(branch, reserved.sourceSha);
    head = reserved.sourceSha;
  }
  if (head === reserved.sourceSha) {
    head = github.createCommitOnBranch(
      branch,
      reserved.sourceSha,
      [{ path: "VERSION", content: `${reserved.version}\n` }],
      `chore(release): prepare v${reserved.version}\n\nRelease-Identity: ${reserved.id}\nPolicy-Digest: ${reserved.policyDigest}\nEvidence-Digest: ${reserved.evidenceDigest}`
    );
    assertPreparation(github, reserved, head);
  }
  assertPreparation(github, reserved, head);
  await changeLedger(store, (ledger) => ({
    ledger: updateRelease(ledger, reserved.id, { preparationHead: head }),
    result: null,
  }));
  const pulls = github.pages(
    `${github.root}/pulls?state=all&head=IvanLi-CN:${branch}&base=${github.contract.branch}&per_page=100`
  );
  if (pulls.length > 1) throw new Error("Multiple PRs claim the preparation branch");
  const raw =
    pulls[0] ||
    github.api(`${github.root}/pulls`, "POST", {
      title: `chore(release): prepare v${reserved.version}`,
      head: branch,
      base: github.contract.branch,
      body: `Prepare the static frontend and full-feature Docker image.\n\nRelease identity: ${reserved.id}\nSource: ${reserved.sourceSha}\nVerified impact: ${reserved.impact}\n\nOnly VERSION changes; required checks and branch protection govern merge.`,
    });
  const created = github.pull(z.object({ number: z.number().int().positive() }).parse(raw).number);
  const opened = await changeLedger(store, (ledger) => {
    const next = updateRelease(ledger, reserved.id, {
      preparationHead: head,
      prNumber: created.number,
      stage: "pr_open",
    });
    const entry = next.entries.find((item) => item.id === reserved.id);
    if (!entry) throw new Error("Lost reservation");
    return { ledger: next, result: entry };
  });
  const actual = github.pull(created.number);
  assertReleasePull(github, opened, actual);
  if (actual.merged) return opened;
  if (actual.state !== "open") throw new Error("Preparation PR is closed; reread its reservation");
  if (github.reference(`heads/${github.contract.branch}`) !== opened.sourceSha)
    throw new Error("Main moved before auto-merge; close this PR and issue a fresh request");
  github.transport.command([
    "pr",
    "merge",
    String(actual.number),
    "--repo",
    github.contract.repository,
    "--squash",
    "--auto",
    "--match-head-commit",
    actual.head.sha,
  ]);
  const confirmed = github.pull(actual.number);
  if (!confirmed.auto_merge && !confirmed.merged)
    throw new Error("Native auto-merge was not enabled");
  for (const workflow of ["ci.yml", "e2e.yml"] as const)
    github.dispatchEvaluation(workflow, branch, actual.head.sha);
  return opened;
}
